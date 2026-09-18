const crypto = require('crypto');
const { env } = require('../config/env');

function isConfiguredForSend() {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

function verifyMetaSignature(rawBody, signatureHeader) {
  const appSecret = String(env.WHATSAPP_APP_SECRET || '').trim();
  if (!appSecret) return env.NODE_ENV !== 'production';
  if (!rawBody || !signatureHeader) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')}`;

  const actual = String(signatureHeader || '').trim();
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function graphBaseUrl() {
  const version = String(env.WHATSAPP_GRAPH_API_VERSION || 'v26.0').replace(/^\/?/, '');
  return `https://graph.facebook.com/${version}`;
}

async function sendTextMessage(to, body, options = {}) {
  if (!isConfiguredForSend()) {
    return { sent: false, skipped: true, reason: 'whatsapp_send_not_configured' };
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(to || '').replace(/\D/g, ''),
    type: 'text',
    text: {
      preview_url: false,
      body: String(body || '').slice(0, 4096),
    },
  };

  if (options.replyToMessageId) {
    payload.context = { message_id: String(options.replyToMessageId) };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(`${graphBaseUrl()}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `WhatsApp Cloud API request failed (${response.status})`);
    error.status = response.status;
    error.meta = data?.error || data;
    throw error;
  }

  return {
    sent: true,
    messageId: data?.messages?.[0]?.id || '',
    data,
  };
}

async function sendTemplateMessage(to, templateName, languageCode, components = []) {
  if (!isConfiguredForSend()) {
    return { sent: false, skipped: true, reason: 'whatsapp_send_not_configured' };
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(to || '').replace(/\D/g, ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode || 'en' },
      ...(components.length ? { components } : {}),
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(`${graphBaseUrl()}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `WhatsApp Cloud API request failed (${response.status})`);
    error.status = response.status;
    error.meta = data?.error || data;
    throw error;
  }

  return { sent: true, messageId: data?.messages?.[0]?.id || '', data };
}

async function sendOtpMessage({ to, code, purpose }) {
  const templateName = String(env.WHATSAPP_OTP_TEMPLATE_NAME || '').trim();
  if (templateName) {
    const expiryMinutes = Math.max(1, Math.round(Number(env.OTP_TTL_SECONDS || 300) / 60));

    // Construct components: login_otp1 template requires body params (code, expiry) and button url param (code)
    const multiParamComponents = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: String(code) },
          { type: 'text', text: String(expiryMinutes) },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: String(code) }],
      },
    ];

    try {
      return await sendTemplateMessage(
        to,
        templateName,
        env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || 'en_US',
        multiParamComponents,
      );
    } catch (err) {
      // Fallback for single-parameter templates if multi-param fails
      if (err?.meta?.error_data?.details?.includes('does not match') || err?.status === 400) {
        try {
          return await sendTemplateMessage(
            to,
            templateName,
            env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || 'en_US',
            [
              {
                type: 'body',
                parameters: [{ type: 'text', text: String(code) }],
              },
            ],
          );
        } catch (_) {
          throw err;
        }
      }
      throw err;
    }
  }

  // Free-form WhatsApp messages are only reliably allowed inside the customer
  // service window. Keep this fallback for development/manual testing; production
  // should configure an approved authentication template.
  if (env.NODE_ENV === 'production') {
    return { sent: false, skipped: true, reason: 'whatsapp_otp_template_not_configured' };
  }

  return sendTextMessage(
    to,
    `Your Dvaari verification code is ${code}. It expires soon. Do not share this code.`,
    { purpose },
  );
}

function extractWebhookEvents(body = {}) {
  const events = [];
  if (body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return events;

  for (const entry of body.entry) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      const metadata = value.metadata || {};

      for (const message of value.messages || []) {
        events.push({
          kind: 'message',
          entryId: entry.id || '',
          phoneNumberId: metadata.phone_number_id || '',
          displayPhoneNumber: metadata.display_phone_number || '',
          contact: (value.contacts || []).find(c => c.wa_id === message.from) || value.contacts?.[0] || null,
          message,
          rawValue: value,
        });
      }

      for (const status of value.statuses || []) {
        events.push({
          kind: 'status',
          entryId: entry.id || '',
          phoneNumberId: metadata.phone_number_id || '',
          displayPhoneNumber: metadata.display_phone_number || '',
          status,
          rawValue: value,
        });
      }
    }
  }
  return events;
}

function messageText(message = {}) {
  if (message.type === 'text') return String(message.text?.body || '').trim();
  if (message.type === 'button') return String(message.button?.text || message.button?.payload || '').trim();
  if (message.type === 'interactive') {
    return String(
      message.interactive?.button_reply?.title ||
      message.interactive?.button_reply?.id ||
      message.interactive?.list_reply?.title ||
      message.interactive?.list_reply?.id ||
      ''
    ).trim();
  }
  return '';
}

module.exports = {
  isConfiguredForSend,
  verifyMetaSignature,
  sendTextMessage,
  sendTemplateMessage,
  sendOtpMessage,
  extractWebhookEvents,
  messageText,
};
