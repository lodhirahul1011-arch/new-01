import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import {
  checkNotifications,
  requestNotifications,
  RESULTS,
} from 'react-native-permissions';
import type { RegisterPushTokenPayload } from '../api/notificationsApi';
import { API_BASE_URL } from '../../config/env';
import {
  navigateToActiveCallScreen,
  navigateToIncomingCallScreen,
  navigateToNotificationTarget,
} from '../../navigation/navigationRef';
import { saveNotificationInboxItemFromRemoteMessage } from './notificationInbox';
import { getCurrentUserId } from '../storage/sessionStorage';
import { getAccessToken, getRefreshToken, setTokens } from '../storage/tokenStorage';
import { store } from '../../store';
import {
  clearMobileCallActive,
  isMobileBusyWithCall,
  markMobileCallActive,
} from '../calls/mobileCallPresence';
import { logs } from '../logs';
import {
  playDefaultCallRingtone,
  stopDefaultCallRingtone,
} from './callRingtone';
import {
  getNotificationDebugSnapshot,
  hasDisplayedNotificationMessageKey,
  rememberDisplayedNotificationMessageKey,
  subscribeNotificationDebugSnapshot,
  updateNotificationDebugSnapshot,
  type NotificationDebugSnapshot,
} from './notificationDebugState';

const PUSH_TOKEN_STORAGE_KEY = 'notifications.pushToken';
const PENDING_CALL_ACTION_KEY = 'notifications.pendingCallAction';
const DEFAULT_CHANNEL_ID = 'dvaari-alerts-v3';
const INCOMING_CALL_CHANNEL_ID = 'dwar-calls-fullscreen-v8';
const ACTIVE_CALL_CHANNEL_ID = 'dwar-active-calls-v1';
const INCOMING_CALL_VIBRATION_PATTERN = [900, 350, 900, 900];
const INCOMING_CALL_NOTIFICATION_PREFIX = 'incoming-call:';
const ACTIVE_CALL_NOTIFICATION_PREFIX = 'active-call:';
const DEFAULT_NOTIFICATION_TITLE = 'Dvaari Notification';
const DEFAULT_NOTIFICATION_BODY = 'Open Dvaari to view the latest update.';

type NativeCallModule = {
  showIncomingCall?: (payload: {
    callId: string;
    callerName?: string;
    callerPhone?: string;
    callType?: string;
  }) => Promise<boolean>;
  cancelIncomingCall?: (callId?: string) => void;
  cancelActiveCall?: (callId?: string) => void;
  setAuthTokens?: (accessToken: string, refreshToken: string) => void;
};

const nativeCall =
  Platform.OS === 'android'
    ? (NativeModules.NativeCall as NativeCallModule | undefined)
    : undefined;

type RemoteNotification = {
  title?: string;
  body?: string;
};

type RemoteMessage = {
  data?: Record<string, string>;
  notification?: RemoteNotification;
  messageId?: string;
};

type RegisterPushTokenFn = (
  payload: RegisterPushTokenPayload,
) => Promise<unknown> & { unwrap?: () => Promise<unknown> };

type NotificationOpenPayload = {
  type?: string;
  scheduleId?: string;
  callId?: string;
  callerName?: string;
  callerPhone?: string;
  callType?: string;
};

export type ForegroundIncomingCallPayload = {
  callId: string;
  callerName?: string;
  callerPhone?: string;
  callType?: string;
  title?: string;
  body?: string;
};

type PendingCallAction = {
  action: 'open' | 'answer';
  callId: string;
  callerName?: string;
  callerPhone?: string;
  callType?: string;
};

export { getNotificationDebugSnapshot, subscribeNotificationDebugSnapshot };

const foregroundIncomingCallListeners = new Set<
  (payload: ForegroundIncomingCallPayload) => void
>();
const callEndedListeners = new Set<(callId: string) => void>();

export function subscribeForegroundIncomingCall(
  listener: (payload: ForegroundIncomingCallPayload) => void,
) {
  foregroundIncomingCallListeners.add(listener);
  return () => {
    foregroundIncomingCallListeners.delete(listener);
  };
}

export function subscribeCallEnded(listener: (callId: string) => void) {
  callEndedListeners.add(listener);
  return () => {
    callEndedListeners.delete(listener);
  };
}

function notifyCallEnded(callId: string) {
  const normalizedCallId = String(callId || '').trim();
  if (!normalizedCallId) {
    logs.error('[notifications] cannot notify call ended without call id');
    return;
  }

  logs.info('[notifications] notifying call ended listeners', normalizedCallId);
  callEndedListeners.forEach(listener => {
    listener(normalizedCallId);
  });
}

function getForegroundIncomingCallPayload(
  message: RemoteMessage,
): ForegroundIncomingCallPayload | null {
  const callId = String(message.data?.callId || '').trim();
  if (!callId) {
    return null;
  }

  const { title, body } = getRemoteText(message);

  return {
    callId,
    callerName: String(message.data?.callerName || 'Visitor at Door'),
    callerPhone: String(message.data?.callerPhone || ''),
    callType: String(message.data?.callType || ''),
    title,
    body,
  };
}

function notifyForegroundIncomingCall(message: RemoteMessage) {
  const payload = getForegroundIncomingCallPayload(message);
  if (!payload) {
    return;
  }

  foregroundIncomingCallListeners.forEach(listener => {
    listener(payload);
  });
}

function getMessagingModule(): any | null {
  try {
    return require('@react-native-firebase/messaging').default;
  } catch (error) {
    logs.error('[notifications] messaging dependency unavailable', String(error));
    return null;
  }
}

function getNotifeeModule(): any | null {
  try {
    return require('@notifee/react-native');
  } catch (error) {
    logs.error('[notifications] notifee dependency unavailable', String(error));
    return null;
  }
}

