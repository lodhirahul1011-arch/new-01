const nodemailer = require('nodemailer');
const { env } = require('../config/env');
const { safeLog } = require('../utils/logger');
const sendSMSViaNewProvider = require('./smsService');

function shouldAllowConsoleFallback() {
  return env.OTP_CONSOLE_FALLBACK || env.NODE_ENV !== 'production';
}

function shouldDebugLogOtp() {
  return env.OTP_DEBUG_LOG_ENABLED || env.NODE_ENV !== 'production';
}

function logConsoleOtp({ channel, to, code, purpose, reason }) {
  console.log(
    `[DEV OTP FALLBACK] purpose=${purpose} channel=${channel} to=${to} code=${code} reason=${reason}`,
  );
  return { ok: true, provider: 'console_fallback' };
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isPhone(v) {
  return /^\+\d{8,15}$/.test(v);
}

function isSuccessResponse(data) {
  if (!data) return false;
  if (typeof data === 'string') {
    return /(success|sent|queued|ok|accepted)/i.test(data) && !/(invalid|error|failed|reject)/i.test(data);
  }

  const fields = [
    data.Status,
    data.status,
    data.type,
    data.message,
    data.Message,
    data.response,
    data.Response,
    data.Details,
    data.details,
    data.description,
  ].filter(Boolean);

  return fields.some((value) => /(success|sent|queued|ok|accepted|submitted)/i.test(String(value)))
    && !fields.some((value) => /(invalid|error|failed|reject)/i.test(String(value)));
}

function extractProviderError(data) {
  if (!data) return 'SMS provider failed';
  if (typeof data === 'string') return data;

  const fields = [
    data.Details,
    data.details,
    data.message,
    data.Message,
    data.error,
    data.ErrorMessage,
    data.response,
    data.Response,
    data.description,
  ].filter(Boolean);

  return fields[0] ? String(fields[0]) : 'SMS provider failed';
}

let transporter = null;
let mailProvider = null;

function getMailer() {
  if (transporter) return transporter;

  const hasSmtpConfig = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const hasSendGridConfig = !!(env.SENDGRID_API_KEY && env.SENDGRID_FROM);

  if (!hasSmtpConfig && !hasSendGridConfig) {
    if (shouldAllowConsoleFallback()) {
      return null;
    }
    throw new Error('Email credentials missing. Configure SMTP_* or SENDGRID_API_KEY + SENDGRID_FROM');
  }

  if (hasSmtpConfig) {
    mailProvider = 'smtp';
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    return transporter;
  }

  mailProvider = 'sendgrid';
  transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
      user: 'apikey',
      pass: env.SENDGRID_API_KEY,
    },
  });

  return transporter;
}

async function sendSmsOtp({ to, code }) {
  if (!process.env.SMS_BASE_URL || !process.env.SMS_API_KEY || !process.env.SMS_SENDER_ID || !process.env.SMS_TEMPLATE_ID) {
    if (shouldAllowConsoleFallback()) {
      return null;
    }
    throw new Error('SMS provider env missing (SMS_BASE_URL, SMS_API_KEY, SMS_SENDER_ID, SMS_TEMPLATE_ID)');
  }

  const data = await sendSMSViaNewProvider(to, code);

  if (!isSuccessResponse(data)) {
    throw new Error(extractProviderError(data));
  }

  safeLog('[OTP][SMS]', 'sent_via_new_provider', { to });
  return data;
}

async function sendEmailOtp({ to, code, purpose }) {
  const mailer = getMailer();
  if (!mailer) {
    return null;
  }

  const subject =
    purpose === 'register'
      ? 'Verify your account'
      : 'Your login verification code';

  const html = `
    <div style="font-family:Arial,sans-serif">
      <h2>Your Verification Code</h2>
      <p>Your OTP code is:</p>
      <h1>${code}</h1>
      <p>This code will expire in ${env.OTP_TTL_SECONDS / 60} minutes.</p>
    </div>
  `;

  const info = await mailer.sendMail({
    from: process.env.SMTP_FROM || env.SENDGRID_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
  });

  safeLog('[OTP][EMAIL]', 'provider_response', {
    to,
    provider: mailProvider || 'smtp',
    messageId: info && info.messageId ? info.messageId : undefined,
  });

  return info;
}

async function sendOtp({ channel, to, code, purpose }) {
  try {
    if (shouldDebugLogOtp()) {
      console.log(`[OTP DEBUG] purpose=${purpose} channel=${channel} to=${to} code=${code}`);
    }

    if (channel === 'sms' || isPhone(to)) {
      const data = await sendSmsOtp({ to, code });
      if (!data) {
        return logConsoleOtp({
          channel,
          to,
          code,
          purpose,
          reason: 'sms_provider_not_configured',
        });
      }

      safeLog('[OTP][SMS]', 'sent', { to, provider: 'custom_sms_provider' });
      return { ok: true, provider: 'custom_sms_provider', data };
    }

    if (channel === 'email' || isEmail(to)) {
      const data = await sendEmailOtp({ to, code, purpose });
      if (!data) {
        return logConsoleOtp({
          channel,
          to,
          code,
          purpose,
          reason: 'email_provider_not_configured',
        });
      }

      safeLog('[OTP][EMAIL]', 'sent', { to });
      return { ok: true, provider: 'smtp', data };
    }

    throw new Error('Unsupported OTP channel');
  } catch (err) {
    if (shouldAllowConsoleFallback()) {
      safeLog('[OTP][SEND]', 'fallback_to_console', {
        to,
        channel,
        error: err.message,
      });
      return logConsoleOtp({
        channel,
        to,
        code,
        purpose,
        reason: err.message,
      });
    }

    safeLog('[OTP][SEND]', 'failed', {
      to,
      channel,
      error: err.message,
    });

    const error = new Error('Failed to send OTP');
    error.code = 'OTP_DELIVERY_FAILED';
    error.details = err.message;

    throw error;
  }
}

module.exports = { sendOtp };
