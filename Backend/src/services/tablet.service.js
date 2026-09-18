const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { nanoid } = require('nanoid');
const fs = require('fs');
const path = require('path');

const Device = require('../models/Device');
const DevicePairingSession = require('../models/DevicePairingSession');
const VisitorSession = require('../models/VisitorSession');
const DeliverySession = require('../models/DeliverySession');
const Delivery = require('../models/Delivery');
const DeliverySchedule = require('../models/DeliverySchedule');
const NfcCard = require('../models/NfcCard');
const NfcAccessLog = require('../models/NfcAccessLog');
const TabletRecording = require('../models/TabletRecording');
const Authorization = require('../models/Authorization');
const AwayModeSetting = require('../models/AwayModeSetting');
const BackupAssignment = require('../models/BackupAssignment');
const User = require('../models/User');
const { resolveHomeId } = require('../utils/home');
const { putObject, getProvider } = require('../utils/objectStorage');
const { generateVideoThumbnail, sha256File } = require('../utils/video');
const { uploadImage } = require('../utils/imageKit');
const deviceService = require('./device.service');
const { computeOnlineStatus } = require('./devicePresenceMonitor.service');
const authorizationService = require('./authorization.service');
const realtime = require('./realtime.service');
const {
  sendDeliveryBoyAtDoorNotification,
  sendDoorbellRingNotification,
  sendVisitorRecognitionNotification,
} = require('./pushNotification.service');
const { safeLog } = require('../utils/logger');

const DOORBELL_PUSH_DEDUPE_MS = 60_000;

function createHttpError(status, code, message, details) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details) err.details = details;
  return err;
}

function inMinutes(mins) {
  return new Date(Date.now() + mins * 60 * 1000);
}

function hashUid(uid) {
  return crypto.createHash('sha256').update(String(uid).trim()).digest('hex');
}

