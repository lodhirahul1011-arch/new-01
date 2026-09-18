const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { nanoid } = require('nanoid');
const Device = require('../models/Device');
const DeviceIntegration = require('../models/DeviceIntegration');
const User = require('../models/User');
const { resolveHomeId } = require('../utils/home');
const { uploadImage, deleteImage, listImages } = require('../utils/imageKit');
const { logs } = require('../utils/logger');
const realtime = require('./realtime.service');
const { computeOnlineStatus } = require('./devicePresenceMonitor.service');
const { linkReviewDeviceForUser } = require('./playStoreReview.service');

function now() {
  return new Date();
}

function inMinutes(mins) {
  return new Date(Date.now() + mins * 60 * 1000);
}

function computeOnline(device) {
  return computeOnlineStatus(device);
}

function maskAccountIdentifier(value) {
  const str = String(value || '').trim();
  if (!str) return '';
  if (str.includes('@')) {
    const [name, domain] = str.split('@');
    const visible = name.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
  }
  if (str.length <= 4) return '*'.repeat(str.length);
  return `${str.slice(0, 2)}${'*'.repeat(Math.max(1, str.length - 4))}${str.slice(-2)}`;
}

function providerLabel(provider) {
  return provider === 'amazon' ? 'Amazon' : provider === 'flipkart' ? 'Flipkart' : provider;
}

function getVerificationCode() {
  return String(crypto.randomInt(1000, 10000));
}

const WALLPAPER_PRESETS = [];

function slugifyWallpaperKey(value) {
  return String(value || 'wallpaper')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'wallpaper';
}

function toWallpaperLabel(value) {
  const base = String(value || 'Wallpaper').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  return base.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeImageKitUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  return url.split('?')[0];
}

function sameId(left, right) {
  if (!left || !right) return false;
  return String(left) === String(right);
}

function getUserScopedWallpaperSettings(device, userId) {
  const settings = device.settings || {};
  const customOwner = settings.customWallpaperUploadedByUserId || settings.wallpaperUploadedByUserId;
  const activeOwner = settings.wallpaperUploadedByUserId || customOwner;
  const isCustomSelected = settings.wallpaperPreset === 'custom-wallpaper';
  const customBelongsToUser = customOwner
    ? sameId(customOwner, userId)
    : sameId(device.ownerUserId, userId);
  const activeBelongsToUser = activeOwner
    ? sameId(activeOwner, userId)
    : !isCustomSelected || customBelongsToUser;
  const customWallpaperUrl = customBelongsToUser ? settings.customWallpaperUrl || '' : '';
  const wallpaperPreset = activeBelongsToUser ? settings.wallpaperPreset || '' : '';
  const wallpaperUrl =
    activeBelongsToUser && (wallpaperPreset !== 'custom-wallpaper' || customWallpaperUrl)
      ? settings.wallpaperUrl || ''
      : '';

  return {
    wallpaperPreset,
    wallpaperUrl,
    customWallpaperUrl,
  };
}

async function getImageKitWallpaperPresets() {
  try {
    const files = await listImages({ path: '/dvaari/wallpaper-presets', limit: 100 });
    return files
      .filter((file) => file?.url)
      .map((file) => ({
        key: `imagekit-${slugifyWallpaperKey(file.name || file.filePath || file.fileId)}`,
        label: toWallpaperLabel(file.name || file.filePath || 'Wallpaper'),
        imageUrl: normalizeImageKitUrl(file.url),
        fileId: file.fileId || '',
      }));
  } catch (error) {
    return [];
  }
}

function mergeWallpaperPresets(...groups) {
  const byUrl = new Map();
  for (const group of groups) {
    for (const item of group || []) {
      const imageUrl = normalizeImageKitUrl(item.imageUrl);
      if (!imageUrl) continue;
      const existing = byUrl.get(imageUrl);
      byUrl.set(imageUrl, existing || { ...item, imageUrl });
    }
  }
  return Array.from(byUrl.values());
}

function createHttpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function toPublicTablet(device) {
  return {
    deviceId: device.deviceId,
    type: device.type,
    name: device.name,
    displayName: device.settings?.displayName || device.name,
    isLinked: Boolean(device.isLinked),
    pairingStatus: device.pairingStatus,
    linkedHomeId: device.linkedHomeId || null,
    onboardingCompleted: Boolean(device.onboardingCompleted),
    simpleModeEnabled: Boolean(device.simpleModeEnabled),
  };
}

