const fs = require('fs');
const admin = require('firebase-admin');
const path = require('path');

const User = require('../models/User');
const { env } = require('../config/env');
const { safeLog, logs } = require('../utils/logger');

let firebaseApp = null;
let firebaseInitAttempted = false;
let firebaseInitError = null;
let firebaseInitLastAttemptAt = 0;
const DEFAULT_CHANNEL_ID = 'dvaari-alerts-v3';
const DEFAULT_CALL_CHANNEL_ID = 'dvaari-calls-v1';
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const FIREBASE_INIT_RETRY_MS = 60000;
const GOOGLE_OAUTH_TIMEFRAME_RE = /Invalid JWT: Token must be a short-lived token|iat and exp|server time is not properly synced/i;

function resolveFirebaseServiceAccountPath(accountPath) {
  const trimmedPath = String(accountPath || '').trim();
  if (!trimmedPath) {
    return { resolvedPath: null, candidates: [] };
  }

  const normalizedForBasename = trimmedPath.replace(/\\/g, '/');
  const baseName = path.basename(normalizedForBasename);
  const candidates = [
    trimmedPath,
    path.resolve(BACKEND_ROOT, trimmedPath),
    path.resolve(process.cwd(), trimmedPath),
  ];

  if (baseName) {
    candidates.push(path.resolve(BACKEND_ROOT, baseName));
    candidates.push(path.resolve(process.cwd(), baseName));
    candidates.push(path.resolve(BACKEND_ROOT, 'config', baseName));
    candidates.push(path.resolve(process.cwd(), 'config', baseName));
  }

  const uniqueCandidates = [...new Set(candidates.map(candidate => String(candidate || '').trim()).filter(Boolean))];
  const existingPath = uniqueCandidates.find(candidate => fs.existsSync(candidate));
  return {
    resolvedPath: existingPath ? path.resolve(existingPath) : null,
    candidates: uniqueCandidates,
  };
}

function getFirebaseJsonCredential() {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return null;
  }

  try {
    return admin.credential.cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON));
  } catch (error) {
    safeLog('[PUSH]', 'invalid_service_account_json', {
      error: error.message,
      backendRoot: BACKEND_ROOT,
    });
    throw error;
  }
}

function getFirebaseCredential() {
  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const { resolvedPath, candidates } = resolveFirebaseServiceAccountPath(
      env.FIREBASE_SERVICE_ACCOUNT_PATH,
    );
    if (!resolvedPath) {
      safeLog('[PUSH]', 'service_account_file_missing', {
        configuredPath: String(env.FIREBASE_SERVICE_ACCOUNT_PATH || ''),
        backendRoot: BACKEND_ROOT,
        cwd: process.cwd(),
        candidates,
        jsonFallbackConfigured: Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON),
      });

      const jsonCredential = getFirebaseJsonCredential();
      if (jsonCredential) {
        return jsonCredential;
      }

      const error = new Error('Firebase service account file not found.');
      throw error;
    }

    try {
      const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
      return admin.credential.cert(serviceAccount);
    } catch (error) {
      safeLog('[PUSH]', 'service_account_file_invalid', {
        resolvedPath,
        error: error.message,
      });
      throw error;
    }
  }

  return getFirebaseJsonCredential();
}

function getFirebaseApp() {
  if (firebaseApp) {
    return firebaseApp;
  }

  if (firebaseInitAttempted) {
    const canRetry = Date.now() - firebaseInitLastAttemptAt > FIREBASE_INIT_RETRY_MS;
    if (!canRetry) {
      return null;
    }
  }

  if (admin.apps.length > 0) {
    firebaseApp = admin.app();
    return firebaseApp;
  }

  firebaseInitAttempted = true;
  firebaseInitLastAttemptAt = Date.now();

  try {
    const credential = getFirebaseCredential();
    const projectId = String(env.FIREBASE_PROJECT_ID || '').trim();

    if (!credential && !projectId) {
      firebaseInitError =
        'Firebase Admin credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_PROJECT_ID with ADC.';
      safeLog('[PUSH]', 'firebase_admin_unavailable', { reason: firebaseInitError });
      return null;
    }

    const appConfig = {};
    if (credential) {
      appConfig.credential = credential;
    }
    if (projectId) {
      appConfig.projectId = projectId;
    }

    firebaseApp = admin.initializeApp(appConfig);
    firebaseInitError = null;
    return firebaseApp;
  } catch (error) {
    firebaseInitError = error.message;
    const isClockSkew = GOOGLE_OAUTH_TIMEFRAME_RE.test(String(error.message || ''));
    safeLog('[PUSH]', 'firebase_admin_init_failed', {
      error: error.message,
      code: isClockSkew ? 'SERVER_TIME_NOT_SYNCED' : 'FIREBASE_ADMIN_INIT_FAILED',
      serverTime: new Date().toISOString(),
      configuredPath: String(env.FIREBASE_SERVICE_ACCOUNT_PATH || ''),
      backendRoot: BACKEND_ROOT,
      cwd: process.cwd(),
      jsonConfigured: Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON),
    });
    return null;
  }
}

