const Device = require('../models/Device');
const User = require('../models/User');
const realtime = require('./realtime.service');
const { sendTabletOfflineNotification } = require('./pushNotification.service');
const { logs } = require('../utils/logger');

// Keep a wider offline window to avoid false-positive offline pushes
// caused by short network hiccups or delayed heartbeats.
const OFFLINE_THRESHOLD_MS = 90 * 1000;
const MONITOR_INTERVAL_MS = 10 * 1000;

let monitorTimer = null;
let monitorRunning = false;

function getErrorDetails(error) {
  return {
    message: error?.message || String(error),
    name: error?.name || null,
    stack: error?.stack || null,
  };
}

function computeOnlineStatus(device) {
  if (String(device?.onlineStatus || device?.status || '').toLowerCase() === 'offline') {
    return 'offline';
  }

  const lastSeen = device?.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
  return lastSeen && Date.now() - lastSeen < OFFLINE_THRESHOLD_MS ? 'online' : 'offline';
}

async function handleTabletOffline(device) {
  // Re-read the latest device state before marking offline/pushing notification.
  // The sweep list can be slightly stale by the time this device is processed.
  const freshDevice = await Device.findById(device._id);
  if (!freshDevice) {
    return;
  }
  if (computeOnlineStatus(freshDevice) !== 'offline') {
    return;
  }

  const now = new Date();
  const alreadyNotifiedAt = freshDevice.presence?.offlineNotificationSentAt || null;
  const shouldNotify =
    !alreadyNotifiedAt ||
    (freshDevice.lastSeenAt &&
      new Date(alreadyNotifiedAt).getTime() < new Date(freshDevice.lastSeenAt).getTime());

  freshDevice.status = 'offline';
  freshDevice.onlineStatus = 'offline';
  freshDevice.presence = {
    ...(freshDevice.presence || {}),
    lastOfflineDetectedAt: now,
    offlineNotificationSentAt: shouldNotify ? now : alreadyNotifiedAt,
  };
  await freshDevice.save();

  realtime.publishMany(
    {
      userId: freshDevice.ownerUserId,
      homeId: freshDevice.linkedHomeId || freshDevice.ownerUserId,
      deviceId: freshDevice.deviceId,
    },
    'tablet.offline',
    {
      deviceId: freshDevice.deviceId,
      detectedAt: now.toISOString(),
    },
  );

  if (!shouldNotify || !freshDevice.ownerUserId) {
    return;
  }

  try {
    const user = await User.findById(freshDevice.ownerUserId).select(
      '_id preferences fcmTokens',
    );
    if (!user) {
      return;
    }
    await sendTabletOfflineNotification(user, freshDevice);
  } catch (error) {
    logs.error('[DevicePresenceMonitor] tablet_offline_push_failed', {
      deviceId: freshDevice.deviceId,
      error: getErrorDetails(error),
    });
  }
}

async function sweepTabletPresence() {
  if (monitorRunning) {
    return;
  }

  monitorRunning = true;
  try {
    const tablets = await Device.find({
      type: 'tablet',
      isLinked: true,
      lastSeenAt: { $ne: null },
    });

    for (const device of tablets) {
      if (computeOnlineStatus(device) === 'offline') {
        await handleTabletOffline(device);
      }
    }
  } catch (error) {
    logs.error('[DevicePresenceMonitor] sweep_failed', {
      error: getErrorDetails(error),
    });
  } finally {
    monitorRunning = false;
  }
}

function startDevicePresenceMonitor() {
  if (monitorTimer) {
    return;
  }

  monitorTimer = setInterval(() => {
    void sweepTabletPresence();
  }, MONITOR_INTERVAL_MS);

  if (typeof monitorTimer.unref === 'function') {
    monitorTimer.unref();
  }

  logs.info('[DevicePresenceMonitor] started', {
    intervalMs: MONITOR_INTERVAL_MS,
    offlineThresholdMs: OFFLINE_THRESHOLD_MS,
  });

  void sweepTabletPresence();
}

module.exports = {
  startDevicePresenceMonitor,
  computeOnlineStatus,
  OFFLINE_THRESHOLD_MS,
};