function getRemoteText(message: RemoteMessage) {
  const title =
    message.notification?.title ||
    message.data?.title ||
    message.data?.heading ||
    DEFAULT_NOTIFICATION_TITLE;
  const body =
    message.notification?.body ||
    message.data?.body ||
    message.data?.message ||
    DEFAULT_NOTIFICATION_BODY;

  return { title, body };
}

function getDebugEventFromMessage(
  source: string,
  message: RemoteMessage,
  extras: Partial<{
    matchedUser: boolean;
    reason: string;
    key: string;
  }> = {},
) {
  const { title, body } = getRemoteText(message);

  return {
    at: new Date().toISOString(),
    source,
    messageId: String(message.messageId || ''),
    type: String(message.data?.type || ''),
    title,
    body,
    targetUserId: String(message.data?.targetUserId || ''),
    matchedUser: extras.matchedUser,
    key: extras.key,
    reason: extras.reason,
  };
}

function getRemoteMessageDedupeKey(message: RemoteMessage) {
  const messageId = String(message.messageId || '').trim();
  if (messageId) {
    return messageId;
  }

  const { title, body } = getRemoteText(message);
  return [
    String(message.data?.type || '').trim(),
    String(message.data?.scheduleId || '').trim(),
    String(message.data?.callId || '').trim(),
    String(message.data?.targetUserId || '').trim(),
    title,
    body,
  ]
    .filter(Boolean)
    .join('|');
}

function getIncomingCallNotificationId(callId?: string) {
  return `${INCOMING_CALL_NOTIFICATION_PREFIX}${String(callId || '').trim()}`;
}

function getActiveCallNotificationId(callId?: string) {
  return `${ACTIVE_CALL_NOTIFICATION_PREFIX}${String(callId || '').trim()}`;
}

async function refreshNotificationChannelDebugState() {
  const pkg = getNotifeeModule();
  if (!pkg?.default) {
    return;
  }

  const ids = [DEFAULT_CHANNEL_ID, INCOMING_CALL_CHANNEL_ID, ACTIVE_CALL_CHANNEL_ID];
  const channelStates: NonNullable<NotificationDebugSnapshot['channelStates']> = [];

  for (const id of ids) {
    let exists: boolean | undefined;
    let blocked: boolean | undefined;

    try {
      exists = typeof pkg.default.isChannelCreated === 'function'
        ? await pkg.default.isChannelCreated(id)
        : undefined;
    } catch {
      exists = undefined;
    }

    try {
      blocked = typeof pkg.default.isChannelBlocked === 'function'
        ? await pkg.default.isChannelBlocked(id)
        : undefined;
    } catch {
      blocked = undefined;
    }

    channelStates.push({ id, exists, blocked });
  }

  await updateNotificationDebugSnapshot({ channelStates });
}

export async function refreshNotificationDiagnostics() {
  try {
    const { status } = await checkNotifications();
    const token = await getStoredPushToken();
    await updateNotificationDebugSnapshot({
      permissionStatus: status,
      tokenPresent: Boolean(token),
      tokenPreview: token ? token.slice(0, 18) : '',
    });
  } catch (error) {
    logs.error('[notifications] refresh diagnostics failed', String(error));
  }

  await refreshNotificationChannelDebugState();
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') {
    return DEFAULT_CHANNEL_ID;
  }

  const pkg = getNotifeeModule();
  if (!pkg?.default || !pkg?.AndroidImportance) {
    return DEFAULT_CHANNEL_ID;
  }

  await pkg.default.createChannel({
    id: DEFAULT_CHANNEL_ID,
    name: 'Dvaari Alerts',
    importance: pkg.AndroidImportance.HIGH,
    vibration: true,
    sound: 'default',
  });

  logs.info('[notifications] default notification channel ensured', DEFAULT_CHANNEL_ID);
  await refreshNotificationChannelDebugState();
  return DEFAULT_CHANNEL_ID;
}

export async function openNotificationSoundSettings(): Promise<void> {
  logs.info('[notifications] opening notification sound settings');

  const pkg = getNotifeeModule();
  if (!pkg?.default?.openNotificationSettings) {
    const error = new Error('Notification settings are unavailable');
    logs.error('[notifications] notification sound settings unavailable', error.message);
    throw error;
  }

  try {
    const channelId =
      Platform.OS === 'android' ? await ensureAndroidChannel() : undefined;
    await pkg.default.openNotificationSettings(channelId);
    logs.info('[notifications] notification sound settings opened', {
      channelId: channelId || 'application',
    });
  } catch (error) {
    logs.error(
      '[notifications] failed to open notification sound settings',
      String(error),
    );
    throw error;
  }
}

async function ensureIncomingCallChannel() {
  if (Platform.OS !== 'android') {
    return INCOMING_CALL_CHANNEL_ID;
  }

  const pkg = getNotifeeModule();
  if (!pkg?.default || !pkg?.AndroidImportance) {
    return INCOMING_CALL_CHANNEL_ID;
  }

  await pkg.default.createChannel({
    id: INCOMING_CALL_CHANNEL_ID,
    name: 'Dvaari Calls',
    importance: pkg.AndroidImportance.HIGH,
    vibration: true,
    vibrationPattern: INCOMING_CALL_VIBRATION_PATTERN,
    sound: 'default',
    lights: true,
  });

  await refreshNotificationChannelDebugState();
  return INCOMING_CALL_CHANNEL_ID;
}