function getMessageType(message) {
  return String(message?.data?.type || message?.notification?.title || 'unknown').trim();
}

function isNotificationPreferenceEnabled(user, preferenceKey) {
  if (!preferenceKey) {
    return true;
  }

  return user?.preferences?.notifications?.[preferenceKey] !== false;
}

function buildDeliveryPushBody(schedule, fallback) {
  const company = String(schedule?.deliveryCompany || '').trim();
  const orderHint = String(schedule?.orderHint || schedule?.referenceId || '').trim();
  const awbCode = String(schedule?.awbNumber || '').trim();

  const parts = [company, orderHint || awbCode].filter(Boolean);
  return parts.length > 0 ? parts.join(' - ') : fallback;
}

function buildDoorbellPushBody(session) {
  const visitorName = String(session?.visitorName || '').trim();
  const note = String(session?.note || '').trim();
  const parts = [visitorName, note].filter(Boolean);
  return parts.length ? parts.join(' - ') : 'Someone rang your doorbell.';
}

function buildTabletOfflineBody(device) {
  const displayName = String(
    device?.settings?.displayName || device?.name || 'Your tablet',
  ).trim();
  return `${displayName} is offline right now.`;
}

function buildVisitorRecognitionBody(session) {
  const visitorName = String(session?.visitorName || '').trim();
  const note = String(session?.note || '').trim();
  if (visitorName && note) return `${visitorName} - ${note}`;
  if (visitorName) return `${visitorName} has arrived at your door.`;
  if (note) return note;
  return 'A recognized visitor has arrived at your door.';
}

function buildSecurityAlertBody(payload) {
  const title = String(payload?.title || '').trim();
  const subtitle = String(payload?.body || payload?.message || '').trim();
  return subtitle || title || 'A security event needs your attention.';
}

function buildWeeklySummaryBody(payload) {
  const body = String(payload?.body || '').trim();
  return body || 'Your weekly activity summary is ready to review.';
}

function buildIncomingCallBody(payload) {
  const tabletName = String(payload?.callerName || 'Visitor at Door').trim();
  const note = String(payload?.note || '').trim();
  if (note) {
    return `${tabletName} - ${note}`;
  }
  return 'Incoming voice call';
}

function buildNotificationMessage({ title, body, type, schedule, data = {}, deepLink }) {
  return {
    notification: {
      title,
      body,
    },
    data: {
      type,
      scheduleId: String(schedule?._id || ''),
      orderId: String(schedule?.orderHint || schedule?.referenceId || ''),
      awbCode: String(schedule?.awbNumber || ''),
      deepLink:
        deepLink ||
        (type === 'delivery_boy_at_door' || type === 'doorbell_at_door'
          ? 'dvari://home'
          : `dvari://delivery/${String(schedule?._id || '')}`),
      title,
      body,
      ...data,
    },
    android: {
      priority: 'high',
      notification: {
        channelId: DEFAULT_CHANNEL_ID,
        priority: 'high',
        defaultSound: true,
        sound: 'default',
      },
    },
  };
}

function buildIncomingCallMessage({ title, body, callId, data = {} }) {
  return {
    data: {
      type: 'incoming_call',
      callId: String(callId || ''),
      deepLink: 'dvari://incoming-call/' + String(callId || ''),
      title,
      body,
      ...data,
    },
    android: {
      priority: 'high',
      ttl: 30000,
    },
  };
}

function buildCallEndedMessage({ callId, reason = '', data = {} }) {
  return {
    data: {
      type: 'call_ended',
      callId: String(callId || ''),
      reason: String(reason || ''),
      title: 'Call ended',
      body: 'The tablet call has ended.',
      ...data,
    },
    android: {
      priority: 'high',
      ttl: 10000,
    },
  };
}

function normalizeFcmData(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}

async function getPushUser(user) {
  if (!user?._id) {
    return null;
  }

  if (Array.isArray(user.fcmTokens) && typeof user.isDeleted === 'boolean') {
    return user;
  }

  return User.findById(user._id).select('_id preferences fcmTokens isDeleted deletedAt');
}

async function pruneInvalidTokens(userId, invalidTokens) {
  if (!invalidTokens.length) return;
  await User.updateOne(
    { _id: userId },
    {
      $pull: {
        fcmTokens: {
          token: { $in: invalidTokens },
        },
      },
    },
  );
}

