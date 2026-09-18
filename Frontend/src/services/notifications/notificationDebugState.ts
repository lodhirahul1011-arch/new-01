import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_DEBUG_STORAGE_KEY = 'notifications.debugSnapshot';
const NOTIFICATION_DEBUG_DEDUPE_KEY = 'notifications.displayedMessageKeys';
const MAX_DEDUPE_KEYS = 40;

type NotificationDebugEvent = {
  at: string;
  source: string;
  messageId?: string;
  type?: string;
  title?: string;
  body?: string;
  targetUserId?: string;
  matchedUser?: boolean;
  key?: string;
  reason?: string;
};

type NotificationChannelDebugState = {
  id: string;
  exists?: boolean;
  blocked?: boolean;
};

export type NotificationDebugSnapshot = {
  permissionStatus?: string;
  tokenPresent?: boolean;
  tokenPreview?: string;
  lastTokenSync?: {
    at: string;
    status: 'started' | 'success' | 'failed' | 'skipped';
    reason?: string;
    endpoint?: string;
    httpStatus?: number;
  };
  lastForegroundMessage?: NotificationDebugEvent;
  lastBackgroundMessage?: NotificationDebugEvent;
  lastNotificationOpen?: NotificationDebugEvent;
  lastDisplayAttempt?: NotificationDebugEvent;
  lastFilterDecision?: NotificationDebugEvent;
  channelStates?: NotificationChannelDebugState[];
  lastUpdatedAt?: string;
};

type NotificationDebugListener = (snapshot: NotificationDebugSnapshot) => void;

let cachedSnapshot: NotificationDebugSnapshot | null = null;
const listeners = new Set<NotificationDebugListener>();

function stampSnapshot(
  partial: Partial<NotificationDebugSnapshot>,
  previous?: NotificationDebugSnapshot | null,
): NotificationDebugSnapshot {
  return {
    ...(previous || {}),
    ...partial,
    lastUpdatedAt: new Date().toISOString(),
  };
}

async function persistSnapshot(snapshot: NotificationDebugSnapshot) {
  cachedSnapshot = snapshot;
  await AsyncStorage.setItem(
    NOTIFICATION_DEBUG_STORAGE_KEY,
    JSON.stringify(snapshot),
  );
  listeners.forEach(listener => listener(snapshot));
}

export async function getNotificationDebugSnapshot() {
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  const raw = await AsyncStorage.getItem(NOTIFICATION_DEBUG_STORAGE_KEY);
  if (!raw) {
    cachedSnapshot = {};
    return cachedSnapshot;
  }

  try {
    cachedSnapshot = JSON.parse(raw) as NotificationDebugSnapshot;
    return cachedSnapshot;
  } catch {
    cachedSnapshot = {};
    return cachedSnapshot;
  }
}

export async function updateNotificationDebugSnapshot(
  partial: Partial<NotificationDebugSnapshot>,
) {
  const previous = await getNotificationDebugSnapshot();
  const next = stampSnapshot(partial, previous);
  await persistSnapshot(next);
  return next;
}

export function subscribeNotificationDebugSnapshot(
  listener: NotificationDebugListener,
) {
  listeners.add(listener);
  if (cachedSnapshot) {
    listener(cachedSnapshot);
  } else {
    getNotificationDebugSnapshot()
      .then(snapshot => listener(snapshot))
      .catch(() => undefined);
  }

  return () => {
    listeners.delete(listener);
  };
}

async function getDisplayedMessageKeys() {
  const raw = await AsyncStorage.getItem(NOTIFICATION_DEBUG_DEDUPE_KEY);
  if (!raw) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function setDisplayedMessageKeys(keys: string[]) {
  const next = keys.slice(-MAX_DEDUPE_KEYS);
  await AsyncStorage.setItem(
    NOTIFICATION_DEBUG_DEDUPE_KEY,
    JSON.stringify(next),
  );
}

export async function hasDisplayedNotificationMessageKey(key: string) {
  if (!key) {
    return false;
  }

  const keys = await getDisplayedMessageKeys();
  return keys.includes(key);
}

export async function rememberDisplayedNotificationMessageKey(key: string) {
  if (!key) {
    return;
  }

  const keys = await getDisplayedMessageKeys();
  const next = [...keys.filter(existing => existing !== key), key];
  await setDisplayedMessageKeys(next);
}

