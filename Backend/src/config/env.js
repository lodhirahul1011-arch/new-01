const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { logs } = require('../utils/logger');

function requireEnv(name, ...fallbacks) {
  const candidates = [process.env[name], ...fallbacks];
  const value = candidates.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function boolEnv(name, fallback = '') {
  return ['1', 'true', 'yes'].includes(String(process.env[name] ?? fallback).toLowerCase());
}

function isLocalMongoUri(value) {
  return /(?:localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(String(value || ''));
}

function getMongoDatabaseName(value) {
  const parsed = new URL(String(value || ''));
  const pathDatabase = decodeURIComponent(parsed.pathname || '').replace(/^\//, '');
  return parsed.searchParams.get('dbName') || pathDatabase;
}

function isInvalidMongoDatabaseName(value) {
  return !value || /[\/\\."$*\0\s]/.test(value);
}

function validateProductionEnv(nextEnv) {
  const lifecycleEvent = String(process.env.npm_lifecycle_event || '');
  if (lifecycleEvent.startsWith('test')) {
    logs.info('[ENV] test command detected; production deploy validation skipped', {
      lifecycleEvent,
    });
    return;
  }

  if (nextEnv.NODE_ENV !== 'production') {
    logs.info('[ENV] non-production configuration loaded', { nodeEnv: nextEnv.NODE_ENV });
    return;
  }

  const errors = [];
  const weakJwtValues = new Set([
    'superSecretKey',
    'secret',
    'changeme',
    'change_me',
    'test-access-secret',
    'test-refresh-secret',
  ]);

  if (nextEnv.CORS_ORIGIN === '*') errors.push('CORS_ORIGIN must not be * in production');
  if (nextEnv.OTP_DEBUG_LOG_ENABLED) errors.push('OTP_DEBUG_LOG_ENABLED must be false in production');
  if (nextEnv.OTP_CONSOLE_FALLBACK) errors.push('OTP_CONSOLE_FALLBACK must be false in production');
  if (nextEnv.OTP_EXPOSE_CODE_IN_RESPONSE) errors.push('OTP_EXPOSE_CODE_IN_RESPONSE must be false in production');
  if (nextEnv.JWT_ACCESS_SECRET.length < 32) errors.push('JWT_ACCESS_SECRET must be at least 32 characters');
  if (nextEnv.JWT_REFRESH_SECRET.length < 32) errors.push('JWT_REFRESH_SECRET must be at least 32 characters');
  if (nextEnv.JWT_ACCESS_SECRET === nextEnv.JWT_REFRESH_SECRET) errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  if (weakJwtValues.has(nextEnv.JWT_ACCESS_SECRET)) errors.push('JWT_ACCESS_SECRET is a known weak value');
  if (weakJwtValues.has(nextEnv.JWT_REFRESH_SECRET)) errors.push('JWT_REFRESH_SECRET is a known weak value');
  if (isLocalMongoUri(nextEnv.MONGO_URI)) errors.push('MONGO_URI must not point to localhost in production');
  try {
    const mongoDatabaseName = getMongoDatabaseName(nextEnv.MONGO_URI);
    if (isInvalidMongoDatabaseName(mongoDatabaseName)) {
      errors.push('MONGO_URI must include a valid MongoDB database name without slashes or spaces');
    }
  } catch (error) {
    logs.error('[ENV] Mongo URI validation failed', { error: error.message });
    errors.push('MONGO_URI must be a valid MongoDB connection string');
  }
  if (!nextEnv.DEVICE_PROVISION_SECRET || nextEnv.DEVICE_PROVISION_SECRET.length < 32) {
    errors.push('DEVICE_PROVISION_SECRET must be set to at least 32 characters in production');
  }
  if (!nextEnv.TABLET_BOOTSTRAP_SECRET || nextEnv.TABLET_BOOTSTRAP_SECRET.length < 32) {
    errors.push('TABLET_BOOTSTRAP_SECRET must be set to at least 32 characters in production');
  }
  if (nextEnv.OLLAMA_ENABLED && !nextEnv.OLLAMA_BASE_URL) {
    errors.push('OLLAMA_BASE_URL is required when OLLAMA_ENABLED=true');
  }
  if (nextEnv.OLLAMA_ENABLED && !nextEnv.OLLAMA_MODEL) {
    errors.push('OLLAMA_MODEL is required when OLLAMA_ENABLED=true');
  }
  if (nextEnv.OLLAMA_ENABLED && nextEnv.OLLAMA_EXTRACTION_MODE !== 'only') {
    errors.push('OLLAMA_EXTRACTION_MODE must be only when Ollama is the production extractor');
  }

  if (errors.length) {
    logs.error('[ENV] production configuration rejected', { errors });
    throw new Error(`Unsafe production configuration: ${errors.join('; ')}`);
  }

  logs.info('[ENV] production configuration validated');
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 5000),
  MONGO_URI: requireEnv('MONGO_URI', process.env.MONGO_URL, process.env.MONGODB_URI),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  JWT_ACCESS_SECRET: requireEnv('JWT_ACCESS_SECRET', process.env.JWT_SECRET),
  JWT_REFRESH_SECRET: requireEnv('JWT_REFRESH_SECRET', process.env.JWT_SECRET),
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL || '15m',
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL || '30d',

  GOOGLE_WEB_CLIENT_ID: process.env.GOOGLE_WEB_CLIENT_ID || '',
  GOOGLE_ANDROID_CLIENT_ID: process.env.GOOGLE_ANDROID_CLIENT_ID || '',

  OTP_LENGTH: Number(process.env.OTP_LENGTH || 4),
  OTP_TTL_SECONDS: Number(process.env.OTP_TTL_SECONDS || 300),
  OTP_MAX_VERIFY_ATTEMPTS: Number(process.env.OTP_MAX_VERIFY_ATTEMPTS || 5),
  OTP_MAX_RESENDS: Number(process.env.OTP_MAX_RESENDS || 3),
  OTP_RESEND_COOLDOWN_SECONDS: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 30),
  OTP_DEBUG_LOG_ENABLED: boolEnv('OTP_DEBUG_LOG_ENABLED'),
  OTP_CONSOLE_FALLBACK: boolEnv('OTP_CONSOLE_FALLBACK', process.env.ALLOW_OTP_CONSOLE_FALLBACK),
  OTP_EXPOSE_CODE_IN_RESPONSE: boolEnv('OTP_EXPOSE_CODE_IN_RESPONSE'),
  PLAY_STORE_REVIEW_ACCESS_ENABLED: true,
  PLAY_STORE_REVIEW_EMAIL: 'demo@test.com',
  PLAY_STORE_REVIEW_PHONE: '+919999999999',
  PLAY_STORE_REVIEW_OTP: '1234',
  PLAY_STORE_REVIEW_QR_TOKEN: process.env.PLAY_STORE_REVIEW_QR_TOKEN || 'DVAARI_PLAY_STORE_REVIEW_QR',
  PLAY_STORE_REVIEW_DEVICE_ID: 'dvaari-play-store-review-box',

  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_FROM: process.env.TWILIO_FROM || '',

  SMS_API_KEY: process.env.SMS_API_KEY || '',
  SMS_BASE_URL: process.env.SMS_BASE_URL || '',
  SMS_SENDER_ID: process.env.SMS_SENDER_ID || '',
  SMS_TEMPLATE_ID: process.env.SMS_TEMPLATE_ID || '',
  SMS_MEMBER_INVITE_TEMPLATE_ID: process.env.SMS_MEMBER_INVITE_TEMPLATE_ID || '1707177822618459910',
  SMS_ENTITY_ID: process.env.SMS_ENTITY_ID || process.env.SMS_PE_ID || '',
  SMS_ROUTE: process.env.SMS_ROUTE || '',
  SMS_CHANNEL: process.env.SMS_CHANNEL || '',
  SMS_DCS: process.env.SMS_DCS || '',
  SMS_FLASHSMS: process.env.SMS_FLASHSMS || '',
  SMS_COUNTRY_CODE: process.env.SMS_COUNTRY_CODE || '91',
  SMS_NUMBER_FORMAT: process.env.SMS_NUMBER_FORMAT || 'national',
  INBOUND_MESSAGE_WEBHOOK_SECRET: process.env.INBOUND_MESSAGE_WEBHOOK_SECRET || '',
  WHATSAPP_VERIFY_TOKEN: String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim(),
  WHATSAPP_APP_SECRET: String(process.env.WHATSAPP_APP_SECRET || '').trim(),
  WHATSAPP_ACCESS_TOKEN: String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim(),
  WHATSAPP_PHONE_NUMBER_ID: String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
  WHATSAPP_GRAPH_API_VERSION: String(process.env.WHATSAPP_GRAPH_API_VERSION || 'v26.0').trim(),
  WHATSAPP_OTP_TEMPLATE_NAME: String(process.env.WHATSAPP_OTP_TEMPLATE_NAME || '').trim(),
  WHATSAPP_OTP_TEMPLATE_LANGUAGE: String(process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || 'en').trim(),
  WHATSAPP_AUTO_REPLY: !['0', 'false', 'no'].includes(String(process.env.WHATSAPP_AUTO_REPLY || 'true').toLowerCase()),
  WHATSAPP_REPLY_ON_UNRECOGNIZED: ['1', 'true', 'yes'].includes(String(process.env.WHATSAPP_REPLY_ON_UNRECOGNIZED || '').toLowerCase()),
  WHATSAPP_REPLY_TO_UNREGISTERED: ['1', 'true', 'yes'].includes(String(process.env.WHATSAPP_REPLY_TO_UNREGISTERED || '').toLowerCase()),
  SMS_OTP_TEMPLATE_TEXT: process.env.SMS_OTP_TEMPLATE_TEXT || '',
  MSG91_AUTH_KEY: process.env.MSG91_AUTH_KEY || '',
  MSG91_TEMPLATE_ID: process.env.MSG91_TEMPLATE_ID || '',
  MSG91_OTP_VARIABLE: process.env.MSG91_OTP_VARIABLE || 'OTP',
  DEVICE_PROVISION_SECRET: process.env.DEVICE_PROVISION_SECRET || '',
  TABLET_BOOTSTRAP_SECRET: process.env.TABLET_BOOTSTRAP_SECRET || '',
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || '',
  SENDGRID_FROM: process.env.SENDGRID_FROM || '',
  FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
  FIREBASE_PROJECT_ID:
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    '',

  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 'local',
  AWS_REGION: process.env.AWS_REGION || 'ap-south-1',
  S3_BUCKET: process.env.S3_BUCKET || '',
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
  S3_ENDPOINT: process.env.S3_ENDPOINT || '',
  S3_FORCE_PATH_STYLE: ['1', 'true', 'yes'].includes(String(process.env.S3_FORCE_PATH_STYLE || '').toLowerCase()),

  OLLAMA_ENABLED: ['1', 'true', 'yes'].includes(String(process.env.OLLAMA_ENABLED || '').toLowerCase()),
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || '',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || '',
  OLLAMA_TIMEOUT_MS: Number(process.env.OLLAMA_TIMEOUT_MS || 30000),
  OLLAMA_NUM_CTX: Number(process.env.OLLAMA_NUM_CTX || 2048),
  OLLAMA_KEEP_ALIVE: process.env.OLLAMA_KEEP_ALIVE || '15m',
  OLLAMA_EXTRACTION_MODE: process.env.OLLAMA_EXTRACTION_MODE || 'fallback',

  // LiveKit (optional). Required only when using SFU-based Live Feed.
  LIVEKIT_URL: process.env.LIVEKIT_URL || '',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || '',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || '',
};

if (env.PLAY_STORE_REVIEW_ACCESS_ENABLED) {
  logs.info('[ENV] Play Store review access enabled', {
    email: env.PLAY_STORE_REVIEW_EMAIL,
    phoneConfigured: Boolean(env.PLAY_STORE_REVIEW_PHONE),
    otpConfigured: Boolean(env.PLAY_STORE_REVIEW_OTP),
  });
  if (!env.PLAY_STORE_REVIEW_EMAIL || !env.PLAY_STORE_REVIEW_PHONE || !env.PLAY_STORE_REVIEW_OTP) {
    logs.error('[ENV] Play Store review access configuration incomplete', {
      emailConfigured: Boolean(env.PLAY_STORE_REVIEW_EMAIL),
      phoneConfigured: Boolean(env.PLAY_STORE_REVIEW_PHONE),
      otpConfigured: Boolean(env.PLAY_STORE_REVIEW_OTP),
    });
  }
}

validateProductionEnv(env);

module.exports = { env };