function publishDeviceConfigUpdated(device) {
  realtime.publishMany(
    {
      userId: device.ownerUserId,
      homeId: device.linkedHomeId || device.ownerUserId || null,
      deviceId: device.deviceId,
    },
    device.type === 'tablet' ? 'tablet.config.updated' : 'device.config.updated',
    {
      deviceId: device.deviceId,
      type: device.type,
      settings: device.settings || {},
      configVersion: Number(device.configVersion || 1),
    },
  );
}

/**
 * Provision a device for pairing (testing / manufacturing).
 * Returns:
 *  - qrToken (put this inside QR)
 *  - deviceSecret (store on device for heartbeat auth)
 */
async function provisionDevice({ deviceId, type, name }) {
  const pairingCodeId = nanoid(10);
  const pairingSecret = nanoid(24);
  const qrToken = `PAIR_${pairingCodeId}.${pairingSecret}`;

  const deviceSecret = `SEC_${nanoid(32)}`;

  const pairingSecretHash = await bcrypt.hash(pairingSecret, 10);
  const deviceSecretHash = await bcrypt.hash(deviceSecret, 10);

  const update = {
    deviceId,
    type: type || 'box',
    name: name || 'Dvaari Device',
    isLinked: false,
    ownerUserId: null,
    linkedHomeId: null,
    pairingStatus: 'pairing',
    pairingCodeId,
    pairingSecretHash,
    pairingExpiresAt: inMinutes(15),
    deviceSecretHash,
    status: 'offline',
    onlineStatus: 'offline',
    onboardingCompleted: false,
    configVersion: 1,
  };

  const device = await Device.findOneAndUpdate({ deviceId }, { $set: update }, { upsert: true, new: true });

  return {
    deviceId: device.deviceId,
    qrToken,
    deviceSecret,
    pairingExpiresAt: device.pairingExpiresAt,
  };
}

async function linkDevice({ userId, qrToken }) {
  try {
    const reviewDevice = await linkReviewDeviceForUser({ userId, qrToken });
    if (reviewDevice) {
      logs.info('[DEVICE][LINK] play store reviewer QR linked', {
        userId: String(userId),
        deviceId: reviewDevice.deviceId,
      });
      return reviewDevice;
    }
  } catch (error) {
    logs.error('[DEVICE][LINK] play store reviewer QR failed', {
      userId: String(userId || ''),
      error: error.message,
    });
    throw error;
  }

  const token = String(qrToken || '');
  const match = token.match(/^PAIR_([A-Za-z0-9_-]{6,})\.([A-Za-z0-9_-]{10,})$/);
  if (!match) {
    throw createHttpError(400, 'INVALID_QR_TOKEN', 'Invalid QR token');
  }
  const pairingCodeId = match[1];
  const pairingSecret = match[2];

  // Tablet pairing is handled only by /tablet/pairing/claim.  Keeping it out
  // of this legacy device-link endpoint prevents a tablet QR from being
  // claimed through the wrong flow.
  const device = await Device.findOne({ pairingCodeId, type: { $ne: 'tablet' } });
  if (!device) {
    throw createHttpError(404, 'DEVICE_NOT_FOUND', 'Device not found');
  }

  if (device.isLinked) {
    throw createHttpError(409, 'DEVICE_ALREADY_LINKED', 'Device already linked');
  }
  if (!device.pairingExpiresAt || device.pairingExpiresAt <= now()) {
    throw createHttpError(400, 'QR_TOKEN_EXPIRED', 'QR token expired. Please regenerate and try again.');
  }
  if (!device.pairingSecretHash) {
    throw createHttpError(400, 'DEVICE_PAIRING_UNAVAILABLE', 'Device pairing not available');
  }

  const ok = await bcrypt.compare(pairingSecret, device.pairingSecretHash);
  if (!ok) {
    throw createHttpError(400, 'INVALID_QR_TOKEN', 'Invalid QR token');
  }

  device.ownerUserId = userId;
  device.isLinked = true;
  device.pairingStatus = 'paired';
  device.pairingCodeId = undefined;
  device.pairingSecretHash = undefined;
  device.pairingExpiresAt = undefined;
  device.lastSeenAt = new Date();
  await device.save();

  return device;
}

async function listDevices(userId) {
  return Device.find({ ownerUserId: userId, isLinked: true }).sort({ createdAt: -1 });
}

async function getDevice(userId, deviceId) {
  const device = await Device.findOne({ ownerUserId: userId, deviceId, isLinked: true });
  if (!device) {
    throw createHttpError(404, 'DEVICE_NOT_FOUND', 'Device not found');
  }
  return device;
}