function sanitizeName(value) {
  return String(value || 'recording').replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function computeOnline(device) {
  return computeOnlineStatus(device);
}

function sameId(left, right) {
  if (!left || !right) return false;
  return String(left) === String(right);
}

function getTabletWallpaperSettings(device) {
  const settings = device.settings || {};
  const ownerUserId = device.ownerUserId;
  const customOwner = settings.customWallpaperUploadedByUserId || settings.wallpaperUploadedByUserId;
  const activeOwner = settings.wallpaperUploadedByUserId || customOwner;
  const isCustomSelected = settings.wallpaperPreset === 'custom-wallpaper';
  const customBelongsToOwner = customOwner
    ? sameId(customOwner, ownerUserId)
    : Boolean(ownerUserId);
  const activeBelongsToOwner = activeOwner
    ? sameId(activeOwner, ownerUserId)
    : !isCustomSelected || customBelongsToOwner;
  const customWallpaperUrl = customBelongsToOwner ? settings.customWallpaperUrl || '' : '';
  const wallpaperPreset = activeBelongsToOwner ? settings.wallpaperPreset || '' : '';
  const wallpaperUrl =
    activeBelongsToOwner && (wallpaperPreset !== 'custom-wallpaper' || customWallpaperUrl)
      ? settings.wallpaperUrl || ''
      : '';

  return {
    wallpaperPreset,
    wallpaperUrl,
  };
}

function formatDateTimeLabel(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

function formatRemainingLabel(until) {
  if (!until) return '';
  const diff = new Date(until).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.ceil(minutes / 60);
  return `${hours}h left`;
}

function maskCode(code) {
  const value = String(code || '');
  return value ? `${'*'.repeat(Math.max(0, value.length - 2))}${value.slice(-2)}` : '';
}

function normalizeScanValue(value) {
  return String(value || '').trim();
}

function buildScanCandidates(payload) {
  const raw = [
    normalizeScanValue(payload?.orderId),
    normalizeScanValue(payload?.awbCode),
  ].filter(Boolean);

  return Array.from(new Set(raw));
}

async function findMatchingDeliverySchedule(homeId, payload) {
  const candidates = buildScanCandidates(payload);
  if (!candidates.length) return null;

  const ors = [];
  for (const value of candidates) {
    ors.push({ referenceId: value });
    ors.push({ awbNumber: value });
    ors.push({ orderHint: value });
  }

  return DeliverySchedule.findOne({
    homeId,
    currentStatus: { $in: ['initiated', 'arriving_soon', 'out_for_delivery', 'upon_arrival'] },
    $or: ors,
  }).sort({ updatedAt: -1, _id: -1 });
}

function makePairingToken() {
  const pairingCodeId = nanoid(10);
  const pairingSecret = nanoid(24);
  return {
    pairingCodeId,
    pairingSecret,
    qrToken: `PAIR_${pairingCodeId}.${pairingSecret}`,
  };
}

function getTabletProjection(device) {
  const wallpaperSettings = getTabletWallpaperSettings(device);

  return {
    deviceId: device.deviceId,
    type: device.type,
    name: device.name,
    displayName: device.settings?.displayName || device.name,
    pairingStatus: device.pairingStatus,
    isLinked: device.isLinked,
    linkedHomeId: device.linkedHomeId || null,
    onlineStatus: computeOnline(device),
    lastSeenAt: device.lastSeenAt || null,
    appVersion: device.appVersion || '',
    onboardingCompleted: Boolean(device.onboardingCompleted),
    simpleModeEnabled: Boolean(device.simpleModeEnabled),
    wifi: {
      configured: Boolean(device.wifi?.configured),
      ssid: device.wifi?.ssid || '',
      connected: Boolean(device.wifi?.connected),
      signalStrength: device.wifi?.signalStrength ?? null,
      ipAddress: device.wifi?.ipAddress || '',
      updatedAt: device.wifi?.updatedAt || null,
    },
    settings: {
      theme: device.settings?.theme || 'light',
      language: device.settings?.language || 'en',
      timezone: device.settings?.timezone || 'Asia/Kolkata',
      wallpaperPreset: wallpaperSettings.wallpaperPreset,
      wallpaperUrl: wallpaperSettings.wallpaperUrl,
      fontSize: device.settings?.fontSize || 16,
    },
    configVersion: Number(device.configVersion || 1),
  };
}

async function sendDeliveryBoyAtDoorIfEligible(device, schedule) {
  if (!schedule?._id || schedule.notifications?.deliveryBoyAtDoorSentAt) {
    return;
  }
  if (schedule.verificationMethod === 'nfc') {
    safeLog('[TabletService] delivery_boy_push_skipped', {
      scheduleId: String(schedule._id),
      reason: 'nfc_method_selected',
    });
    return;
  }

  const userId = device?.ownerUserId;
  if (!userId) {
    return;
  }

  const user = await User.findById(userId).select('_id preferences fcmTokens');
  if (!user) {
    return;
  }

  const pushResult = await sendDeliveryBoyAtDoorNotification(user, schedule);
  if (pushResult?.sent > 0) {
    schedule.notifications = {
      ...(schedule.notifications || {}),
      deliveryBoyAtDoorSentAt: new Date(),
    };
    await schedule.save();
    return;
  }

  safeLog('[TabletService] delivery_boy_push_skipped', {
    scheduleId: String(schedule._id),
    reason:
      pushResult?.reason ||
      pushResult?.error ||
      (pushResult?.skipped ? 'skipped' : 'not_sent'),
  });
}

function resetTabletLinkState(device) {
  device.ownerUserId = null;
  device.linkedHomeId = null;
  device.isLinked = false;
  device.pairingStatus = 'unpaired';
  device.status = 'offline';
  device.onlineStatus = 'offline';
  device.lastSeenAt = null;
  device.onboardingCompleted = false;
  device.pairingCodeId = undefined;
  device.pairingSecretHash = undefined;
  device.pairingExpiresAt = undefined;
}

async function issueDeviceSecret(device) {
  const deviceSecret = `SEC_${nanoid(32)}`;
  device.deviceSecretHash = await bcrypt.hash(deviceSecret, 10);
  return deviceSecret;
}

async function ensureTabletDeviceRecord({ deviceId, hardwareId, displayName, appVersion }) {
  const device = await Device.findOne({ deviceId });
  const deviceByHardware =
    hardwareId && !device
      ? await Device.findOne({ hardwareId, type: 'tablet' })
      : null;
  const candidate = device || deviceByHardware;
  if (candidate && candidate.type !== 'tablet') {
    throw createHttpError(409, 'DEVICE_TYPE_MISMATCH', 'Device already exists with a different type');
  }

  const isReinstallOfLinkedTablet =
    Boolean(deviceByHardware) &&
    String(deviceByHardware.deviceId) !== String(deviceId);

  if (
    candidate &&
    candidate.isLinked &&
    candidate.pairingStatus === 'paired' &&
    !isReinstallOfLinkedTablet
  ) {
    return {
      device: candidate,
      alreadyPaired: true,
      isReinstallOfLinkedTablet,
    };
  }

  const found = candidate || new Device({ deviceId, type: 'tablet' });

  if (isReinstallOfLinkedTablet) {
    resetTabletLinkState(found);
    found.deviceSecretHash = undefined;
  }

  found.type = 'tablet';
  found.deviceId = deviceId;
  if (hardwareId) {
    found.hardwareId = hardwareId;
  }
  found.name = displayName || found.name || 'Dvaari Tablet';
  found.settings = {
    ...(found.settings || {}),
    displayName: displayName || found.settings?.displayName || found.name || 'Dvaari Tablet',
  };
  found.appVersion = appVersion || found.appVersion || '';
  found.capabilities = Array.from(new Set([...(found.capabilities || []), 'pairing', 'visitor_flow', 'delivery_flow', 'live_calls', 'recordings']));
  found.meta = found.meta || {};
  found.pairingStatus = 'pairing';
  if (!found.deviceSecretHash) {
    const deviceSecret = await issueDeviceSecret(found);
    found.__plainDeviceSecret = deviceSecret;
  }
  await found.save();
  return {
    device: found,
    alreadyPaired: false,
    isReinstallOfLinkedTablet,
  };
}

async function createTabletPairingSession(payload) {
  const ensured = await ensureTabletDeviceRecord(payload);
  const device = ensured.device;

  if (ensured.alreadyPaired) {
    const deviceSecret = await issueDeviceSecret(device);
    device.pairingCodeId = undefined;
    device.pairingSecretHash = undefined;
    device.pairingExpiresAt = undefined;
    await device.save();

    return {
      deviceId: device.deviceId,
      displayName: device.settings?.displayName || device.name,
      qrToken: '',
      pairingExpiresAt: null,
      deviceSecret,
      alreadyPaired: true,
      pairingRequired: false,
      onboardingCompleted: Boolean(device.onboardingCompleted),
    };
  }

  const { pairingCodeId, pairingSecret, qrToken } = makePairingToken();
  const pairingTokenHash = await bcrypt.hash(pairingSecret, 10);
  const deviceSecret = `SEC_${nanoid(32)}`;
  const deviceSecretHash = await bcrypt.hash(deviceSecret, 10);

  device.pairingCodeId = pairingCodeId;
  device.pairingSecretHash = pairingTokenHash;
  device.pairingExpiresAt = inMinutes(15);
  device.pairingStatus = 'pairing';
  device.deviceSecretHash = deviceSecretHash;
  await device.save();

  await DevicePairingSession.create({
    deviceId: device.deviceId,
    deviceMongoId: device._id,
    pairingCodeId,
    pairingTokenHash,
    expiresAt: device.pairingExpiresAt,
    meta: {
      appVersion: payload.appVersion || '',
      platform: payload.platform || 'android_tablet',
      note: 'tablet_bootstrap',
    },
  });

  return {
    deviceId: device.deviceId,
    displayName: device.settings?.displayName || device.name,
    qrToken,
    pairingExpiresAt: device.pairingExpiresAt,
    pairingPayload: {
      token: qrToken,
      expiresAt: device.pairingExpiresAt,
      deviceId: device.deviceId,
      type: 'tablet_pairing',
    },
    deviceSecret,
    alreadyPaired: false,
    pairingRequired: true,
    onboardingCompleted: Boolean(device.onboardingCompleted),
  };
}

async function claimTabletPairing(user, { qrToken, displayName }) {
  const token = String(qrToken || '');
  const match = token.match(/^PAIR_([A-Za-z0-9_-]{6,})\.([A-Za-z0-9_-]{10,})$/);
  if (!match) throw createHttpError(400, 'INVALID_QR_TOKEN', 'Invalid QR token');
  const pairingCodeId = match[1];
  const pairingSecret = match[2];
  const device = await Device.findOne({ pairingCodeId, type: 'tablet' });
  if (!device) throw createHttpError(404, 'DEVICE_NOT_FOUND', 'Tablet device not found');
  if (device.isLinked && device.pairingStatus === 'paired') throw createHttpError(409, 'DEVICE_ALREADY_PAIRED', 'Tablet already paired');
  if (!device.pairingExpiresAt || device.pairingExpiresAt <= new Date()) {
    device.pairingStatus = 'unpaired';
    await device.save();
    throw createHttpError(400, 'QR_TOKEN_EXPIRED', 'Pairing code expired');
  }
  const ok = await bcrypt.compare(pairingSecret, device.pairingSecretHash || '');
  if (!ok) throw createHttpError(400, 'INVALID_QR_TOKEN', 'Invalid QR token');

  const linked = await deviceService.linkTabletDeviceToHome(device, user, { displayName });
  linked.pairingCodeId = undefined;
  linked.pairingSecretHash = undefined;
  linked.pairingExpiresAt = undefined;
  await linked.save();

  await DevicePairingSession.findOneAndUpdate(
    { pairingCodeId, deviceMongoId: device._id, status: 'pending' },
    {
      $set: {
        status: 'completed',
        homeId: linked.linkedHomeId,
        claimedByUserId: user._id,
        claimedAt: new Date(),
        completedAt: new Date(),
      },
    }
  );

  realtime.publishMany({ userId: user._id, homeId: linked.linkedHomeId, deviceId: linked.deviceId }, 'tablet.paired', {
    tablet: getTabletProjection(linked),
  });

  return {
    tablet: getTabletProjection(linked),
    linkResult: {
      title: 'Device Linked Successfully',
      subtitle: 'Tablet paired with your mobile account',
    },
  };
}

function getHomeIdFromDevice(device) {
  return device.linkedHomeId || device.ownerUserId || null;
}

async function getTabletConfig(device) {
  const fresh = await Device.findOne({ _id: device._id, type: 'tablet' });
  if (!fresh) throw createHttpError(404, 'TABLET_NOT_FOUND', 'Tablet not found');
  const awaySetting = fresh.linkedHomeId
    ? await AwayModeSetting.findOne({ homeId: fresh.linkedHomeId })
        .select('enabled')
        .lean()
    : null;
  const awayModeEnabled = Boolean(awaySetting?.enabled);
  const owner = fresh.ownerUserId
    ? await User.findById(fresh.ownerUserId).select('name phone').lean()
    : null;
  const ownerName = String(owner?.name || '').trim();
  const ownerPhone = String(owner?.phone || '').trim();

  return {
    tablet: {
      ...getTabletProjection(fresh),
      ownerName,
      ownerPhone,
    },
    resident: {
      ownerName,
      phone: ownerPhone,
    },
    ui: {
      homeCards: ['visitor', 'delivery', 'otp'],
      simpleModeEnabled: Boolean(fresh.simpleModeEnabled),
      awayModeEnabled,
      pairingRequired: !fresh.isLinked,
      liveFeatures: {
        realtimeEvents: true,
        webrtcSignaling: true,
        recordingUpload: true,
      },
    },
    setup: {
      wifiConfigured: Boolean(fresh.wifi?.configured),
      timezoneConfigured: Boolean(fresh.settings?.timezone),
      themeConfigured: Boolean(fresh.settings?.theme),
      onboardingCompleted: Boolean(fresh.onboardingCompleted),
    },
    sync: {
      configVersion: Number(fresh.configVersion || 1),
      syncedAt: new Date(),
    },
  };
}

async function updateTabletSetup(device, patch) {
  const fresh = await Device.findOne({ _id: device._id, type: 'tablet' });
  if (!fresh) throw createHttpError(404, 'TABLET_NOT_FOUND', 'Tablet not found');

  if (patch.displayName) {
    fresh.name = patch.displayName;
    fresh.settings = { ...(fresh.settings || {}), displayName: patch.displayName };
  }
  if (patch.timezone) fresh.settings = { ...(fresh.settings || {}), timezone: patch.timezone };
  if (patch.language) fresh.settings = { ...(fresh.settings || {}), language: patch.language };
  if (patch.theme) fresh.settings = { ...(fresh.settings || {}), theme: patch.theme };
  if (patch.wallpaperPreset) fresh.settings = { ...(fresh.settings || {}), wallpaperPreset: patch.wallpaperPreset };
  if (typeof patch.fontSize === 'number') fresh.settings = { ...(fresh.settings || {}), fontSize: patch.fontSize };
  if (typeof patch.simpleModeEnabled === 'boolean') fresh.simpleModeEnabled = patch.simpleModeEnabled;
  if (typeof patch.onboardingCompleted === 'boolean') fresh.onboardingCompleted = patch.onboardingCompleted;
  fresh.configVersion = Number(fresh.configVersion || 1) + 1;
  await fresh.save();

  realtime.publishMany({ userId: fresh.ownerUserId, homeId: getHomeIdFromDevice(fresh), deviceId: fresh.deviceId }, 'tablet.config.updated', {
    tablet: getTabletProjection(fresh),
  });

  return getTabletProjection(fresh);
}

async function updateTabletWifi(device, patch) {
  const fresh = await Device.findOne({ _id: device._id, type: 'tablet' });
  if (!fresh) throw createHttpError(404, 'TABLET_NOT_FOUND', 'Tablet not found');
  fresh.wifi = {
    ...(fresh.wifi || {}),
    configured: true,
    ssid: patch.ssid,
    connected: patch.connected !== false,
    signalStrength: patch.signalStrength ?? null,
    ipAddress: patch.ipAddress || '',
    updatedAt: new Date(),
  };
  fresh.configVersion = Number(fresh.configVersion || 1) + 1;
  await fresh.save();
  return {
    ssid: fresh.wifi.ssid,
    connected: Boolean(fresh.wifi.connected),
    wifiConfigured: Boolean(fresh.wifi.configured),
    updatedAt: fresh.wifi.updatedAt,
  };
}

async function tabletHeartbeat(device, payload) {
  const updated = await deviceService.heartbeat(device, payload);
  realtime.publishMany({ userId: updated.ownerUserId, homeId: getHomeIdFromDevice(updated), deviceId: updated.deviceId }, 'tablet.heartbeat', {
    tablet: getTabletProjection(updated),
  });
  return getTabletProjection(updated);
}

async function listTabletDevices(user, query = {}) {
  const homeId = resolveHomeId(user);
  const filter = { type: 'tablet', linkedHomeId: homeId, isLinked: true };
  const docs = await Device.find(filter).sort({ createdAt: -1 });
  const items = docs.map(getTabletProjection).filter((item) => (query.status === 'all' ? true : item.onlineStatus === query.status));
  return {
    items,
    summary: {
      total: items.length,
      online: items.filter((item) => item.onlineStatus === 'online').length,
      offline: items.filter((item) => item.onlineStatus === 'offline').length,
    },
  };
}

async function getTabletDeviceForUser(user, deviceId) {
  const homeId = resolveHomeId(user);
  const device = await Device.findOne({ type: 'tablet', linkedHomeId: homeId, deviceId, isLinked: true });
  if (!device) throw createHttpError(404, 'TABLET_NOT_FOUND', 'Tablet not found');
  return getTabletProjection(device);
}

async function updateTabletDeviceForUser(user, deviceId, patch) {
  const homeId = resolveHomeId(user);
  const device = await Device.findOne({ type: 'tablet', linkedHomeId: homeId, deviceId, isLinked: true });
  if (!device) throw createHttpError(404, 'TABLET_NOT_FOUND', 'Tablet not found');
  return updateTabletSetup(device, patch);
}

async function createVisitorSession(device, payload) {
  const homeId = getHomeIdFromDevice(device);
  if (!homeId) throw createHttpError(409, 'TABLET_NOT_LINKED', 'Tablet is not linked to a home');
  const session = await VisitorSession.create({
    homeId,
    tabletDeviceId: device._id,
    residentUserId: device.ownerUserId || null,
    type: payload.type || 'visitor',
    state: 'resident_notified',
    visitorName: payload.visitorName || '',
    note: payload.note || '',
    requestedAt: new Date(),
    expiresAt: inMinutes(2),
    finalStatus: 'pending',
  });

  const response = {
    _id: session._id,
    type: session.type,
    state: session.state,
    visitorName: session.visitorName,
    note: session.note,
    requestedAt: session.requestedAt,
    requestedAtLabel: formatDateTimeLabel(session.requestedAt),
    residentNotification: {
      targetUserId: device.ownerUserId || null,
      status: 'queued',
    },
  };

  if ((session.type === 'doorbell' || session.type === 'visitor') && device.ownerUserId) {
    try {
      const user = await User.findById(device.ownerUserId).select('_id preferences fcmTokens');
      if (user) {
        if (session.type === 'doorbell' && await hasRecentDoorbellPush(session)) {
          safeLog('[TabletService] doorbell_push_skipped', {
            sessionId: String(session._id),
            homeId: String(homeId),
            tabletDeviceId: String(device._id),
            reason: 'recent_doorbell_push_exists',
            dedupeMs: DOORBELL_PUSH_DEDUPE_MS,
          });
          response.residentNotification.status = 'skipped';
          response.residentNotification.reason = 'recent_doorbell_push_exists';
        } else {
          const pushResult =
            session.type === 'doorbell'
              ? await sendDoorbellRingNotification(user, session)
              : await sendVisitorRecognitionNotification(user, session);
          response.residentNotification.status = pushResult?.sent > 0 ? 'sent' : 'skipped';
        }
      }
    } catch (error) {
      safeLog('[TabletService] visitor_push_failed', {
        sessionId: String(session._id),
        type: session.type,
        error: error.message,
      });
      response.residentNotification.status = 'failed';
    }
  }

  realtime.publishMany({ userId: device.ownerUserId, homeId, deviceId: device.deviceId }, 'tablet.visitor.created', { session: response });
  return response;
}

async function hasRecentDoorbellPush(session) {
  const requestedAt = session.requestedAt || session.createdAt || new Date();
  const since = new Date(new Date(requestedAt).getTime() - DOORBELL_PUSH_DEDUPE_MS);
  const recentSession = await VisitorSession.findOne({
    _id: { $ne: session._id },
    homeId: session.homeId,
    tabletDeviceId: session.tabletDeviceId,
    type: 'doorbell',
    requestedAt: { $gte: since, $lt: requestedAt },
  }).sort({ requestedAt: -1 }).select('_id requestedAt');

  const hasRecent = Boolean(recentSession);
  safeLog('[TabletService] doorbell_push_dedupe_checked', {
    sessionId: String(session._id),
    recentSessionId: recentSession?._id ? String(recentSession._id) : '',
    hasRecent,
    dedupeMs: DOORBELL_PUSH_DEDUPE_MS,
  });
  return hasRecent;
}

async function listVisitorSessions(user) {
  const homeId = resolveHomeId(user);
  const items = await VisitorSession.find({ homeId }).sort({ createdAt: -1 }).limit(50);
  return {
    items: items.map((session) => ({
      _id: session._id,
      type: session.type,
      state: session.state,
      visitorName: session.visitorName,
      note: session.note,
      responseNote: session.responseNote,
      requestedAt: session.requestedAt,
      requestedAtLabel: formatDateTimeLabel(session.requestedAt),
      finalStatus: session.finalStatus,
      expiresAt: session.expiresAt,
    })),
  };
}

async function getVisitorSessionForDevice(device, sessionId) {
  const homeId = getHomeIdFromDevice(device);
  const session = await VisitorSession.findOne({ _id: sessionId, homeId, tabletDeviceId: device._id });
  if (!session) throw createHttpError(404, 'VISITOR_SESSION_NOT_FOUND', 'Visitor session not found');
  return {
    _id: session._id,
    type: session.type,
    state: session.state,
    visitorName: session.visitorName,
    note: session.note,
    responseNote: session.responseNote,
    requestedAt: session.requestedAt,
    requestedAtLabel: formatDateTimeLabel(session.requestedAt),
    residentRespondedAt: session.residentRespondedAt,
    finalStatus: session.finalStatus,
    expiresAt: session.expiresAt,
    timeLeftLabel: formatRemainingLabel(session.expiresAt),
  };
}

async function respondVisitorSession(user, sessionId, payload) {
  const homeId = resolveHomeId(user);
  const session = await VisitorSession.findOne({ _id: sessionId, homeId });
  if (!session) throw createHttpError(404, 'VISITOR_SESSION_NOT_FOUND', 'Visitor session not found');
  session.state = payload.decision;
  session.finalStatus = payload.decision;
  session.responseNote = payload.note || '';
  session.residentRespondedAt = new Date();
  await session.save();
  const device = await Device.findById(session.tabletDeviceId).select('deviceId');
  realtime.publishMany({ userId: user._id, homeId, callId: null }, 'tablet.visitor.responded', {
    session: {
      _id: session._id,
      state: session.state,
      finalStatus: session.finalStatus,
      responseNote: session.responseNote,
      residentRespondedAt: session.residentRespondedAt,
    },
  });
  if (device?.deviceId) realtime.publishToDevice(device.deviceId, 'tablet.visitor.responded', { sessionId: String(session._id), decision: session.state, note: session.responseNote });
  return {
    _id: session._id,
    state: session.state,
    finalStatus: session.finalStatus,
    responseNote: session.responseNote,
    residentRespondedAt: session.residentRespondedAt,
  };
}

async function startDeliverySession(device, payload) {
  const homeId = getHomeIdFromDevice(device);
  if (!homeId) throw createHttpError(409, 'TABLET_NOT_LINKED', 'Tablet is not linked to a home');

  const ors = [];
  if (payload.orderId) ors.push({ orderId: payload.orderId });
  if (payload.awbCode) ors.push({ awbCode: payload.awbCode });
  if (!ors.length) throw createHttpError(400, 'ORDER_LOOKUP_REQUIRED', 'orderId or awbCode is required');
  const delivery = await Delivery.findOne({ homeId, $or: ors });

  // Fallback: SMS-based delivery schedule (mobile app SMS parsing).
  // This is used when the delivery exists as an "upcoming schedule" but hasn't been
  // created as a Delivery record yet.
  if (!delivery) {
    const schedule = await findMatchingDeliverySchedule(homeId, payload);
    if (!schedule) throw createHttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found for scanned code');

    // Always add a tablet-arrival marker (smsId: null), even if SMS parsing already set upon_arrival.
    schedule.statusHistory = Array.isArray(schedule.statusHistory) ? schedule.statusHistory : [];
    const hasTabletArrivalMarker = schedule.statusHistory.some(
      (entry) => entry?.status === 'upon_arrival' && !entry?.smsId
    );
    if (!hasTabletArrivalMarker) {
      schedule.statusHistory.push({
        status: 'upon_arrival',
        updatedAt: new Date(),
        smsId: null,
        messageSummary: 'Arrived at door (scanned on tablet)',
      });
    }
    schedule.currentStatus = 'upon_arrival';
    await schedule.save();
    await sendDeliveryBoyAtDoorIfEligible(device, schedule);

    const shouldUseNfcCard = schedule.verificationMethod === 'nfc';
    const shouldAwaitResidentDecision = Boolean(payload.awaitResidentDecision) && !shouldUseNfcCard;
    const scheduleCode = String(schedule.otpCode || '').replace(/\D/g, '');
    const code = scheduleCode || String(crypto.randomInt(1000, 10000));

    const baseSession = {
      homeId,
      tabletDeviceId: device._id,
      deliveryId: null,
      orderId: schedule.referenceId || payload.orderId || '',
      awbCode: payload.awbCode || schedule.awbNumber || payload.orderId || '',
      company: schedule.deliveryCompany || payload.company || '',
      partnerName: schedule.riderName || payload.partnerName || '',
      otpPreview: maskCode(code),
      otpExpiresAt: inMinutes(10),
      meta: {
        scheduleId: String(schedule._id),
        scheduleReferenceId: schedule.referenceId || '',
        scheduleStatus: schedule.currentStatus,
        scannedAt: new Date().toISOString(),
      },
    };

    const session = await DeliverySession.create(
      shouldUseNfcCard
        ? {
            ...baseSession,
            state: 'awaiting_nfc_card',
            otpCodeHash: '',
            meta: {
              ...baseSession.meta,
              pendingOtpCode: code,
              codeIssuedToTablet: false,
              verificationMethod: 'nfc',
            },
          }
        : shouldAwaitResidentDecision
        ? {
            ...baseSession,
            state: 'resident_notified',
            otpCodeHash: '',
            meta: {
              ...baseSession.meta,
              pendingOtpCode: code,
              codeIssuedToTablet: false,
            },
          }
        : {
            ...baseSession,
            state: 'otp_generated',
            otpCodeHash: await bcrypt.hash(code, 8),
            meta: {
              ...baseSession.meta,
              otpCode: code,
              codeIssuedToTablet: true,
            },
          }
    );

    // Persist exact session correlation on schedule so mobile approve/reject can promote this session reliably.
    try {
      schedule.activeTabletDeliverySessionId = session._id;
      schedule.activeTabletDeliverySessionAt = new Date();
      await schedule.save();
    } catch (e) {
      // Non-blocking
    }

    const response = {
      _id: session._id,
      state: session.state,
      orderId: baseSession.orderId,
      awbCode: session.awbCode,
      title: payload.title || schedule.productSummary || schedule.sellerName || 'Delivery',
      company: baseSession.company,
      partnerName: baseSession.partnerName,
      otpCode: shouldAwaitResidentDecision || shouldUseNfcCard ? undefined : code,
      otpPreview: session.otpPreview,
      otpExpiresAt: session.otpExpiresAt,
      screen: shouldUseNfcCard
        ? { title: 'Tap NFC card', subtitle: 'Scan the resident NFC card to reveal OTP' }
        : shouldAwaitResidentDecision
        ? { title: 'Waiting for approval', subtitle: 'Resident approval required to reveal OTP' }
        : { title: 'OTP is ready', subtitle: 'Delivery code generated for verification' },
    };

    realtime.publishMany({ userId: device.ownerUserId, homeId, deviceId: device.deviceId }, 'tablet.delivery.started', { session: response });
    return response;
  }

  // If we found a Delivery record, we still try to tag the SMS schedule so the mobile app
  // can show the "visitor at door" card based on tablet scan.
  let matchedSchedule = null;
  try {
    const schedule = await findMatchingDeliverySchedule(homeId, payload);
    if (schedule) {
      matchedSchedule = schedule;
      schedule.statusHistory = Array.isArray(schedule.statusHistory) ? schedule.statusHistory : [];
      const hasTabletArrivalMarker = schedule.statusHistory.some(
        (entry) => entry?.status === 'upon_arrival' && !entry?.smsId
      );
      if (!hasTabletArrivalMarker) {
        schedule.statusHistory.push({
          status: 'upon_arrival',
          updatedAt: new Date(),
          smsId: null,
          messageSummary: 'Arrived at door (scanned on tablet)',
        });
      }
      const needsStatusUpdate = schedule.currentStatus !== 'upon_arrival';
      if (needsStatusUpdate) schedule.currentStatus = 'upon_arrival';
      if (!hasTabletArrivalMarker || needsStatusUpdate) await schedule.save();
      if (hasTabletArrivalMarker || needsStatusUpdate) {
        await sendDeliveryBoyAtDoorIfEligible(device, schedule);
      }
    }
  } catch (e) {
    // Non-blocking: even if schedule tagging fails, OTP flow can continue using Delivery record.
  }

  // If we couldn't match a schedule using the scanned payload, retry with Delivery identifiers.
  // This improves correlation so mobile approve can promote the correct tablet session.
  if (!matchedSchedule) {
    try {
      const schedule = await findMatchingDeliverySchedule(homeId, {
        orderId: payload?.orderId || delivery.orderId || '',
        awbCode: payload?.awbCode || delivery.awbCode || '',
      });
      if (schedule) {
        matchedSchedule = schedule;
        schedule.statusHistory = Array.isArray(schedule.statusHistory) ? schedule.statusHistory : [];
        const hasTabletArrivalMarker = schedule.statusHistory.some(
          (entry) => entry?.status === 'upon_arrival' && !entry?.smsId
        );
        if (!hasTabletArrivalMarker) {
          schedule.statusHistory.push({
            status: 'upon_arrival',
            updatedAt: new Date(),
            smsId: null,
            messageSummary: 'Arrived at door (scanned on tablet)',
          });
        }
        const needsStatusUpdate = schedule.currentStatus !== 'upon_arrival';
        if (needsStatusUpdate) schedule.currentStatus = 'upon_arrival';
        if (!hasTabletArrivalMarker || needsStatusUpdate) {
          await schedule.save();
          await sendDeliveryBoyAtDoorIfEligible(device, schedule);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // Conservative fallback: if there is exactly one active upcoming schedule for this home,
  // attach it so approve/reject can promote the correct tablet session. This avoids being stuck
  // when scanned identifiers don't match SMS parsing output.
  if (!matchedSchedule) {
    try {
      const candidates = await DeliverySchedule.find({
        homeId,
        currentStatus: { $in: ['initiated', 'arriving_soon', 'out_for_delivery', 'upon_arrival'] },
      })
        .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
        .limit(2);

      if (candidates.length === 1) {
        matchedSchedule = candidates[0];
        matchedSchedule.statusHistory = Array.isArray(matchedSchedule.statusHistory) ? matchedSchedule.statusHistory : [];
        const hasTabletArrivalMarker = matchedSchedule.statusHistory.some(
          (entry) => entry?.status === 'upon_arrival' && !entry?.smsId
        );
        if (!hasTabletArrivalMarker) {
          matchedSchedule.statusHistory.push({
            status: 'upon_arrival',
            updatedAt: new Date(),
            smsId: null,
            messageSummary: 'Arrived at door (scanned on tablet)',
          });
        }
        if (matchedSchedule.currentStatus !== 'upon_arrival') matchedSchedule.currentStatus = 'upon_arrival';
        await matchedSchedule.save();
        await sendDeliveryBoyAtDoorIfEligible(device, matchedSchedule);
      }
    } catch (e) {
      // ignore
    }
  }

  const shouldUseNfcCard = matchedSchedule?.verificationMethod === 'nfc';
  const shouldAwaitResidentDecision = Boolean(payload.awaitResidentDecision) && !shouldUseNfcCard;

  const deliveryCode = String(delivery.verificationCode || delivery.otp || '').replace(/\D/g, '');
  const code = deliveryCode || String(crypto.randomInt(1000, 10000));
  const otpCodeHash = await bcrypt.hash(code, 8);

  if (!delivery.verificationCode) delivery.verificationCode = code;
  if (payload.company && !delivery.company) delivery.company = payload.company;
  if (payload.partnerName && !delivery.partnerName) delivery.partnerName = payload.partnerName;
  if (payload.title && !delivery.title) delivery.title = payload.title;
  if (payload.awbCode && !delivery.awbCode) delivery.awbCode = payload.awbCode;
  await delivery.save();

  const sessionBase = {
    homeId,
    tabletDeviceId: device._id,
    deliveryId: delivery._id,
    // Prefer scanned identifiers so we can correlate with SMS schedules and mobile actions.
    orderId: payload.orderId || payload.awbCode || delivery.orderId,
    awbCode: payload.awbCode || delivery.awbCode || payload.orderId || payload.awbCode || delivery.orderId || '',
    company: delivery.company || payload.company || '',
    partnerName: delivery.partnerName || payload.partnerName || '',
    otpPreview: maskCode(code),
    otpExpiresAt: inMinutes(10),
    meta: {
      deliveryStatus: delivery.status,
      scannedAt: new Date().toISOString(),
      scheduleId: matchedSchedule?._id ? String(matchedSchedule._id) : undefined,
      scheduleReferenceId: matchedSchedule?.referenceId ? String(matchedSchedule.referenceId) : undefined,
    },
  };

  const session = await DeliverySession.create(
    shouldUseNfcCard
      ? {
          ...sessionBase,
          state: 'awaiting_nfc_card',
          otpCodeHash: '',
          meta: {
            ...sessionBase.meta,
            pendingOtpCode: code,
            codeIssuedToTablet: false,
            verificationMethod: 'nfc',
          },
        }
      : shouldAwaitResidentDecision
      ? {
          ...sessionBase,
          state: 'resident_notified',
          otpCodeHash: '',
          meta: {
            ...sessionBase.meta,
            pendingOtpCode: code,
            codeIssuedToTablet: false,
          },
        }
      : {
          ...sessionBase,
          state: 'otp_generated',
          otpCodeHash,
          meta: {
            ...sessionBase.meta,
            otpCode: code,
            codeIssuedToTablet: true,
          },
        }
  );

  // Persist exact session correlation on matched schedule so mobile approve/reject can promote this session reliably.
  if (matchedSchedule) {
    try {
      matchedSchedule.activeTabletDeliverySessionId = session._id;
      matchedSchedule.activeTabletDeliverySessionAt = new Date();
      await matchedSchedule.save();
    } catch (e) {
      // Non-blocking
    }
  }

  const response = {
    _id: session._id,
    state: session.state,
    orderId: session.orderId,
    awbCode: session.awbCode,
    title: delivery.title || payload.title || 'Delivery',
    company: delivery.company || payload.company || '',
    partnerName: delivery.partnerName || payload.partnerName || '',
    otpCode: shouldAwaitResidentDecision || shouldUseNfcCard ? undefined : code,
    otpPreview: session.otpPreview,
    otpExpiresAt: session.otpExpiresAt,
    screen: {
      title: shouldUseNfcCard ? 'Tap NFC card' : shouldAwaitResidentDecision ? 'Waiting for approval' : 'OTP is ready',
      subtitle: shouldUseNfcCard
        ? 'Scan the resident NFC card to reveal OTP'
        : shouldAwaitResidentDecision
        ? 'Resident approval required to reveal OTP'
        : 'Delivery code generated for verification',
    },
  };

  realtime.publishMany({ userId: device.ownerUserId, homeId, deviceId: device.deviceId }, 'tablet.delivery.started', { session: response });
  return response;
}

async function getDeliverySessionForUser(user, sessionId) {
  const homeId = resolveHomeId(user);
  const session = await DeliverySession.findOne({ _id: sessionId, homeId });
  if (!session) throw createHttpError(404, 'DELIVERY_SESSION_NOT_FOUND', 'Delivery session not found');
  return {
    _id: session._id,
    state: session.state,
    orderId: session.orderId,
    awbCode: session.awbCode,
    company: session.company,
    partnerName: session.partnerName,
    otpCode: session?.meta?.codeIssuedToTablet ? (session?.meta?.otpCode || '') : undefined,
    otpPreview: session.otpPreview,
    otpExpiresAt: session.otpExpiresAt,
    verifiedAt: session.verifiedAt,
    finalStatus: session.finalStatus,
    createdAt: session.createdAt,
  };
}

async function getDeliverySessionForDevice(device, sessionId) {
  const homeId = getHomeIdFromDevice(device);
  const session = await DeliverySession.findOne({ _id: sessionId, homeId, tabletDeviceId: device._id });
  if (!session) throw createHttpError(404, 'DELIVERY_SESSION_NOT_FOUND', 'Delivery session not found');
  return {
    _id: session._id,
    state: session.state,
    orderId: session.orderId,
    awbCode: session.awbCode,
    company: session.company,
    partnerName: session.partnerName,
    // Only reveal the OTP once the resident approved the request (or the session was started without awaiting approval).
    otpCode: session?.meta?.codeIssuedToTablet ? (session?.meta?.otpCode || '') : undefined,
    otpPreview: session.otpPreview,
    otpExpiresAt: session.otpExpiresAt,
    verifiedAt: session.verifiedAt,
    finalStatus: session.finalStatus,
    rejectedAt: session?.meta?.rejectedAt || null,
    rejectionReason: session?.meta?.rejectionReason || '',
    createdAt: session.createdAt,
    timeLeftLabel: formatRemainingLabel(session.otpExpiresAt),
  };
}

async function listDeliverySessions(user) {
  const homeId = resolveHomeId(user);
  const items = await DeliverySession.find({ homeId }).sort({ createdAt: -1 }).limit(50);
  return {
    items: items.map((session) => ({
      _id: session._id,
      state: session.state,
      orderId: session.orderId,
      awbCode: session.awbCode,
      company: session.company,
      partnerName: session.partnerName,
      otpPreview: session.otpPreview,
      otpExpiresAt: session.otpExpiresAt,
      verifiedAt: session.verifiedAt,
      finalStatus: session.finalStatus,
      createdAt: session.createdAt,
    })),
  };
}

async function verifyDeliverySessionNfc(device, sessionId, uid) {
  const homeId = getHomeIdFromDevice(device);
  const session = await DeliverySession.findOne({ _id: sessionId, homeId, tabletDeviceId: device._id });
  if (!session) throw createHttpError(404, 'DELIVERY_SESSION_NOT_FOUND', 'Delivery session not found');
  if (session.state !== 'awaiting_nfc_card') {
    throw createHttpError(400, 'NFC_NOT_EXPECTED', 'This delivery is not waiting for NFC card scan');
  }

  const uidHash = hashUid(uid);
  const card = await NfcCard.findOne({ homeId, uidHash }).sort({ createdAt: -1 });
  const logBase = {
    homeId,
    uidHash,
    nfcCardId: card?._id || null,
    context: {
      flow: 'delivery_access',
      deliveryId: session.deliveryId || null,
      authorizationId: null,
    },
    deviceId: device._id,
    verifiedBy: 'tablet',
    scannedAt: new Date(),
  };

  if (!card) {
    await NfcAccessLog.create({ ...logBase, result: 'unknown', reasonCode: 'NFC_CARD_NOT_FOUND' });
    throw createHttpError(404, 'NFC_CARD_NOT_FOUND', 'NFC card not recognized');
  }
  if (card.status === 'blocked') {
    await NfcAccessLog.create({ ...logBase, result: 'blocked', reasonCode: 'NFC_CARD_BLOCKED' });
    throw createHttpError(403, 'NFC_CARD_BLOCKED', 'NFC card is blocked');
  }
  if (card.status === 'removed') {
    await NfcAccessLog.create({ ...logBase, result: 'removed', reasonCode: 'NFC_CARD_REMOVED' });
    throw createHttpError(403, 'NFC_CARD_REMOVED', 'NFC card has been removed');
  }
  if (card.status !== 'active') {
    await NfcAccessLog.create({ ...logBase, result: 'denied', reasonCode: 'NFC_ACCESS_DENIED' });
    throw createHttpError(403, 'NFC_ACCESS_DENIED', 'NFC access denied');
  }

  const scheduleId = String(session?.meta?.scheduleId || '').trim();
  const schedule = scheduleId ? await DeliverySchedule.findOne({ _id: scheduleId, homeId }) : null;
  if (schedule && schedule.verificationMethod !== 'nfc') {
    await NfcAccessLog.create({ ...logBase, result: 'denied', reasonCode: 'NFC_METHOD_CANCELLED' });
    throw createHttpError(409, 'NFC_METHOD_CANCELLED', 'NFC approval was cancelled for this delivery');
  }

  const code =
    String(session?.meta?.pendingOtpCode || session?.meta?.otpCode || '').replace(/\D/g, '') ||
    String(crypto.randomInt(1000, 10000));
  session.state = 'otp_generated';
  session.otpCodeHash = await bcrypt.hash(code, 8);
  session.otpPreview = maskCode(code);
  session.otpExpiresAt = inMinutes(10);
  session.finalStatus = '';
  session.meta = {
    ...(session.meta || {}),
    otpCode: code,
    pendingOtpCode: '',
    codeIssuedToTablet: true,
    nfcCardId: String(card._id),
    nfcVerifiedAt: new Date().toISOString(),
  };
  await session.save();

  card.lastUsedAt = new Date();
  card.totalAccessCount = (card.totalAccessCount || 0) + 1;
  await card.save();
  await NfcAccessLog.create({ ...logBase, nfcCardId: card._id, result: 'success', reasonCode: 'AUTHORIZED' });

  if (schedule) {
    schedule.currentStatus = 'upon_arrival';
    schedule.statusHistory = Array.isArray(schedule.statusHistory) ? schedule.statusHistory : [];
    schedule.statusHistory.push({
      status: 'upon_arrival',
      updatedAt: new Date(),
      smsId: null,
      messageSummary: 'Approved by NFC card',
    });
    await schedule.save();
  }

  const response = {
    _id: session._id,
    state: session.state,
    orderId: session.orderId,
    awbCode: session.awbCode,
    company: session.company,
    partnerName: session.partnerName,
    otpCode: code,
    otpPreview: session.otpPreview,
    otpExpiresAt: session.otpExpiresAt,
    screen: {
      title: 'OTP is ready',
      subtitle: 'NFC card verified successfully',
    },
  };

  realtime.publishMany({ userId: device.ownerUserId, homeId, deviceId: device.deviceId }, 'tablet.delivery.nfc_verified', { session: response });
  return response;
}

async function verifyDeliverySessionOtp(device, sessionId, code) {
  const homeId = getHomeIdFromDevice(device);
  const session = await DeliverySession.findOne({ _id: sessionId, homeId, tabletDeviceId: device._id });
  if (!session) throw createHttpError(404, 'DELIVERY_SESSION_NOT_FOUND', 'Delivery session not found');
  if (!session.otpCodeHash || (session.otpExpiresAt && session.otpExpiresAt <= new Date())) {
    session.state = 'failed';
    session.finalStatus = 'otp_expired';
    await session.save();
    throw createHttpError(400, 'DELIVERY_OTP_EXPIRED', 'Delivery OTP expired');
  }
  const ok = await bcrypt.compare(String(code), session.otpCodeHash);
  if (!ok) {
    session.state = 'failed';
    session.finalStatus = 'invalid_code';
    await session.save();
    throw createHttpError(400, 'INVALID_DELIVERY_OTP', 'Invalid delivery OTP');
  }

  session.state = 'completed';
  session.finalStatus = 'verified';
  session.verifiedAt = new Date();
  await session.save();

  // If this session is tied to an SMS-based schedule (tablet scan flow), mark it delivered so
  // the mobile app moves it out of "upcoming" and hides the "Visitor at Door" card.
  try {
    const scheduleIdRaw = session?.meta?.scheduleId;
    const scheduleId = scheduleIdRaw ? String(scheduleIdRaw).trim() : '';
    const scheduleQuery = scheduleId
      ? { _id: scheduleId, homeId }
      : { homeId, activeTabletDeliverySessionId: session._id };

    const schedule = await DeliverySchedule.findOne(scheduleQuery);
    if (schedule) {
      schedule.currentStatus = 'delivered';
      schedule.markedDelivered = true;
      schedule.completedAt = new Date();
      schedule.statusHistory = Array.isArray(schedule.statusHistory) ? schedule.statusHistory : [];
      schedule.statusHistory.push({
        status: 'delivered',
        updatedAt: new Date(),
        smsId: null,
        messageSummary: 'Verified on tablet',
      });
      await schedule.save();
    }
  } catch (e) {
    // non-blocking
  }

  if (session.deliveryId) {
    const delivery = await Delivery.findById(session.deliveryId);
    if (delivery) {
      delivery.status = 'delivered';
      delivery.deliveredAt = new Date();
      delivery.verificationMethod = session?.meta?.verificationMethod === 'nfc' ? 'nfc' : 'app';
      delivery.verificationCode = String(code);
      await delivery.save();
    }
  }

  const response = {
    _id: session._id,
    state: session.state,
    finalStatus: session.finalStatus,
    verifiedAt: session.verifiedAt,
    screen: {
      title: 'Code Scanned',
      subtitle: 'Delivery verified successfully',
    },
  };

  realtime.publishMany({ userId: device.ownerUserId, homeId, deviceId: device.deviceId }, 'tablet.delivery.verified', { session: response });
  return response;
}

async function ensureDeliveryForSession(device, homeId, session) {
  let delivery = null;
  if (session.deliveryId) {
    delivery = await Delivery.findById(session.deliveryId);
  }

  if (delivery) return delivery;

  const orderIdCandidate = String(session.orderId || session.awbCode || '').trim();
  const orderId = orderIdCandidate || `tablet-${String(session._id)}`;

  delivery = await Delivery.findOneAndUpdate(
    { homeId, orderId },
    {
      $setOnInsert: {
        homeId,
        createdByDeviceId: device._id,
        orderId,
        title: String(session.meta?.title || session.orderId || 'Delivery').trim(),
        status: 'upcoming',
        verificationMethod: 'none',
        verificationStatus: 'not_started',
        recordingSaved: true,
      },
      $set: {
        awbCode: String(session.awbCode || '').trim(),
        company: String(session.company || '').trim(),
        partnerName: String(session.partnerName || '').trim(),
      },
    },
    { upsert: true, new: true }
  );

  if (!session.deliveryId) {
    session.deliveryId = delivery._id;
    await session.save();
  }

  return delivery;
}

async function uploadDeliveryImage(device, sessionId, file, payload = {}) {
  if (!file || !file.buffer) throw createHttpError(400, 'DELIVERY_IMAGE_REQUIRED', 'Delivery image is required');

  const homeId = getHomeIdFromDevice(device);
  if (!homeId) throw createHttpError(409, 'TABLET_NOT_LINKED', 'Tablet is not linked to a home');

  const session = await DeliverySession.findOne({ _id: sessionId, homeId, tabletDeviceId: device._id });
  if (!session) throw createHttpError(404, 'DELIVERY_SESSION_NOT_FOUND', 'Delivery session not found');

  const delivery = await ensureDeliveryForSession(device, homeId, session);
  const originalName = sanitizeName(file.originalname || `delivery-${String(session._id)}-${Date.now()}.jpg`);
  safeLog('[TABLET][DELIVERY_IMAGE]', 'uploading delivery snapshot to ImageKit', {
    device: String(device.deviceId || device._id),
    session: String(session._id),
    sizeBytes: file.size || file.buffer.length,
    mimeType: file.mimetype || 'image/jpeg',
  });
  const imageKitResult = await uploadImage({
    buffer: file.buffer,
    fileName: originalName,
    folder: '/dvaari/delivery-snaps',
    contentType: file.mimetype || 'image/jpeg',
    tags: ['delivery-proof', String(homeId), String(device.deviceId), String(session._id)],
  });
  const imageUrl = String(imageKitResult.url || '').split('?')[0];
  if (!imageUrl) throw createHttpError(502, 'IMAGEKIT_UPLOAD_FAILED', 'ImageKit did not return an image URL');

  const recording = await TabletRecording.create({
    homeId,
    tabletDeviceId: device._id,
    residentUserId: device.ownerUserId || null,
    callSessionId: null,
    visitorSessionId: null,
    deliverySessionId: session._id,
    deliveryId: delivery?._id || null,
    type: 'delivery',
    status: 'ready',
    storageProvider: 'imagekit',
    storageKey: imageKitResult.fileId || imageUrl,
    thumbnailStorageKey: imageUrl,
    fileName: originalName,
    mimeType: file.mimetype || 'image/jpeg',
    sizeBytes: file.size || file.buffer.length,
    durationSeconds: null,
    sha256: sha256Buffer(file.buffer),
    uploadedBy: 'tablet',
    metadata: {
      note: String(payload.note || '').trim(),
      source: 'delivery_otp_snapshot',
      imageUrl,
      imageKitFileId: imageKitResult.fileId || '',
      imageKitFolder: imageKitResult.filePath || '',
    },
    readyAt: new Date(),
  });

  delivery.recordingSaved = true;
  delivery.recordingUrl = imageUrl;
  delivery.recordingThumbnailUrl = imageUrl;
  delivery.recordingDurationSeconds = null;
  delivery.recordingSizeBytes = recording.sizeBytes;
  delivery.recordingQuality = 'Image';
  delivery.recordingMimeType = recording.mimeType;
  delivery.recordingStorageProvider = 'imagekit';
  delivery.packageImageUrl = imageUrl;
  await delivery.save();

  safeLog('[TABLET][DELIVERY_IMAGE]', 'delivery snapshot saved', {
    device: String(device.deviceId || device._id),
    session: String(session._id),
    delivery: delivery?._id ? String(delivery._id) : null,
    recording: String(recording._id),
    imageUrl,
  });

  realtime.publishMany({ userId: device.ownerUserId, homeId, deviceId: device.deviceId }, 'tablet.delivery.image.ready', {
    sessionId: String(session._id),
    deliveryId: delivery?._id ? String(delivery._id) : null,
    recordingId: String(recording._id),
    imageUrl,
  });

  return {
    sessionId: String(session._id),
    deliveryId: delivery?._id ? String(delivery._id) : null,
    recordingId: String(recording._id),
    imageUrl,
    thumbnailUrl: imageUrl,
  };
}

async function uploadDeliveryRecording(device, sessionId, file, payload = {}) {
  if (!file) throw createHttpError(400, 'RECORDING_FILE_REQUIRED', 'Recording file is required');

  const homeId = getHomeIdFromDevice(device);
  if (!homeId) throw createHttpError(409, 'TABLET_NOT_LINKED', 'Tablet is not linked to a home');

  const session = await DeliverySession.findOne({ _id: sessionId, homeId, tabletDeviceId: device._id });
  if (!session) throw createHttpError(404, 'DELIVERY_SESSION_NOT_FOUND', 'Delivery session not found');

  // Ensure we have a Delivery record to attach the recording to (mobile recordings UI relies on Delivery.recordingUrl).
  let delivery = null;
  if (session.deliveryId) {
    delivery = await Delivery.findById(session.deliveryId);
  }

  if (!delivery) {
    const orderIdCandidate = String(session.orderId || session.awbCode || '').trim();
    const orderId = orderIdCandidate || `tablet-${String(session._id)}`;

    delivery = await Delivery.findOneAndUpdate(
      { homeId, orderId },
      {
        $setOnInsert: {
          homeId,
          createdByDeviceId: device._id,
          orderId,
          title: String(session.meta?.title || session.orderId || 'Delivery').trim(),
          status: 'upcoming',
          verificationMethod: 'none',
          verificationStatus: 'not_started',
          recordingSaved: true,
        },
        $set: {
          awbCode: String(session.awbCode || '').trim(),
          company: String(session.company || '').trim(),
          partnerName: String(session.partnerName || '').trim(),
        },
      },
      { upsert: true, new: true }
    );

    // Backfill link on session for future lifecycle updates (verified -> delivered, etc).
    if (!session.deliveryId) {
      session.deliveryId = delivery._id;
      await session.save();
    }
  }

  const ext = path.extname(file.originalname || '') || '.mp4';
  const baseName = sanitizeName(path.basename(file.originalname || `delivery-${Date.now()}${ext}`));
  const objectKey = `object-store/${String(homeId)}/${String(device._id)}/delivery-${String(session._id)}-${Date.now()}-${baseName}`;
  const thumbKey = `thumbnails/${String(homeId)}/${String(device._id)}/delivery-${String(session._id)}-${Date.now()}-${path.parse(baseName).name}.png`;

  const fileBuffer = fs.readFileSync(file.path);
  const uploadResult = await putObject({ key: objectKey, buffer: fileBuffer, contentType: file.mimetype || 'video/mp4' });

  const localThumbPath = path.join(process.cwd(), 'private_uploads', 'recordings', thumbKey);
  fs.mkdirSync(path.dirname(localThumbPath), { recursive: true });
  await generateVideoThumbnail(file.path, localThumbPath);

  let thumbProvider = 'local';
  if (getProvider() === 's3') {
    const thumbBuffer = fs.readFileSync(localThumbPath);
    await putObject({ key: thumbKey, buffer: thumbBuffer, contentType: 'image/png' });
    thumbProvider = 's3';
  }

  const durationSeconds = payload.durationSeconds ? Number(payload.durationSeconds) : null;
  const recording = await TabletRecording.create({
    homeId,
    tabletDeviceId: device._id,
    residentUserId: device.ownerUserId || null,
    callSessionId: null,
    visitorSessionId: null,
    deliverySessionId: session._id,
    deliveryId: delivery?._id || null,
    type: 'delivery',
    status: 'ready',
    storageProvider: uploadResult.provider,
    storageKey: objectKey,
    thumbnailStorageKey: thumbKey,
    fileName: file.originalname || baseName,
    mimeType: file.mimetype || 'video/mp4',
    sizeBytes: file.size || fileBuffer.length,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    sha256: sha256File(file.path),
    uploadedBy: 'tablet',
    metadata: {
      note: String(payload.note || '').trim(),
      thumbnailProvider: thumbProvider,
      source: 'delivery_session',
    },
    readyAt: new Date(),
  });

  // Expose recording through existing delivery recordings APIs (Delivery.recordingUrl is used as streamUrl).
  delivery.recordingSaved = true;
  delivery.recordingUrl = `/api/v1/tablet/recordings/${recording._id}/link`;
  delivery.recordingThumbnailUrl = `/api/v1/tablet/recordings/${recording._id}/thumbnail`;
  delivery.recordingDurationSeconds = recording.durationSeconds;
  delivery.recordingSizeBytes = recording.sizeBytes;
  if (!delivery.recordingQuality) delivery.recordingQuality = 'HD';
  await delivery.save();

  fs.unlink(file.path, () => {});

  return {
    sessionId: String(session._id),
    deliveryId: delivery?._id ? String(delivery._id) : null,
    recordingId: String(recording._id),
    recordingUrl: delivery.recordingUrl,
    recordingThumbnailUrl: delivery.recordingThumbnailUrl,
  };
}

async function getActingUserForDevice(device) {
  if (device.ownerUserId) {
    const user = await User.findById(device.ownerUserId).select('_id name email phone isVerified primaryHomeId preferences roles');
    if (user) return user;
  }
  const fallback = await User.findOne({ primaryHomeId: getHomeIdFromDevice(device) }).select('_id name email phone isVerified primaryHomeId preferences roles');
  if (fallback) return fallback;
  throw createHttpError(404, 'ACTING_USER_NOT_FOUND', 'Unable to resolve acting user for device');
}

async function verifyAccessCode(device, payload) {
  const homeId = getHomeIdFromDevice(device);
  if (!homeId) throw createHttpError(409, 'TABLET_NOT_LINKED', 'Tablet is not linked to a home');
  const code = String(payload.code || '').trim();
  const sourceHint = payload.sourceHint || 'auto';
  const now = new Date();

  if (sourceHint === 'authorization' || sourceHint === 'auto') {
    const authorization = await Authorization.findOne({ homeId, accessCode: code, 'status.current': 'ACTIVE' });
    if (authorization) {
      const actingUser = await getActingUserForDevice(device);
      const result = await authorizationService.markAuthorizationUsed(actingUser, authorization._id, {
        usedByDeviceId: device._id,
        usedByName: payload.deliveryPersonName || authorization.deliveryPersonName || 'Tablet Device',
        verificationMethod: 'access_code',
      });
      return { source: 'authorization', title: 'Code Scanned', subtitle: 'Authorization code verified successfully', authorization: result };
    }
  }

  if (sourceHint === 'away_mode' || sourceHint === 'auto') {
    const away = await AwayModeSetting.findOne({ homeId, 'temporaryCode.displayCode': code, 'temporaryCode.status': 'active' });
    if (away && (!away.temporaryCode.validUntil || new Date(away.temporaryCode.validUntil) > now)) {
      away.temporaryCode.status = 'used';
      away.temporaryCode.usedAt = now;
      await away.save();
      return {
        source: 'away_mode',
        title: 'Code Scanned',
        subtitle: 'Away mode temporary code verified',
        temporaryCode: { status: away.temporaryCode.status, usedAt: away.temporaryCode.usedAt },
      };
    }
  }

  if (sourceHint === 'backup_assignment' || sourceHint === 'auto') {
    const backup = await BackupAssignment.findOne({ homeId, otpCode: code, status: 'active' });
    if (backup && new Date(backup.validUntil) > now) {
      backup.status = 'used';
      backup.lastUsedAt = now;
      await backup.save();
      return {
        source: 'backup_assignment',
        title: 'Code Scanned',
        subtitle: 'Backup access code verified',
        backupAssignment: { _id: backup._id, guestName: backup.guestName, status: backup.status, lastUsedAt: backup.lastUsedAt },
      };
    }
  }

  throw createHttpError(404, 'ACCESS_CODE_NOT_FOUND', 'Access code not found or expired');
}

module.exports = {
  createTabletPairingSession,
  claimTabletPairing,
  getTabletConfig,
  updateTabletSetup,
  updateTabletWifi,
  tabletHeartbeat,
  listTabletDevices,
  getTabletDeviceForUser,
  updateTabletDeviceForUser,
  createVisitorSession,
  listVisitorSessions,
  getVisitorSessionForDevice,
  respondVisitorSession,
  startDeliverySession,
  listDeliverySessions,
  getDeliverySessionForUser,
  getDeliverySessionForDevice,
  verifyDeliverySessionOtp,
  verifyDeliverySessionNfc,
  uploadDeliveryImage,
  uploadDeliveryRecording,
  verifyAccessCode,
};