async function sendPushToUser(user, message, options = {}) {
  const pushUser = await getPushUser(user);
  if (!pushUser?._id) {
    safeLog('[PUSH]', 'push_skipped', {
      reason: 'missing_user',
      type: getMessageType(message),
    });
    return { sent: 0, skipped: true, reason: 'missing_user' };
  }

  if (pushUser.isDeleted === true) {
    logs.info('[PUSH] skipped deleted user', {
      userId: String(pushUser._id),
      type: getMessageType(message),
    });
    return { sent: 0, skipped: true, reason: 'account_deleted' };
  }

  if (!isNotificationPreferenceEnabled(pushUser, options.preferenceKey)) {
    safeLog('[PUSH]', 'push_skipped', {
      userId: String(pushUser._id),
      type: getMessageType(message),
      preferenceKey: options.preferenceKey,
      reason: 'notification_preference_disabled',
    });
    return { sent: 0, skipped: true, reason: 'notification_preference_disabled' };
  }

  const tokens = Array.isArray(pushUser.fcmTokens)
    ? [
        ...new Set(
          pushUser.fcmTokens
            .map(item => String(item?.token || '').trim())
            .filter(Boolean),
        ),
      ]
    : [];

  if (!tokens.length) {
    safeLog('[PUSH]', 'no_fcm_tokens', {
      userId: String(pushUser._id),
      type: getMessageType(message),
    });
    return { sent: 0, skipped: true, reason: 'no_fcm_tokens' };
  }

  safeLog('[PUSH]', 'push_attempt', {
    userId: String(pushUser._id),
    type: getMessageType(message),
    tokenCount: tokens.length,
    preferenceKey: options.preferenceKey || '',
  });

  const app = getFirebaseApp();
  if (!app) {
    safeLog('[PUSH]', 'push_skipped', {
      userId: String(pushUser._id),
      type: getMessageType(message),
      reason: firebaseInitError || 'firebase_admin_not_configured',
    });
    return {
      sent: 0,
      skipped: true,
      reason: firebaseInitError || 'firebase_admin_not_configured',
    };
  }

  const messaging = admin.messaging(app);
  const scopedMessage = {
    ...message,
    data: {
      ...normalizeFcmData(message.data || {}),
      targetUserId: String(pushUser._id),
    },
  };
  let response;

  try {
    response = await messaging.sendEachForMulticast({
      tokens,
      ...scopedMessage,
    });
  } catch (error) {
    const isClockSkew = GOOGLE_OAUTH_TIMEFRAME_RE.test(String(error.message || ''));
    safeLog('[PUSH]', 'delivery_notification_failed', {
      userId: String(pushUser._id),
      error: error.message,
      code: isClockSkew ? 'SERVER_TIME_NOT_SYNCED' : 'FCM_SEND_FAILED',
      serverTime: new Date().toISOString(),
    });
    return {
      sent: 0,
      failed: tokens.length,
      skipped: false,
      error: error.message,
      reason: isClockSkew ? 'server_time_not_synced' : 'fcm_send_failed',
    };
  }

  const invalidTokens = [];
  const errorCodes = [];
  const errorDetails = [];
  response.responses.forEach((item, index) => {
    if (!item.success) {
      const code = String(item.error?.code || '');
      const message = String(item.error?.message || '');
      if (code) {
        errorCodes.push(code);
      }
      errorDetails.push({
        code,
        message,
        reason: GOOGLE_OAUTH_TIMEFRAME_RE.test(message) ? 'server_time_not_synced' : '',
        tokenPreview: tokens[index] ? tokens[index].slice(0, 12) : '',
      });
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token')
      ) {
        invalidTokens.push(tokens[index]);
      }
    }
  });

  if (invalidTokens.length) {
    await pruneInvalidTokens(pushUser._id, invalidTokens);
  }

  safeLog('[PUSH]', 'delivery_notification_sent', {
    userId: String(pushUser._id),
    sent: response.successCount,
    failed: response.failureCount,
    invalidTokens: invalidTokens.length,
    errorCodes: [...new Set(errorCodes)].slice(0, 5),
    errorDetails: errorDetails.slice(0, 3),
  });

  return {
    sent: response.successCount,
    failed: response.failureCount,
    errorCodes: [...new Set(errorCodes)],
    errorDetails,
  };
}

async function sendUpcomingDeliveryScheduledNotification(user, schedule) {
  return sendPushToUser(
    user,
    buildNotificationMessage({
      title: 'New upcoming delivery scheduled',
      body: buildDeliveryPushBody(
        schedule,
        'A new delivery has been scheduled for your address.',
      ),
      type: 'upcoming_delivery_scheduled',
      schedule,
    }),
    { preferenceKey: 'deliveryNotifications' },
  );
}