async function ensureActiveCallChannel() {
  if (Platform.OS !== 'android') {
    return ACTIVE_CALL_CHANNEL_ID;
  }

  const pkg = getNotifeeModule();
  if (!pkg?.default || !pkg?.AndroidImportance) {
    return ACTIVE_CALL_CHANNEL_ID;
  }

  await pkg.default.createChannel({
    id: ACTIVE_CALL_CHANNEL_ID,
    name: 'Dvaari Active Calls',
    importance: pkg.AndroidImportance.LOW,
    vibration: false,
    sound: undefined,
  });

  logs.info('[notifications] active call notification channel ensured', ACTIVE_CALL_CHANNEL_ID);
  await refreshNotificationChannelDebugState();
  return ACTIVE_CALL_CHANNEL_ID;
}

async function displayForegroundNotification(message: RemoteMessage) {
  const messageKey = getRemoteMessageDedupeKey(message);
  const matchesUser = await isMessageForCurrentUser(message, 'display_foreground');
  if (!matchesUser) {
    await updateNotificationDebugSnapshot({
      lastDisplayAttempt: getDebugEventFromMessage('foreground_display_skipped', message, {
        matchedUser: false,
        key: messageKey,
        reason: 'filtered_by_target_user',
      }),
    });
    return;
  }

  const pkg = getNotifeeModule();
  if (!pkg?.default) {
    await updateNotificationDebugSnapshot({
      lastDisplayAttempt: getDebugEventFromMessage('foreground_display_failed', message, {
        matchedUser: true,
        key: messageKey,
        reason: 'notifee_unavailable',
      }),
    });
    return;
  }

  if (messageKey && (await hasDisplayedNotificationMessageKey(messageKey))) {
    await updateNotificationDebugSnapshot({
      lastDisplayAttempt: getDebugEventFromMessage('foreground_display_skipped', message, {
        matchedUser: true,
        key: messageKey,
        reason: 'duplicate_message_key',
      }),
    });
    return;
  }

  const channelId = await ensureAndroidChannel();
  const { title, body } = getRemoteText(message);

  await pkg.default.displayNotification({
    id: messageKey || undefined,
    title,
    body,
    ios: {
      sound: 'default',
      foregroundPresentationOptions: {
        alert: true,
        badge: true,
        sound: true,
      },
    },
    android: {
      channelId,
      pressAction: { id: 'default' },
      smallIcon: 'ic_launcher',
      sound: 'default',
    },
  });

  await rememberDisplayedNotificationMessageKey(messageKey);
  await updateNotificationDebugSnapshot({
    lastDisplayAttempt: getDebugEventFromMessage('foreground_display_success', message, {
      matchedUser: true,
      key: messageKey,
    }),
  });
}

async function displayIncomingCallNotification(message: RemoteMessage) {
  const messageKey = getRemoteMessageDedupeKey(message);
  const matchesUser = await isMessageForCurrentUser(message, 'display_incoming_call');
  if (!matchesUser) {
    await updateNotificationDebugSnapshot({
      lastDisplayAttempt: getDebugEventFromMessage('incoming_call_display_skipped', message, {
        matchedUser: false,
        key: messageKey,
        reason: 'filtered_by_target_user',
      }),
    });
    return;
  }

  const pkg = getNotifeeModule();
  const callId = String(message.data?.callId || '').trim();
  if (!pkg?.default || !callId) {
    await updateNotificationDebugSnapshot({
      lastDisplayAttempt: getDebugEventFromMessage('incoming_call_display_failed', message, {
        matchedUser: true,
        key: messageKey,
        reason: !callId ? 'missing_call_id' : 'notifee_unavailable',
      }),
    });
    return;
  }

  if (messageKey && (await hasDisplayedNotificationMessageKey(messageKey))) {
    await updateNotificationDebugSnapshot({
      lastDisplayAttempt: getDebugEventFromMessage('incoming_call_display_skipped', message, {
        matchedUser: true,
        key: messageKey,
        reason: 'duplicate_message_key',
      }),
    });
    return;
  }

  if (await rejectIncomingCallWhenMobileBusy(message, callId, 'incoming_call_display_busy_reject')) {
    return;
  }

  const { title, body } = getRemoteText(message);
  const callerName = String(message.data?.callerName || 'Visitor at Door');
  const callerPhone = String(message.data?.callerPhone || '');
  const callType = String(message.data?.callType || '');

  if (Platform.OS === 'android' && nativeCall?.showIncomingCall) {
    try {
      await nativeCall.showIncomingCall({
        callId,
        callerName,
        callerPhone,
        callType,
      });
      logs.info('[notifications] displayed native incoming call UI', { callId });
      await rememberDisplayedNotificationMessageKey(messageKey);
      await updateNotificationDebugSnapshot({
        lastDisplayAttempt: getDebugEventFromMessage('native_incoming_call_display_success', message, {
          matchedUser: true,
          key: messageKey,
        }),
      });
      return;
    } catch (error) {
      logs.error('[notifications] native incoming call display failed; falling back to notifee', String(error));
    }
  }

  const channelId = await ensureIncomingCallChannel();

  const notificationPayload: any = {
    id: getIncomingCallNotificationId(callId),
    title: title || callerName,
    body,
    data: {
      callId,
      callerName,
      callerPhone,
      callType,
    },
    ios: {
      sound: 'default',
      foregroundPresentationOptions: {
        alert: true,
        badge: true,
        sound: true,
      },
    },
    android: {
      channelId,
      category: pkg.AndroidCategory?.CALL,
      pressAction: {
        id: 'open_call',
        launchActivity: 'default',
      },
      fullScreenAction: {
        id: 'open_call',
        launchActivity: 'default',
      },
      actions: [
        {
          title: 'Decline',
          pressAction: {
            id: 'decline_call',
          },
        },
        {
          title: 'Answer',
          pressAction: {
            id: 'answer_call',
          },
        },
      ],
      importance: pkg.AndroidImportance?.HIGH,
      ongoing: true,
      autoCancel: false,
      smallIcon: 'ic_launcher',
      sound: 'default',
      lightUpScreen: true,
      vibrationPattern: INCOMING_CALL_VIBRATION_PATTERN,
    },
  };

  logs.info('[notifications] displaying incoming call heads-up notification', {
    callId,
    fullScreenAction: true,
  });

  try {
    await pkg.default.displayNotification(notificationPayload);
  } catch (error) {
    logs.error('[notifications] incoming call notification display failed', String(error));
    await pkg.default.displayNotification(notificationPayload);
  }

  playDefaultCallRingtone();
  await rememberDisplayedNotificationMessageKey(messageKey);
  await updateNotificationDebugSnapshot({
    lastDisplayAttempt: getDebugEventFromMessage('incoming_call_display_success', message, {
      matchedUser: true,
      key: messageKey,
    }),
  });
}