async function patchDevice(userId, deviceId, patch) {
  const device = await getDevice(userId, deviceId);
  let configChanged = false;

  if (patch.name !== undefined) device.name = patch.name;
  if (patch.type !== undefined) device.type = patch.type;
  if (patch.onboardingCompleted !== undefined) {
    device.onboardingCompleted = patch.onboardingCompleted;
    configChanged = true;
  }
  if (patch.simpleModeEnabled !== undefined) {
    device.simpleModeEnabled = patch.simpleModeEnabled;
    configChanged = true;
  }
  if (patch.settings) {
    const nextSettings = { ...(device.settings || {}), ...(patch.settings || {}) };

    if (patch.settings.wallpaperPreset === 'custom-wallpaper') {
      nextSettings.customWallpaperUploadedByUserId =
        nextSettings.customWallpaperUploadedByUserId || userId;
      nextSettings.wallpaperUploadedByUserId =
        nextSettings.customWallpaperUploadedByUserId || userId;
    } else if (
      patch.settings.wallpaperPreset !== undefined ||
      (patch.settings.wallpaperUrl !== undefined &&
        patch.settings.wallpaperUrl !== nextSettings.customWallpaperUrl)
    ) {
      nextSettings.wallpaperUploadedByUserId = null;
    }

    device.settings = nextSettings;
    configChanged = true;
  }

  if (configChanged) {
    device.configVersion = Number(device.configVersion || 1) + 1;
  }

  await device.save();
  if (configChanged) publishDeviceConfigUpdated(device);
  return device;
}

async function unlinkDevice(userId, deviceId) {
  const device = await getDevice(userId, deviceId);
  const unlinkedAt = new Date();

  device.ownerUserId = null;
  device.linkedHomeId = null;
  device.isLinked = false;
  device.pairingStatus = 'unpaired';
  device.status = 'offline';
  device.onlineStatus = 'offline';
  device.lastSeenAt = null;

  if (device.type === 'tablet') {
    // Force the tablet to re-bootstrap after being removed from the mobile app.
    device.deviceSecretHash = undefined;
    device.onboardingCompleted = false;
    device.configVersion = Number(device.configVersion || 1) + 1;
  }

  await device.save();

  await DeviceIntegration.updateMany(
    { deviceMongoId: device._id },
    { $set: { status: 'disconnected', disconnectedAt: unlinkedAt } },
  );

  if (device.type === 'tablet') {
    realtime.publishToDevice(device.deviceId, 'tablet.unlinked', {
      deviceId: device.deviceId,
      reason: 'removed_from_mobile',
      unlinkedAt: unlinkedAt.toISOString(),
    });
  }

  return { deviceId: device.deviceId };
}

async function heartbeat(device, payload = {}) {
  const nextStatus = payload.status || 'online';
  const heartbeatAt = new Date();

  device.lastSeenAt = heartbeatAt;
  device.status = nextStatus;
  device.onlineStatus = nextStatus;
  device.presence = {
    ...(device.presence || {}),
    lastOnlineAt: nextStatus === 'offline' ? device.presence?.lastOnlineAt || null : heartbeatAt,
    lastOfflineDetectedAt:
      nextStatus === 'offline' ? heartbeatAt : device.presence?.lastOfflineDetectedAt || null,
    offlineNotificationSentAt:
      nextStatus === 'offline' ? device.presence?.offlineNotificationSentAt || null : null,
  };
  if (payload.appVersion) device.appVersion = payload.appVersion;
  if (typeof payload.batteryLevel === 'number') device.batteryLevel = payload.batteryLevel;
  if (payload.networkType) device.networkType = payload.networkType;
  await device.save();

  return device;
}

async function getStatus(userId, deviceId) {
  const device = await getDevice(userId, deviceId);
  return {
    deviceId: device.deviceId,
    status: computeOnline(device),
    lastSeenAt: device.lastSeenAt,
    settings: device.settings || {},
    wifi: device.wifi || {},
    onboardingCompleted: device.onboardingCompleted,
    simpleModeEnabled: device.simpleModeEnabled,
  };
}

