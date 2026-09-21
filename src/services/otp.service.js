const bcrypt = require('bcryptjs');

const Otp = require('../models/Otp');
const { env } = require('../config/env');
const { generateOtp } = require('../utils/otp');
const { logs } = require('../utils/logger');

function now() {
  return new Date();
}

function buildError(message, status, code, details) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details) err.details = details;
  return err;
}

async function createOrReplaceOtp({ identifier, channel, purpose, meta, codeOverride }) {
  const code = codeOverride ? String(codeOverride).trim() : generateOtp(env.OTP_LENGTH);
  if (codeOverride) {
    logs.info('[OTP] using configured OTP override', { identifier, purpose });
  }
  if (!code) {
    logs.error('[OTP] empty OTP generated or configured', { identifier, purpose });
    throw buildError('OTP could not be generated', 500, 'OTP_GENERATION_FAILED');
  }
  const otpHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);
  const resendAvailableAt = new Date(Date.now() + env.OTP_RESEND_COOLDOWN_SECONDS * 1000);

  await Otp.updateMany(
    { identifier, purpose, consumedAt: null },
    { $set: { consumedAt: new Date(), verifiedAt: new Date() } }
  );

  const otpDoc = await Otp.create({
    identifier,
    channel,
    purpose,
    otpHash,
    expiresAt,
    verifyAttemptsLeft: env.OTP_MAX_VERIFY_ATTEMPTS,
    resendCount: 0,
    resendAvailableAt,
    meta: meta || {},
  });

  return { code, expiresAt, otpSessionId: String(otpDoc._id) };
}

async function resendOtp({ identifier, purpose, meta, codeOverride }) {
  const otpDoc = await Otp.findOne({ identifier, purpose, consumedAt: null }).sort({ createdAt: -1 });
  if (!otpDoc) throw buildError('OTP not found. Please request a new code.', 404, 'OTP_NOT_FOUND');
  if (otpDoc.verifiedAt || otpDoc.consumedAt) throw buildError('OTP already used. Please request a new code.', 400, 'OTP_ALREADY_USED');
  if (otpDoc.expiresAt <= now()) throw buildError('OTP expired. Please request a new code.', 400, 'OTP_EXPIRED');
  if (otpDoc.resendCount >= env.OTP_MAX_RESENDS) throw buildError('Resend limit exceeded. Please try again later.', 429, 'OTP_RESEND_LIMIT');
  if (otpDoc.resendAvailableAt && otpDoc.resendAvailableAt > now()) {
    throw buildError('Please wait before requesting another code.', 429, 'OTP_RESEND_COOLDOWN', {
      retryAfterSeconds: Math.ceil((otpDoc.resendAvailableAt.getTime() - Date.now()) / 1000),
    });
  }

  const code = codeOverride ? String(codeOverride).trim() : generateOtp(env.OTP_LENGTH);
  if (codeOverride) {
    logs.info('[OTP] using configured OTP override for resend', { identifier, purpose });
  }
  if (!code) {
    logs.error('[OTP] empty OTP generated or configured for resend', { identifier, purpose });
    throw buildError('OTP could not be generated', 500, 'OTP_GENERATION_FAILED');
  }
  otpDoc.otpHash = await bcrypt.hash(code, 10);
  otpDoc.resendCount += 1;
  otpDoc.resendAvailableAt = new Date(Date.now() + env.OTP_RESEND_COOLDOWN_SECONDS * 1000);
  otpDoc.meta = { ...(otpDoc.meta || {}), ...(meta || {}) };
  await otpDoc.save();

  return { code, expiresAt: otpDoc.expiresAt, channel: otpDoc.channel, otpSessionId: String(otpDoc._id) };
}

async function verifyOtp({ identifier, purpose, code, otpSessionId }) {
  const query = otpSessionId
    ? { _id: otpSessionId, purpose, consumedAt: null }
    : { identifier, purpose, consumedAt: null };
  const otpDoc = await Otp.findOne(query).sort({ createdAt: -1 });
  if (!otpDoc) throw buildError('OTP session not found', 404, 'OTP_NOT_FOUND');
  if (otpDoc.verifiedAt || otpDoc.consumedAt) throw buildError('Code already used. Please request a new one.', 400, 'OTP_ALREADY_USED');
  if (otpDoc.expiresAt <= now()) throw buildError('OTP expired', 400, 'OTP_EXPIRED');
  if (otpDoc.verifyAttemptsLeft <= 0) throw buildError('Too many invalid attempts. Please request a new OTP.', 429, 'OTP_ATTEMPTS_EXCEEDED');

  const ok = await bcrypt.compare(String(code), otpDoc.otpHash);
  if (!ok) {
    otpDoc.verifyAttemptsLeft -= 1;
    await otpDoc.save();
    throw buildError('Invalid OTP', 400, 'OTP_INVALID', { attemptsLeft: otpDoc.verifyAttemptsLeft });
  }

  otpDoc.verifiedAt = now();
  otpDoc.consumedAt = now();
  await otpDoc.save();

  return otpDoc;
}

module.exports = {
  createOrReplaceOtp,
  resendOtp,
  verifyOtp,
};