async function shouldSkipForegroundIncomingCallBanner(message: RemoteMessage) {
  const matchesUser = await isMessageForCurrentUser(message, 'display_foreground_incoming_call_panel');
  if (!matchesUser) {
    return true;
  }

  const callId = String(message.data?.callId || '').trim();
  if (!callId) {
    logs.error('[notifications] foreground incoming call missing call id');
    return true;
  }

  if (await rejectIncomingCallWhenMobileBusy(message, callId, 'foreground_call_display_busy_reject')) {
    return true;
  }

  logs.info('[notifications] foreground incoming call will use in-app banner only', callId);
  return false;
}

export async function cancelIncomingCallNotification(callId?: string) {
  stopDefaultCallRingtone();
  try {
    nativeCall?.cancelIncomingCall?.(callId);
  } catch (error) {
    logs.error('[notifications] native incoming call cancel failed', String(error));
  }

  const pkg = getNotifeeModule();
  if (!pkg?.default || !callId) {
    return;
  }

  await pkg.default.cancelDisplayedNotification(getIncomingCallNotificationId(callId));
  await pkg.default.cancelNotification(getIncomingCallNotificationId(callId));
}

export async function displayActiveCallNotification(payload: {
  callId: string;
  callerName?: string;
  callerPhone?: string;
  callType?: string;
}) {
  const pkg = getNotifeeModule();
  const callId = String(payload.callId || '').trim();
  if (!pkg?.default || !callId) {
    return;
  }

  if (Platform.OS !== 'android') {
    logs.info('[notifications] active call notification skipped on iOS', { callId });
    return;
  }

  const channelId = await ensureActiveCallChannel();
  const title = payload.callerName || 'Visitor at Door';
  const body = payload.callerPhone || 'Audio call in progress';

  await pkg.default.displayNotification({
    id: getActiveCallNotificationId(callId),
    title,
    body,
    data: {
      callId,
      callerName: String(payload.callerName || 'Visitor at Door'),
      callerPhone: String(payload.callerPhone || ''),
      callType: String(payload.callType || ''),
      activeCall: 'true',
    },
    android: {
      channelId,
      category: pkg.AndroidCategory?.STATUS,
      pressAction: {
        id: 'open_call',
        launchActivity: 'default',
      },
      actions: [
        {
          title: 'End Call',
          pressAction: {
            id: 'end_call',
          },
        },
      ],
      importance: pkg.AndroidImportance?.LOW,
      ongoing: true,
      autoCancel: false,
      smallIcon: 'ic_launcher',
      sound: undefined,
      vibrationPattern: [],
      onlyAlertOnce: true,
      localOnly: true,
      showTimestamp: false,
    },
  });
  logs.info('[notifications] displayed quiet active call notification', { callId });
}

export async function cancelActiveCallNotification(callId?: string) {
  try {
    nativeCall?.cancelActiveCall?.(callId);
  } catch (error) {
    logs.error('[notifications] native active call cancel failed', String(error));
  }

  const pkg = getNotifeeModule();
  if (!pkg?.default || !callId) {
    return;
  }

  await pkg.default.cancelDisplayedNotification(getActiveCallNotificationId(callId));
  await pkg.default.cancelNotification(getActiveCallNotificationId(callId));
}

async function isMessageForCurrentUser(
  message: RemoteMessage,
  source = 'message_filter',
) {
  const currentUserId = String((await getCurrentUserId()) || '').trim();
  if (!currentUserId) {
    logs.info('[notifications] message skipped because no user is signed in', {
      source,
      type: String(message.data?.type || ''),
    });
    await updateNotificationDebugSnapshot({
      lastFilterDecision: getDebugEventFromMessage(source, message, {
        matchedUser: false,
        reason: 'missing_current_user_id',
      }),
    });
    return false;
  }

  const targetUserId = String(message.data?.targetUserId || '').trim();
  if (!targetUserId) {
    await updateNotificationDebugSnapshot({
      lastFilterDecision: getDebugEventFromMessage(source, message, {
        matchedUser: true,
        reason: 'no_target_user',
      }),
    });
    return true;
  }

  const matches = currentUserId === targetUserId;
  await updateNotificationDebugSnapshot({
    lastFilterDecision: getDebugEventFromMessage(source, message, {
      matchedUser: matches,
      reason: matches ? 'matched_current_user' : 'target_user_mismatch',
    }),
  });
  return matches;
}

async function storePendingCallAction(action: PendingCallAction) {
  await AsyncStorage.setItem(PENDING_CALL_ACTION_KEY, JSON.stringify(action));
}