async function getLinkedSummary(userId) {
  const devices = await listDevices(userId);
  return {
    summary: {
      total: devices.length,
      online: devices.filter((d) => computeOnline(d) === 'online').length,
      offline: devices.filter((d) => computeOnline(d) === 'offline').length,
    },
    items: devices.map((device) => {
      const wallpaperSettings = getUserScopedWallpaperSettings(device, userId);

      return {
        deviceId: device.deviceId,
        name: device.name,
        type: device.type,
        status: computeOnline(device),
        statusLabel: computeOnline(device) === 'online' ? 'Linked' : 'Offline',
        lastSeenAt: device.lastSeenAt,
        ...wallpaperSettings,
        onboardingCompleted: device.onboardingCompleted,
        simpleModeEnabled: device.simpleModeEnabled,
        language: device.settings?.language || 'en',
        timezone: device.settings?.timezone || 'Asia/Kolkata',
        wifiConfigured: Boolean(device.wifi?.configured),
      };
    }),
  };
}

async function getWallpaperOptions(userId) {
  const devices = await listDevices(userId);
  const imageKitPresets = await getImageKitWallpaperPresets();
  return {
    items: mergeWallpaperPresets(WALLPAPER_PRESETS, imageKitPresets),
    deviceCount: devices.length,
  };
}

async function selectWallpaper(userId, deviceId, wallpaperKey) {
  const device = await getDevice(userId, deviceId);
  const key = String(wallpaperKey || '').trim();

  if (key === 'custom-wallpaper') {
    const customWallpaperUrl = device.settings?.customWallpaperUrl || '';
    if (!customWallpaperUrl) {
      throw createHttpError(400, 'CUSTOM_WALLPAPER_NOT_FOUND', 'Upload a wallpaper before selecting custom wallpaper');
    }

    device.settings = {
      ...(device.settings || {}),
      wallpaperUrl: customWallpaperUrl,
      wallpaperFileId: device.settings?.customWallpaperFileId || '',
      wallpaperStorageProvider: 'imagekit',
      wallpaperUploadedByUserId: userId,
      customWallpaperUploadedByUserId: device.settings?.customWallpaperUploadedByUserId || userId,
      wallpaperPreset: 'custom-wallpaper',
    };
  } else {
    const allPresets = mergeWallpaperPresets(WALLPAPER_PRESETS, await getImageKitWallpaperPresets());
    const preset = allPresets.find((item) => item.key === key);
    if (!preset) {
      throw createHttpError(400, 'WALLPAPER_NOT_FOUND', 'Wallpaper option not found');
    }

    device.settings = {
      ...(device.settings || {}),
      wallpaperUrl: preset.imageUrl,
      wallpaperFileId: preset.fileId,
      wallpaperStorageProvider: 'imagekit',
      wallpaperUploadedByUserId: null,
      wallpaperPreset: preset.key,
    };
  }

  device.configVersion = Number(device.configVersion || 1) + 1;
  await device.save();
  publishDeviceConfigUpdated(device);
  return device;
}

async function uploadWallpaper(userId, deviceId, file) {
  if (!file || !file.buffer) {
    throw createHttpError(400, 'WALLPAPER_FILE_REQUIRED', 'Wallpaper image is required');
  }
  const device = await getDevice(userId, deviceId);
  const previousFileId = device.settings?.customWallpaperFileId || '';
  const uploadResult = await uploadImage({
    buffer: file.buffer,
    fileName: file.originalname || `wallpaper-${deviceId}-${Date.now()}.jpg`,
    folder: '/dvaari/device-wallpapers',
    contentType: file.mimetype,
    tags: ['device-wallpaper', String(userId), String(deviceId)],
  });

  device.settings = {
    ...(device.settings || {}),
    wallpaperUrl: uploadResult.url,
    wallpaperFileId: uploadResult.fileId || '',
    wallpaperStorageProvider: 'imagekit',
    wallpaperUploadedByUserId: userId,
    customWallpaperUrl: uploadResult.url,
    customWallpaperFileId: uploadResult.fileId || '',
    customWallpaperUploadedByUserId: userId,
    wallpaperPreset: 'custom-wallpaper',
  };
  device.configVersion = Number(device.configVersion || 1) + 1;
  await device.save();
  publishDeviceConfigUpdated(device);
  if (previousFileId && previousFileId !== uploadResult.fileId) {
    deleteImage(previousFileId).catch((error) => {
      console.warn('[ImageKit] old wallpaper cleanup failed', {
        fileId: previousFileId,
        message: error.message,
      });
    });
  }
  return device;
}

async function listIntegrations(userId, deviceId) {
  const device = await getDevice(userId, deviceId);
  const docs = await DeviceIntegration.find({ userId, deviceMongoId: device._id }).sort({ createdAt: -1 });
  const mapped = docs.map((doc) => doc.toPublic());
  const providers = ['amazon', 'flipkart'].map((provider) => {
    const existing = mapped.find((item) => item.provider === provider);
    return (
      existing || {
        provider,
        providerLabel: providerLabel(provider),
        status: 'disconnected',
        verificationRequired: false,
        accountIdentifier: '',
        connectedAt: null,
        lastSyncAt: null,
      }
    );
  });
  return {
    deviceId: device.deviceId,
    items: providers,
  };
}

