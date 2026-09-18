const fs = require('fs/promises');
const path = require('path');

const User = require('../models/User');
const Device = require('../models/Device');
const DeviceIntegration = require('../models/DeviceIntegration');
const { normalizeIdentifier } = require('../utils/identifier');
const { uploadImage, deleteImage } = require('../utils/imageKit');
const { safeLog, logs } = require('../utils/logger');
const { activeUserFilter } = require('../utils/activeUser');
const { revokeAllUserRefreshTokens } = require('./token.service');
const realtime = require('./realtime.service');

function safeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    googleSub: user.googleSub || undefined,
    emailVerified: typeof user.emailVerified === 'boolean' ? user.emailVerified : Boolean(user.email && user.isVerified),
    phoneVerified: typeof user.phoneVerified === 'boolean' ? user.phoneVerified : Boolean(user.phone && user.isVerified),
    dateOfBirth: user.dateOfBirth || '',
    gender: user.gender || '',
    address: user.address || '',
    avatar: user.avatar || { url: '' },
    isVerified: user.isVerified,
    preferences: user.preferences,
  };
}

async function deleteLocalAvatarFile(filename) {
  if (!filename) return;
  const safeName = path.basename(filename);
  const fullPath = path.join(process.cwd(), 'uploads', 'avatars', safeName);
  try {
    await fs.unlink(fullPath);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
}

async function getMe(userId) {
  const user = await User.findOne(activeUserFilter({ _id: userId }));
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  return safeUser(user);
}

async function patchMe(userId, patch) {
  const nextPatch = { ...patch };
  if (typeof nextPatch.email === 'string') nextPatch.email = normalizeIdentifier(nextPatch.email);
  if (typeof nextPatch.phone === 'string') nextPatch.phone = normalizeIdentifier(nextPatch.phone);

  if (nextPatch.email) {
    const existing = await User.findOne(activeUserFilter({ email: nextPatch.email, _id: { $ne: userId } }));
    if (existing) {
      const err = new Error('Email already in use');
      err.status = 409;
      err.code = 'EMAIL_IN_USE';
      throw err;
    }
  }
  if (nextPatch.phone) {
    const existing = await User.findOne(activeUserFilter({ phone: nextPatch.phone, _id: { $ne: userId } }));
    if (existing) {
      const err = new Error('Phone already in use');
      err.status = 409;
      err.code = 'PHONE_IN_USE';
      throw err;
    }
  }

  const user = await User.findOneAndUpdate(activeUserFilter({ _id: userId }), { $set: nextPatch }, { new: true });
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  return safeUser(user);
}

async function getPreferences(userId) {
  const user = await User.findOne(activeUserFilter({ _id: userId })).select('preferences');
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  return user.preferences;
}

async function putPreferences(userId, prefs) {
  const user = await User.findOne(activeUserFilter({ _id: userId }));
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  user.preferences = {
    ...(user.preferences || {}),
    ...prefs,
    notifications: {
      ...((user.preferences && user.preferences.notifications) || {}),
      ...((prefs && prefs.notifications) || {}),
    },
  };
  await user.save();

  return user.preferences;
}

async function saveFcmToken(userId, { token, platform }) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    const err = new Error('FCM token is required');
    err.status = 400;
    err.code = 'FCM_TOKEN_REQUIRED';
    throw err;
  }

  const user = await User.findOne(activeUserFilter({ _id: userId }));
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  await User.updateMany(
    { _id: { $ne: userId }, 'fcmTokens.token': normalizedToken },
    { $pull: { fcmTokens: { token: normalizedToken } } },
  );

  const existingIndex = (user.fcmTokens || []).findIndex((t) => t.token === normalizedToken);
  if (existingIndex >= 0) {
    user.fcmTokens[existingIndex].platform = platform || user.fcmTokens[existingIndex].platform;
    user.fcmTokens[existingIndex].addedAt = new Date();
  } else {
    user.fcmTokens.push({ token: normalizedToken, platform: platform || 'unknown', addedAt: new Date() });
  }

  await user.save();
  safeLog('[PUSH]', 'fcm_token_saved', {
    userId: String(user._id),
    platform: platform || 'unknown',
    tokenPreview: normalizedToken.slice(0, 12),
    tokenCount: user.fcmTokens.length,
  });
  return { count: user.fcmTokens.length };
}

async function removeFcmToken(userId, { token } = {}) {
  const normalizedToken = String(token || '').trim();
  const update = normalizedToken
    ? { $pull: { fcmTokens: { token: normalizedToken } } }
    : { $set: { fcmTokens: [] } };

  const user = await User.findOneAndUpdate(activeUserFilter({ _id: userId }), update, { new: true }).select('fcmTokens');
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  return { count: user.fcmTokens.length };
}

async function putPhoto(userId, file) {
  if (!file || !file.buffer) {
    const err = new Error('photo file is required');
    err.status = 400;
    err.code = 'PHOTO_REQUIRED';
    throw err;
  }
  const user = await User.findOne(activeUserFilter({ _id: userId }));
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  const previousFilename = user.avatar && user.avatar.filename ? user.avatar.filename : '';
  const previousFileId = user.avatar && user.avatar.fileId ? user.avatar.fileId : '';
  const uploadResult = await uploadImage({
    buffer: file.buffer,
    fileName: file.originalname || `profile-photo-${Date.now()}.jpg`,
    folder: '/dvaari/profile-photos',
    contentType: file.mimetype,
    tags: ['profile-photo', String(userId)],
  });

  user.avatar = {
    url: uploadResult.url,
    filename: uploadResult.name || file.originalname || '',
    fileId: uploadResult.fileId || '',
    storageProvider: 'imagekit',
    mime: file.mimetype,
    size: file.size,
    updatedAt: new Date(),
  };
  await user.save();
  if (previousFileId && previousFileId !== uploadResult.fileId) await deleteImage(previousFileId);
  if (previousFilename && !previousFileId) await deleteLocalAvatarFile(previousFilename);
  return safeUser(user);
}