async function flushPendingCallAction() {
  const raw = await AsyncStorage.getItem(PENDING_CALL_ACTION_KEY);
  if (!raw) {
    return false;
  }

  await AsyncStorage.removeItem(PENDING_CALL_ACTION_KEY);

  try {
    const action = JSON.parse(raw) as PendingCallAction;
    if (!action?.callId) {
      return false;
    }

    if (action.action === 'answer') {
      navigateToActiveCallScreen({
        callId: action.callId,
        callerName: action.callerName,
        callerPhone: action.callerPhone,
        callType: action.callType,
      });
      return true;
    }

    navigateToIncomingCallScreen({
      callId: action.callId,
      callerName: action.callerName,
      callerPhone: action.callerPhone,
      callType: action.callType,
    });
    return true;
  } catch {
    // ignore invalid persisted action
  }

  return false;
}

async function performCallNotificationRequest(
  callId: string,
  action: 'answer' | 'reject' | 'end',
  reason?: string,
) {
  const accessToken = String(
    store.getState().auth?.accessToken || (await getAccessToken()) || '',
  ).trim();
  if (!accessToken || !callId) {
    return false;
  }

  const endpoint =
    action === 'answer'
      ? 'answer'
      : action === 'reject'
        ? 'reject'
        : 'end';
  const body =
    action === 'answer'
      ? { liveVideoRequested: false }
      : action === 'reject'
        ? { reason: reason || 'rejected_from_notification' }
        : { reason: 'ended_from_notification' };

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/tablet/calls/${encodeURIComponent(callId)}/${endpoint}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    return response.ok;
  } catch (error) {
    logs.error('[notifications] call action request failed', String(error));
    return false;
  }
}

async function rejectIncomingCallWhenMobileBusy(
  message: RemoteMessage,
  callId: string,
  source: string,
) {
  const busy = await isMobileBusyWithCall(callId);
  if (!busy) {
    return false;
  }

  logs.info('[notifications] rejecting incoming call because mobile is busy', {
    callId,
    source,
  });
  await performCallNotificationRequest(callId, 'reject', 'mobile_busy');
  await cancelIncomingCallNotification(callId).catch(error => {
    logs.error('[notifications] failed to cancel busy incoming notification', String(error));
  });
  await updateNotificationDebugSnapshot({
    lastDisplayAttempt: getDebugEventFromMessage(source, message, {
      matchedUser: true,
      reason: 'mobile_busy',
    }),
  });
  return true;
}

async function handleCallEndedMessage(message: RemoteMessage, source: string) {
  const callId = String(message.data?.callId || '').trim();
  if (!callId) {
    logs.error('[notifications] call ended message missing call id');
    return;
  }

  logs.info('[notifications] handling call ended message', {
    callId,
    source,
    reason: String(message.data?.reason || ''),
  });

  await cancelIncomingCallNotification(callId).catch(error => {
    logs.error('[notifications] failed to cancel ended incoming call notification', String(error));
  });
  await cancelActiveCallNotification(callId).catch(error => {
    logs.error('[notifications] failed to cancel ended active call notification', String(error));
  });
  await clearMobileCallActive(callId).catch(error => {
    logs.error('[notifications] failed to clear ended mobile call marker', String(error));
  });
  notifyCallEnded(callId);
}

async function handleIncomingCallAction(
  actionId: string,
  detailData?: Record<string, any>,
) {
  const callId = String(detailData?.callId || '').trim();
  const callerName = String(detailData?.callerName || 'Visitor at Door').trim() || 'Visitor at Door';
  const callerPhone = String(detailData?.callerPhone || '').trim() || undefined;
  const callType = String(detailData?.callType || '').trim() || undefined;

  if (!callId) {
    return;
  }

  if (actionId === 'decline_call') {
    await performCallNotificationRequest(callId, 'reject');
    await cancelIncomingCallNotification(callId);
    await cancelActiveCallNotification(callId);
    return;
  }

  if (actionId === 'end_call') {
    await performCallNotificationRequest(callId, 'end');
    await clearMobileCallActive(callId).catch(error => {
      logs.error('[notifications] failed to clear active mobile call from notification', String(error));
    });
    await cancelIncomingCallNotification(callId);
    await cancelActiveCallNotification(callId);
    return;
  }

  if (actionId === 'answer_call') {
    if (await isMobileBusyWithCall(callId)) {
      logs.info('[notifications] rejecting answer action because mobile is busy', callId);
      await performCallNotificationRequest(callId, 'reject', 'mobile_busy');
      await cancelIncomingCallNotification(callId);
      return;
    }

    const answered = await performCallNotificationRequest(callId, 'answer');
    if (answered) {
      markMobileCallActive(callId);
    } else {
      logs.info('[notifications] answer action did not succeed; cancelling stale call notification', callId);
      await cancelIncomingCallNotification(callId);
      await clearMobileCallActive(callId).catch(error => {
        logs.error('[notifications] failed to clear stale active call marker after answer failure', String(error));
      });
      return;
    }
    await cancelIncomingCallNotification(callId);

    const navigated = navigateToActiveCallScreen({
      callId,
      callerName,
      callerPhone,
      callType,
    });

    if (!navigated) {
      await storePendingCallAction({
        action: 'answer',
        callId,
        callerName,
        callerPhone,
        callType,
      });
    }
    return;
  }

  const isActiveCall = detailData?.activeCall === 'true';
  if (!isActiveCall && (await isMobileBusyWithCall(callId))) {
    logs.info('[notifications] rejecting open action because mobile is busy', callId);
    await performCallNotificationRequest(callId, 'reject', 'mobile_busy');
    await cancelIncomingCallNotification(callId);
    return;
  }

  const navigated = isActiveCall
    ? navigateToActiveCallScreen({
        callId,
        callerName,
        callerPhone,
        callType,
      })
    : navigateToIncomingCallScreen({
        callId,
        callerName,
        callerPhone,
        callType,
      });

  if (!navigated) {
    await storePendingCallAction({
      action: isActiveCall ? 'answer' : 'open',
      callId,
      callerName,
      callerPhone,
      callType,
    });
  }
}