async function connectIntegration(userId, deviceId, payload) {
  const device = await getDevice(userId, deviceId);
  const code = getVerificationCode();
  const codeHash = await bcrypt.hash(code, 10);
  const provider = payload.provider;
  const doc = await DeviceIntegration.findOneAndUpdate(
    { deviceMongoId: device._id, provider },
    {
      $set: {
        userId,
        deviceMongoId: device._id,
        deviceId: device.deviceId,
        provider,
        providerLabel: providerLabel(provider),
        accountIdentifier: payload.accountIdentifier || '',
        maskedAccountIdentifier: maskAccountIdentifier(payload.accountIdentifier || ''),
        status: 'pending_verification',
        'verification.codeHash': codeHash,
        'verification.codeExpiresAt': inMinutes(10),
        'verification.attempts': 0,
        'verification.lastSentAt': new Date(),
        'verification.verifiedAt': null,
        disconnectedAt: null,
        'meta.note': payload.note || '',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const response = {
    ...doc.toPublic(),
    verificationMessage: `Enter the verification code for ${providerLabel(provider)}`,
  };
  if (process.env.NODE_ENV !== 'production') response.devVerificationCode = code;
  return response;
}

async function verifyIntegration(userId, deviceId, provider, { code }) {
  const device = await getDevice(userId, deviceId);
  const doc = await DeviceIntegration.findOne({ userId, deviceMongoId: device._id, provider });
  if (!doc) {
    throw createHttpError(404, 'INTEGRATION_NOT_FOUND', 'Integration not found');
  }
  if (doc.status !== 'pending_verification') {
    throw createHttpError(400, 'INTEGRATION_NOT_PENDING', 'Integration does not require verification');
  }
  if (!doc.verification?.codeHash || !doc.verification?.codeExpiresAt || doc.verification.codeExpiresAt <= new Date()) {
    throw createHttpError(400, 'VERIFICATION_CODE_EXPIRED', 'Verification code expired');
  }

  const ok = await bcrypt.compare(String(code), doc.verification.codeHash);
  doc.verification.attempts = (doc.verification.attempts || 0) + 1;
  if (!ok) {
    await doc.save();
    throw createHttpError(400, 'INVALID_VERIFICATION_CODE', 'Invalid verification code');
  }

  doc.status = 'connected';
  doc.connectedAt = new Date();
  doc.lastSyncAt = new Date();
  doc.verification.verifiedAt = new Date();
  doc.verification.codeHash = undefined;
  doc.verification.codeExpiresAt = undefined;
  await doc.save();
  return doc.toPublic();
}

async function disconnectIntegration(userId, deviceId, provider) {
  const device = await getDevice(userId, deviceId);
  const doc = await DeviceIntegration.findOne({ userId, deviceMongoId: device._id, provider });
  if (!doc) {
    throw createHttpError(404, 'INTEGRATION_NOT_FOUND', 'Integration not found');
  }
  doc.status = 'disconnected';
  doc.disconnectedAt = new Date();
  doc.verification = { attempts: 0 };
  await doc.save();
  return doc.toPublic();
}

async function linkTabletDeviceToHome(device, user, options = {}) {
  const homeId = resolveHomeId(user);
  if (!homeId) {
    throw createHttpError(400, 'HOME_NOT_RESOLVED', 'Unable to resolve home for user');
  }
  device.ownerUserId = user._id;
  device.linkedHomeId = homeId;
  device.isLinked = true;
  device.pairingStatus = 'paired';
  device.lastSeenAt = new Date();
  if (options.displayName) {
    device.name = options.displayName;
    device.settings = { ...(device.settings || {}), displayName: options.displayName };
  }
  device.configVersion = Number(device.configVersion || 1) + 1;
  await device.save();
  return device;
}

module.exports = {
  provisionDevice,
  linkDevice,
  listDevices,
  getDevice,
  patchDevice,
  unlinkDevice,
  heartbeat,
  getStatus,
  getLinkedSummary,
  getWallpaperOptions,
  selectWallpaper,
  uploadWallpaper,
  listIntegrations,
  connectIntegration,
  verifyIntegration,
  disconnectIntegration,
  linkTabletDeviceToHome,
};