async function sendDeliveryBoyAtDoorNotification(user, schedule) {
  return sendPushToUser(
    user,
    buildNotificationMessage({
      title: 'Delivery boy at door',
      body: buildDeliveryPushBody(
        schedule,
        'A delivery partner has arrived and is waiting for your approval.',
      ),
      type: 'delivery_boy_at_door',
      schedule,
    }),
    { preferenceKey: 'deliveryNotifications' },
  );
}

async function sendDoorbellRingNotification(user, session) {
  return sendPushToUser(
    user,
    buildNotificationMessage({
      title: 'Visitor at door',
      body: buildDoorbellPushBody(session),
      type: 'doorbell_at_door',
      deepLink: 'dvari://home',
      data: {
        visitorSessionId: String(session?._id || ''),
      },
    }),
    { preferenceKey: 'doorbellAlerts' },
  );
}

async function sendTabletOfflineNotification(user, device) {
  return sendPushToUser(
    user,
    buildNotificationMessage({
      title: 'Tablet offline',
      body: buildTabletOfflineBody(device),
      type: 'tablet_offline',
      deepLink: 'dvari://home',
      data: {
        deviceId: String(device?.deviceId || ''),
      },
    }),
    { preferenceKey: 'deviceStatus' },
  );
}

async function sendVisitorRecognitionNotification(user, session) {
  return sendPushToUser(
    user,
    buildNotificationMessage({
      title: 'Visitor recognized',
      body: buildVisitorRecognitionBody(session),
      type: 'visitor_recognition',
      deepLink: 'dvari://home',
      data: {
        visitorSessionId: String(session?._id || ''),
      },
    }),
    { preferenceKey: 'visitorRecognition' },
  );
}

async function sendSecurityAlertNotification(user, payload = {}) {
  return sendPushToUser(
    user,
    buildNotificationMessage({
      title: String(payload.title || 'Security alert'),
      body: buildSecurityAlertBody(payload),
      type: 'security_alert',
      deepLink: 'dvari://home',
      data: {
        severity: String(payload.severity || 'high'),
      },
    }),
    { preferenceKey: 'securityAlerts' },
  );
}

async function sendWeeklySummaryNotification(user, payload = {}) {
  return sendPushToUser(
    user,
    buildNotificationMessage({
      title: String(payload.title || 'Weekly summary'),
      body: buildWeeklySummaryBody(payload),
      type: 'weekly_summary',
      deepLink: 'dvari://home',
      data: {
        summaryDate: String(payload.summaryDate || new Date().toISOString()),
      },
    }),
    { preferenceKey: 'weeklySummary' },
  );
}

async function sendIncomingCallNotification(user, payload = {}) {
  const callId = String(payload.callId || '').trim();
  if (!callId) {
    return { sent: 0, skipped: true, reason: 'missing_call_id' };
  }

  return sendPushToUser(
    user,
    buildIncomingCallMessage({
      title: String(payload.title || 'Visitor at Door'),
      body: buildIncomingCallBody(payload),
      callId,
      data: {
        callType: String(payload.callType || 'doorbell'),
        tabletDisplayName: String(payload.tabletDisplayName || payload.tabletName || 'Dvaari Tablet'),
        callerName: 'Visitor at Door',
        callerPhone: String(payload.callerPhone || '').trim(),
        note: String(payload.note || '').trim(),
      },
    }),
    {
      preferenceKey:
        payload.preferenceKey ||
        (payload.callType === 'delivery' ? 'deliveryNotifications' : 'doorbellAlerts'),
    },
  );
}

async function sendCallEndedNotification(user, payload = {}) {
  const callId = String(payload.callId || '').trim();
  if (!callId) {
    safeLog('[PUSH]', 'call_ended_push_skipped', {
      reason: 'missing_call_id',
    });
    return { sent: 0, skipped: true, reason: 'missing_call_id' };
  }

  safeLog('[PUSH]', 'call_ended_push_attempt', {
    userId: String(user?._id || ''),
    callId,
    reason: String(payload.reason || ''),
  });

  return sendPushToUser(
    user,
    buildCallEndedMessage({
      callId,
      reason: payload.reason,
      data: {
        callType: String(payload.callType || ''),
      },
    }),
    {
      preferenceKey:
        payload.preferenceKey ||
        (payload.callType === 'delivery' ? 'deliveryNotifications' : 'doorbellAlerts'),
    },
  );
}

module.exports = {
  sendUpcomingDeliveryScheduledNotification,
  sendDeliveryBoyAtDoorNotification,
  sendDoorbellRingNotification,
  sendTabletOfflineNotification,
  sendVisitorRecognitionNotification,
  sendSecurityAlertNotification,
  sendWeeklySummaryNotification,
  sendIncomingCallNotification,
  sendCallEndedNotification,
  sendPushToUser,
};
