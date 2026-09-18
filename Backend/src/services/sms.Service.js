const axios = require('axios');
const { env } = require('../config/env');
const { safeLog } = require('../utils/logger');

function normalizeIndianPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

function isSmsProviderSuccess(data) {
  if (!data) return false;
  if (typeof data === 'string') {
    return /(success|sent|queued|ok|accepted|submitted)/i.test(data) &&
      !/(invalid|error|failed|reject|insufficient|blacklist)/i.test(data);
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

  return fields.some(value => /(success|sent|queued|ok|accepted|submitted)/i.test(String(value))) &&
    !fields.some(value => /(invalid|error|failed|reject|insufficient|blacklist)/i.test(String(value)));
}

const sendOTP = async (phone, otp) => {
  try {
    const localPhone = normalizeIndianPhone(phone);
    const ttlMinutes = Math.max(1, Math.ceil((env.OTP_TTL_SECONDS || 300) / 60));
    const message = env.SMS_OTP_TEMPLATE_TEXT
      ? env.SMS_OTP_TEMPLATE_TEXT
          .replace(/\{\{\s*OTP\s*\}\}/gi, String(otp))
          .replace(/\{\{\s*MINUTES\s*\}\}/gi, String(ttlMinutes))
          .replace(/\{\{\s*APP_NAME\s*\}\}/gi, 'Dvaari')
      : `Your OTP for login is ${otp}. Do not share this OTP with anyone. It is valid for ${ttlMinutes} minutes. - Grahnetra AI Labs`;

    const url = `${process.env.SMS_BASE_URL}?apikey=${process.env.SMS_API_KEY}&senderid=${process.env.SMS_SENDER_ID}&templateid=${process.env.SMS_TEMPLATE_ID}&number=${localPhone}&message=${encodeURIComponent(message)}`;

    const response = await axios.get(url, { timeout: 8000 });

    safeLog('[OTP][SMSFORTIUS_HELPER]', 'provider_response', {
      to: phone,
      number: localPhone,
      response: response.data,
    });
    return response.data;
  } catch (error) {
    console.error('SMS Error:', error.message);
    throw error;
  }
};

async function sendTemplateSms({ phone, templateId, message, logScope = 'SMS_TEMPLATE' }) {
  try {
    if (!process.env.SMS_BASE_URL || !process.env.SMS_API_KEY || !process.env.SMS_SENDER_ID || !templateId) {
      throw new Error('SMS provider env missing');
    }

    const localPhone = normalizeIndianPhone(phone);
    const params = new URLSearchParams({
      apikey: process.env.SMS_API_KEY,
      senderid: process.env.SMS_SENDER_ID,
      templateid: templateId,
      number: localPhone,
      message,
    });

    if (process.env.SMS_ENTITY_ID) params.set('entityid', process.env.SMS_ENTITY_ID);
    if (process.env.SMS_ROUTE) params.set('route', process.env.SMS_ROUTE);
    if (process.env.SMS_CHANNEL) params.set('channel', process.env.SMS_CHANNEL);
    if (process.env.SMS_DCS) params.set('DCS', process.env.SMS_DCS);
    if (process.env.SMS_FLASHSMS) params.set('flashsms', process.env.SMS_FLASHSMS);

    const url = `${process.env.SMS_BASE_URL}?${params.toString()}`;

    const response = await axios.get(url, { timeout: 8000 });

    const ok = isSmsProviderSuccess(response.data);

    safeLog(`[${logScope}]`, 'provider_response', {
      to: phone,
      number: localPhone,
      templateId,
      message,
      response: response.data,
      ok,
    });

    if (!ok) {
      const err = new Error('SMS provider rejected invite SMS');
      err.details = response.data;
      throw err;
    }

    return response.data;
  } catch (error) {
    safeLog(`[${logScope}]`, 'failed', {
      to: phone,
      templateId,
      message,
      error: error.message,
      details: error.details,
    });
    throw error;
  }
}

module.exports = sendOTP;
module.exports.sendTemplateSms = sendTemplateSms;