async function deletePhoto(userId) {
  const user = await User.findOne(activeUserFilter({ _id: userId }));
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const previousFilename = user.avatar && user.avatar.filename ? user.avatar.filename : '';
  const previousFileId = user.avatar && user.avatar.fileId ? user.avatar.fileId : '';
  user.avatar = {
    url: '',
    filename: '',
    fileId: '',
    storageProvider: '',
    mime: '',
    size: 0,
    updatedAt: new Date(),
  };
  await user.save();
  if (previousFileId) await deleteImage(previousFileId);
  if (previousFilename && !previousFileId) await deleteLocalAvatarFile(previousFilename);
  return safeUser(user);
}

async function unlinkDevicesForDeletedUser(user) {
  const ownerIds = [user._id, user.primaryHomeId].filter(Boolean);
  const devices = await Device.find({
    isLinked: true,
    $or: [
      { ownerUserId: { $in: ownerIds } },
      { linkedHomeId: { $in: ownerIds } },
    ],
  });

  if (!devices.length) {
    logs.info('[USER][DELETE_ACCOUNT] no linked devices to unlink', {
      userId: String(user._id),
    });
    return { count: 0 };
  }

  const unlinkedAt = new Date();
  const deviceMongoIds = devices.map(device => device._id);

  for (const device of devices) {
    device.ownerUserId = null;
    device.linkedHomeId = null;
    device.isLinked = false;
    device.pairingStatus = 'unpaired';
    device.status = 'offline';
    device.onlineStatus = 'offline';
    device.lastSeenAt = null;

    if (device.type === 'tablet') {
      // Clearing deviceSecretHash forces tablet re-bootstrap after owner account deletion.
      device.deviceSecretHash = undefined;
      device.onboardingCompleted = false;
      device.configVersion = Number(device.configVersion || 1) + 1;
    }

    await device.save();

    if (device.type === 'tablet') {
      realtime.publishToDevice(device.deviceId, 'tablet.unlinked', {
        deviceId: device.deviceId,
        reason: 'owner_account_deleted',
        unlinkedAt: unlinkedAt.toISOString(),
      });
    }
  }

  await DeviceIntegration.updateMany(
    { deviceMongoId: { $in: deviceMongoIds } },
    { $set: { status: 'disconnected', disconnectedAt: unlinkedAt } },
  );

  logs.info('[USER][DELETE_ACCOUNT] linked devices unlinked', {
    userId: String(user._id),
    count: devices.length,
    tabletCount: devices.filter(device => device.type === 'tablet').length,
  });

  return { count: devices.length };
}

function normalizeDeletionReason(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

async function deleteAccount(userId, { deletionReason } = {}) {
  const deletedAt = new Date();
  const normalizedDeletionReason = normalizeDeletionReason(deletionReason);
  logs.info('[USER][DELETE_ACCOUNT] started', {
    userId: String(userId),
    hasDeletionReason: Boolean(normalizedDeletionReason),
  });

  if (!normalizedDeletionReason) {
    const err = new Error('Account deletion reason is required');
    err.status = 400;
    err.code = 'DELETION_REASON_REQUIRED';
    logs.error('[USER][DELETE_ACCOUNT] deletion reason missing', { userId: String(userId) });
    throw err;
  }

  const existingUser = await User.findOne(activeUserFilter({ _id: userId })).select('_id email phone primaryHomeId');
  if (!existingUser) {
    const err = new Error('User not found');
    err.status = 404;
    err.code = 'USER_NOT_FOUND';
    logs.error('[USER][DELETE_ACCOUNT] user not found', { userId: String(userId) });
    throw err;
  }

  const tombstone = `deleted-${String(existingUser._id)}-${deletedAt.getTime()}`;
  await unlinkDevicesForDeletedUser(existingUser);

  const user = await User.findOneAndUpdate(
    activeUserFilter({ _id: userId }),
    {
      $set: {
        isDeleted: true,
        deletedAt,
        deletionReason: normalizedDeletionReason,
        deletionReasonCapturedAt: deletedAt,
        deletedEmail: existingUser.email || '',
        deletedPhone: existingUser.phone || '',
        email: existingUser.email ? `${tombstone}@deleted.local` : '',
        phone: existingUser.phone ? `${tombstone}-${String(existingUser.phone).replace(/[^\d+]/g, '')}` : '',
        fcmTokens: [],
      },
    },
    { new: true },
  );

  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    err.code = 'USER_NOT_FOUND';
    logs.error('[USER][DELETE_ACCOUNT] user not found', { userId: String(userId) });
    throw err;
  }

  // Existing delivery and related records keep their user/home references; only sessions are invalidated.
  await revokeAllUserRefreshTokens(user._id, 'account_deleted');
  logs.info('[USER][DELETE_ACCOUNT] completed', {
    userId: String(user._id),
    deletedAt: deletedAt.toISOString(),
    hasDeletionReason: Boolean(user.deletionReason),
  });

  return {
    id: user._id,
    isDeleted: user.isDeleted,
    deletedAt: user.deletedAt,
  };
}

module.exports = {
  getMe,
  patchMe,
  putPhoto,
  deletePhoto,
  getPreferences,
  putPreferences,
  saveFcmToken,
  removeFcmToken,
  deleteAccount,
};