async function handleNotifeeEvent(event: any) {
  const pkg = getNotifeeModule();
  const eventType = pkg?.EventType;
  if (!eventType) {
    return;
  }

  const type = event?.type;
  const detail = event?.detail || {};
  const pressActionId = String(detail?.pressAction?.id || 'default');
  const notificationData = detail?.notification?.data || {};

  if (type === eventType.ACTION_PRESS || type === eventType.PRESS) {
    await handleIncomingCallAction(pressActionId, notificationData);
  }
}

export function registerNotificationBackgroundHandler() {
  const messaging = getMessagingModule();
  if (!messaging) {
    return;
  }

  messaging().setBackgroundMessageHandler(async (message: RemoteMessage) => {
    if (!(await isMessageForCurrentUser(message, 'background_message_received'))) {
      logs.info('[notifications] signed-out background message ignored');
      return;
    }

    await saveNotificationInboxItemFromRemoteMessage(message);
    await updateNotificationDebugSnapshot({
      lastBackgroundMessage: getDebugEventFromMessage(
        'background_message_received',
        message,
        { key: getRemoteMessageDedupeKey(message) },
      ),
    });

    if (message.data?.type === 'incoming_call') {
      await displayIncomingCallNotification(message);
    } else if (message.data?.type === 'call_ended') {
      await handleCallEndedMessage(message, 'background_message_received');
    } else {
      await displayForegroundNotification(message);
    }

    await AsyncStorage.setItem(
      'notifications.lastBackgroundMessageId',
      String(message?.messageId || Date.now()),
    );
  });
}

export function registerCallNotificationBackgroundHandler() {
  const pkg = getNotifeeModule();
  if (!pkg?.default?.onBackgroundEvent) {
    return;
  }

  pkg.default.onBackgroundEvent(async (event: any) => {
    await handleNotifeeEvent(event);
  });
}

export async function ensurePushPermission() {
  const { status } = await checkNotifications();
  await updateNotificationDebugSnapshot({
    permissionStatus: status,
  });
  if (status === RESULTS.GRANTED) {
    return true;
  }

  const next = await requestNotifications(['alert', 'sound', 'badge']);
  await updateNotificationDebugSnapshot({
    permissionStatus: next.status,
  });
  return next.status === RESULTS.GRANTED;
}

export async function getPushToken() {
  const messaging = getMessagingModule();
  if (!messaging) {
    return null;
  }

  try {
    await messaging().registerDeviceForRemoteMessages();
    logs.info('[notifications] device registered for remote messages', Platform.OS);
  } catch (error) {
    logs.error('[notifications] register device for remote messages failed', String(error));
  }

  const token = await messaging().getToken();

  if (token) {
    await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    await updateNotificationDebugSnapshot({
      tokenPresent: true,
      tokenPreview: token.slice(0, 18),
    });
  } else {
    await updateNotificationDebugSnapshot({
      tokenPresent: false,
      tokenPreview: '',
    });
  }

  return token || null;
}

export async function getStoredPushToken() {
  return AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
}

export async function clearStoredPushToken() {
  logs.info('[notifications] signed-out push cleanup started');

  const messaging = getMessagingModule();
  if (messaging) {
    try {
      await messaging().deleteToken();
      logs.info('[notifications] Firebase token deleted for signed-out session');
    } catch (error) {
      logs.error('[notifications] Firebase token deletion failed', String(error));
    }
  }

  const notifeePkg = getNotifeeModule();
  if (notifeePkg?.default?.cancelAllNotifications) {
    try {
      await notifeePkg.default.cancelAllNotifications();
      logs.info('[notifications] displayed notifications cleared for signed-out session');
    } catch (error) {
      logs.error('[notifications] displayed notification cleanup failed', String(error));
    }
  }

  await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  await updateNotificationDebugSnapshot({
    tokenPresent: false,
    tokenPreview: '',
  });
  logs.info('[notifications] signed-out push cleanup completed');
}

async function markPushTokenSynced(token: string) {
  await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  await updateNotificationDebugSnapshot({
    tokenPresent: true,
    tokenPreview: token.slice(0, 18),
    lastTokenSync: {
      at: new Date().toISOString(),
      status: 'success',
    },
  });
}

export async function syncPushTokenWithBackend(
  registerPushToken: RegisterPushTokenFn,
) {
  await updateNotificationDebugSnapshot({
    lastTokenSync: {
      at: new Date().toISOString(),
      status: 'started',
    },
  });

  const permissionGranted = await ensurePushPermission();
  if (!permissionGranted) {
    logs.info('[notifications] push permission not granted; syncing FCM token anyway');
    await updateNotificationDebugSnapshot({
      lastTokenSync: {
        at: new Date().toISOString(),
        status: 'started',
        reason: 'permission_not_granted_token_sync_continues',
      },
    });
  }

  const token = await getPushToken();
  if (!token) {
    logs.error('[notifications] FCM token unavailable');
    await updateNotificationDebugSnapshot({
      lastTokenSync: {
        at: new Date().toISOString(),
        status: 'failed',
        reason: 'fcm_token_unavailable',
      },
    });
    return null;
  }

  const payload: RegisterPushTokenPayload = {
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };

  try {
    const request = registerPushToken(payload);

    if (typeof request?.unwrap === 'function') {
      await request.unwrap();
    } else {
      await request;
    }
  } catch (error) {
    await updateNotificationDebugSnapshot({
      lastTokenSync: {
        at: new Date().toISOString(),
        status: 'failed',
        reason: String(error),
      },
    });
    throw error;
  }

  await markPushTokenSynced(token);
  logs.info('[notifications] FCM token synced with backend', token.slice(0, 12));
  return token;
}

