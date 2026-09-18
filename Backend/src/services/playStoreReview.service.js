const Device = require('../models/Device');
const User = require('../models/User');
const { env } = require('../config/env');
const { normalizeIdentifier } = require('../utils/identifier');
const { logs } = require('../utils/logger');

function getReviewEmail() {
  return normalizeIdentifier(env.PLAY_STORE_REVIEW_EMAIL) || '';
}

function getReviewPhone() {
  return normalizeIdentifier(env.PLAY_STORE_REVIEW_PHONE) || '';
}

function isEnabled() {
  return Boolean(env.PLAY_STORE_REVIEW_ACCESS_ENABLED);
}

function getReviewOtp() {
  return String(env.PLAY_STORE_REVIEW_OTP || '1234').trim();
}

function getReviewQrToken() {
  return String(env.PLAY_STORE_REVIEW_QR_TOKEN || '').trim();
}

function isReviewIdentifier(identifier) {
  if (!isEnabled()) {
    return false;
  }

  const normalizedIdentifier = normalizeIdentifier(identifier);
  const reviewEmail = getReviewEmail();
  const reviewPhone = getReviewPhone();

  const matched =
    Boolean(normalizedIdentifier) &&
    (normalizedIdentifier === reviewEmail || normalizedIdentifier === reviewPhone);

  if (matched) {
    logs.info('[PLAY_STORE_REVIEW] reviewer identifier matched', {
      identifier: normalizedIdentifier,
    });
  }

  return matched;
}

async function ensureReviewUser() {
  if (!isEnabled()) {
    logs.info('[PLAY_STORE_REVIEW] ensure user skipped; review access disabled');
    return null;
  }

  const email = getReviewEmail();
  const phone = getReviewPhone();

  if (!email || !phone) {
    logs.error('[PLAY_STORE_REVIEW] invalid reviewer account configuration', {
      emailConfigured: Boolean(email),
      phoneConfigured: Boolean(phone),
    });
    return null;
  }

  try {
    const user = await User.findOneAndUpdate(
      {
        isDeleted: false,
        $or: [{ email }, { phone }],
      },
      {
        $set: {
          name: 'Dvaari Reviewer',
          email,
          phone,
          isVerified: true,
          verifiedAt: new Date(),
        },
        $setOnInsert: {
          roles: ['user', 'reviewer'],
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    logs.info('[PLAY_STORE_REVIEW] reviewer user ensured', {
      userId: String(user._id),
      email,
      phone,
    });

    await ensureReviewDeviceForUser(user);
    return user;
  } catch (error) {
    logs.error('[PLAY_STORE_REVIEW] failed to ensure reviewer user', {
      email,
      phone,
      error: error.message,
    });
    throw error;
  }
}

async function ensureReviewDeviceForUser(user) {
  if (!isEnabled() || !user?._id) {
    logs.info('[PLAY_STORE_REVIEW] ensure device skipped', {
      enabled: isEnabled(),
      hasUser: Boolean(user?._id),
    });
    return null;
  }

  const deviceId = String(env.PLAY_STORE_REVIEW_DEVICE_ID || '').trim();
  if (!deviceId) {
    logs.error('[PLAY_STORE_REVIEW] reviewer device id missing');
    return null;
  }

  try {
    const device = await Device.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          deviceId,
          type: 'box',
          name: 'Dvaari Review Box',
          ownerUserId: user._id,
          linkedHomeId: user.primaryHomeId || user._id,
          isLinked: true,
          pairingStatus: 'paired',
          pairingCodeId: undefined,
          pairingSecretHash: undefined,
          pairingExpiresAt: undefined,
          status: 'offline',
          onlineStatus: 'offline',
          onboardingCompleted: true,
          lastSeenAt: new Date(),
          'settings.displayName': 'Dvaari Review Box',
          'settings.language': 'en',
          'settings.timezone': 'Asia/Kolkata',
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    logs.info('[PLAY_STORE_REVIEW] reviewer device ensured', {
      userId: String(user._id),
      deviceId: device.deviceId,
    });

    return device;
  } catch (error) {
    logs.error('[PLAY_STORE_REVIEW] failed to ensure reviewer device', {
      userId: String(user._id),
      deviceId,
      error: error.message,
    });
    throw error;
  }
}

async function linkReviewDeviceForUser({ userId, qrToken }) {
  if (!isEnabled()) {
    return null;
  }

  const expectedQrToken = getReviewQrToken();
  const receivedQrToken = String(qrToken || '').trim();

  if (!expectedQrToken || receivedQrToken !== expectedQrToken) {
    return null;
  }

  try {
    const reviewUser = await ensureReviewUser();

    if (!reviewUser || String(reviewUser._id) !== String(userId)) {
      logs.error('[PLAY_STORE_REVIEW] reviewer QR rejected for non-reviewer user', {
        userId: String(userId || ''),
        reviewUserId: reviewUser ? String(reviewUser._id) : '',
      });
      const error = new Error('Invalid QR token');
      error.status = 400;
      error.code = 'INVALID_QR_TOKEN';
      throw error;
    }

    const device = await ensureReviewDeviceForUser(reviewUser);
    logs.info('[PLAY_STORE_REVIEW] reviewer QR linked', {
      userId: String(userId),
      deviceId: device?.deviceId,
    });
    return device;
  } catch (error) {
    logs.error('[PLAY_STORE_REVIEW] reviewer QR link failed', {
      userId: String(userId || ''),
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  ensureReviewUser,
  getReviewOtp,
  isEnabled,
  isReviewIdentifier,
  linkReviewDeviceForUser,
};