export async function syncPushTokenWithAccessToken(
  accessToken?: string | null,
  reason = 'authenticated_direct_sync',
) {
  const normalizedAccessToken = String(accessToken || '').trim();

  await updateNotificationDebugSnapshot({
    lastTokenSync: {
      at: new Date().toISOString(),
      status: normalizedAccessToken ? 'started' : 'skipped',
      reason,
    },
  });

  if (!normalizedAccessToken) {
    return null;
  }

  try {
    const storedRefreshToken = await getRefreshToken().catch(error => {
      logs.error('[notifications] native call refresh token read failed', String(error));
      return '';
    });
    nativeCall?.setAuthTokens?.(normalizedAccessToken, storedRefreshToken || '');
    logs.info('[notifications] native call auth mirror refreshed for token sync');
  } catch (error) {
    logs.error('[notifications] native call auth mirror failed', String(error));
  }

  const permissionGranted = await ensurePushPermission();
  if (!permissionGranted) {
    await updateNotificationDebugSnapshot({
      lastTokenSync: {
        at: new Date().toISOString(),
        status: 'started',
        reason: `${reason}:permission_not_granted_token_sync_continues`,
      },
    });
  }

  await ensureAndroidChannel();
  await ensureIncomingCallChannel();

  const token = await getPushToken();
  if (!token) {
    await updateNotificationDebugSnapshot({
      lastTokenSync: {
        at: new Date().toISOString(),
        status: 'failed',
        reason: `${reason}:fcm_token_unavailable`,
      },
    });
    return null;
  }

  try {
    const endpoint = `${API_BASE_URL}/api/v1/users/me/fcm-token`;
    const body: { token: string; platform: 'ios' | 'android' } = {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    };
    let activeAccessToken = normalizedAccessToken;
    let response = await postPushToken(endpoint, activeAccessToken, body);

    if (response.status === 401 || response.status === 403) {
      logs.info('[notifications] FCM token sync auth expired; refreshing access token');
      const refreshedAccessToken = await refreshAccessTokenForPushSync(reason);
      if (refreshedAccessToken) {
        activeAccessToken = refreshedAccessToken;
        response = await postPushToken(endpoint, activeAccessToken, body);
      }
    }

    if (!response.ok) {
      const textBody = await response.text().catch(() => '');
      await updateNotificationDebugSnapshot({
        lastTokenSync: {
          at: new Date().toISOString(),
          status: 'failed',
          reason: `token_sync_http_${response.status}:${textBody.slice(0, 180)}`,
          endpoint,
          httpStatus: response.status,
        },
      });
      throw new Error(`token_sync_http_${response.status}:${textBody.slice(0, 180)}`);
    }

    await updateNotificationDebugSnapshot({
      lastTokenSync: {
        at: new Date().toISOString(),
        status: 'started',
        reason: `${reason}:http_ok`,
        endpoint,
        httpStatus: response.status,
      },
    });
  } catch (error) {
    await updateNotificationDebugSnapshot({
      lastTokenSync: {
        at: new Date().toISOString(),
        status: 'failed',
        reason: `${reason}:${String(error)}`,
      },
    });
    throw error;
  }

  await markPushTokenSynced(token);
  logs.info('[notifications] FCM token direct-synced with backend', token.slice(0, 12));
  return token;
}

async function postPushToken(
  endpoint: string,
  accessToken: string,
  body: { token: string; platform: 'ios' | 'android' },
) {
  logs.info('[notifications] posting FCM token to backend', {
    endpoint,
    platform: body.platform,
    tokenPreview: body.token.slice(0, 12),
  });

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function refreshAccessTokenForPushSync(reason: string) {
  const refreshToken = await getRefreshToken().catch(error => {
    logs.error('[notifications] push sync refresh token read failed', String(error));
    return '';
  });

  if (!refreshToken) {
    logs.error('[notifications] push sync cannot refresh without refresh token');
    return '';
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      const textBody = await response.text().catch(() => '');
      logs.error('[notifications] push sync token refresh failed', {
        status: response.status,
        reason,
        body: textBody.slice(0, 180),
      });
      return '';
    }

    const payload = await response.json();
    const nextAccessToken = String(payload?.accessToken || '').trim();
    const nextRefreshToken = String(payload?.refreshToken || refreshToken).trim();
    if (!nextAccessToken) {
      logs.error('[notifications] push sync token refresh missing access token');
      return '';
    }

    await setTokens(nextAccessToken, nextRefreshToken);
    logs.info('[notifications] push sync auth token refreshed');
    return nextAccessToken;
  } catch (error) {
    logs.error('[notifications] push sync token refresh threw', String(error));
    return '';
  }
}
function mapNotificationPayload(
  message: RemoteMessage | null | undefined,
): NotificationOpenPayload {
  return {
    type: message?.data?.type,
    scheduleId: message?.data?.scheduleId,
    callId: message?.data?.callId,
    callerName: message?.data?.callerName || 'Visitor at Door',
    callerPhone: message?.data?.callerPhone,
    callType: message?.data?.callType,
  };
}

function routeNotificationMessage(message: RemoteMessage) {
  const payload = mapNotificationPayload(message);
  navigateToNotificationTarget(
    payload.type,
    payload.scheduleId,
    payload.callId,
    payload.callerName,
    payload.callerPhone,
    payload.callType,
  );
}

export async function setupForegroundNotifications(
  registerPushToken: RegisterPushTokenFn,
) {
  const messaging = getMessagingModule();
  if (!messaging) {
    return () => undefined;
  }

  await ensureAndroidChannel();
  await ensureIncomingCallChannel();
  await refreshNotificationDiagnostics();
  await syncPushTokenWithBackend(registerPushToken).catch(error => {
    logs.error('[notifications] foreground token sync failed; listeners still active', String(error));
  });

  const unsubscribeOnMessage = messaging().onMessage(
    async (message: RemoteMessage) => {
      if (!(await isMessageForCurrentUser(message, 'foreground_message_received'))) {
        logs.info('[notifications] signed-out foreground message ignored');
        return;
      }

      await saveNotificationInboxItemFromRemoteMessage(message);
      await updateNotificationDebugSnapshot({
        lastForegroundMessage: getDebugEventFromMessage(
          'foreground_message_received',
          message,
          { key: getRemoteMessageDedupeKey(message) },
        ),
      });

      if (message.data?.type === 'incoming_call') {
        const skipInAppBanner = await shouldSkipForegroundIncomingCallBanner(message).catch(error => {
          logs.error('[notifications] foreground call banner guard failed', String(error));
          updateNotificationDebugSnapshot({
            lastDisplayAttempt: getDebugEventFromMessage(
              'foreground_call_banner_guard_failed',
              message,
              {
                key: getRemoteMessageDedupeKey(message),
                reason: String(error),
              },
            ),
          }).catch(() => undefined);
          return true;
        });

        if (!skipInAppBanner && (await isMessageForCurrentUser(message, 'foreground_incoming_call_listener'))) {
          notifyForegroundIncomingCall(message);
        }
        return;
      }

      if (message.data?.type === 'call_ended') {
        await handleCallEndedMessage(message, 'foreground_message_received');
        return;
      }

      await displayForegroundNotification(message);
    },
  );

  const unsubscribeOnTokenRefresh = messaging().onTokenRefresh(
    async (token: string) => {
      const payload: RegisterPushTokenPayload = {
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      };
      await updateNotificationDebugSnapshot({
        lastTokenSync: {
          at: new Date().toISOString(),
          status: 'started',
          reason: 'token_refresh',
        },
      });
      try {
        const request = registerPushToken(payload);
        if (typeof request?.unwrap === 'function') {
          await request.unwrap();
        } else {
          await request;
        }
      } catch (error) {
        await updateNotificationDebugSnapshot({
          lastTokenSync: {
            at: new Date().toISOString(),
            status: 'failed',
            reason: `token_refresh:${String(error)}`,
          },
        });
        throw error;
      }
      await markPushTokenSynced(token);
      logs.info('[notifications] FCM token refreshed and synced');
    },
  );

  return () => {
    unsubscribeOnMessage();
    unsubscribeOnTokenRefresh();
  };
}

export async function bindNotificationOpenHandlers() {
  const messaging = getMessagingModule();
  if (!messaging) {
    return () => undefined;
  }
  const notifeePkg = getNotifeeModule();

  const handledPendingCallAction = await flushPendingCallAction();
  let handledInitialNotification = handledPendingCallAction;

  const initialMessage = await messaging().getInitialNotification();
  if (initialMessage && (await isMessageForCurrentUser(initialMessage, 'initial_notification_open'))) {
    await saveNotificationInboxItemFromRemoteMessage(initialMessage);
    await updateNotificationDebugSnapshot({
      lastNotificationOpen: getDebugEventFromMessage(
        'initial_notification_open',
        initialMessage,
        { key: getRemoteMessageDedupeKey(initialMessage) },
      ),
    });

    if (initialMessage.data?.type === 'incoming_call') {
      await cancelIncomingCallNotification(initialMessage.data?.callId);
    } else if (initialMessage.data?.type === 'call_ended') {
      await handleCallEndedMessage(initialMessage, 'initial_notification_open');
    }

    if (
      initialMessage.data?.type !== 'incoming_call' &&
      !(handledPendingCallAction && initialMessage.data?.type === 'incoming_call')
    ) {
      setTimeout(() => {
        routeNotificationMessage(initialMessage);
      }, 300);
      handledInitialNotification = true;
    }
  }

  if (!handledInitialNotification && notifeePkg?.default?.getInitialNotification) {
    const initialNotifeeNotification = await notifeePkg.default
      .getInitialNotification()
      .catch(() => null);
    const notificationData = initialNotifeeNotification?.notification?.data || {};
    const callId = String(notificationData.callId || '').trim();

    if (callId) {
      const pressActionId = String(
        initialNotifeeNotification?.pressAction?.id || 'open_call',
      );
      await handleIncomingCallAction(pressActionId, notificationData);
      await updateNotificationDebugSnapshot({
        lastNotificationOpen: {
          at: new Date().toISOString(),
          source: 'notifee_initial_notification_open',
          messageId: callId,
          type: 'incoming_call',
          targetUserId: String(notificationData.targetUserId || ''),
          matchedUser: true,
          reason: pressActionId,
        },
      });
    }
  }

  const unsubscribe = messaging().onNotificationOpenedApp((message: RemoteMessage) => {
    isMessageForCurrentUser(message, 'notification_opened_app')
      .then(matches => {
        if (!matches) return;
        saveNotificationInboxItemFromRemoteMessage(message).catch(() => undefined);
        updateNotificationDebugSnapshot({
          lastNotificationOpen: getDebugEventFromMessage(
            'notification_opened_app',
            message,
            { matchedUser: true, key: getRemoteMessageDedupeKey(message) },
          ),
        }).catch(() => undefined);
        cancelIncomingCallNotification(message.data?.callId).catch(() => undefined);
        if (message.data?.type === 'incoming_call') {
          logs.info('[notifications] skipping firebase incoming-call open; notifee action owns call routing');
          return;
        }
        routeNotificationMessage(message);
      })
      .catch(() => undefined);
  });

  return unsubscribe;
}

export function bindCallNotificationActionHandlers() {
  const pkg = getNotifeeModule();
  if (!pkg?.default?.onForegroundEvent) {
    return () => undefined;
  }

  return pkg.default.onForegroundEvent(async (event: any) => {
    await handleNotifeeEvent(event);
  });
}
