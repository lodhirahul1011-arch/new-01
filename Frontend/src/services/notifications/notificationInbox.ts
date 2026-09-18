import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUserId } from '../storage/sessionStorage';
import { logs } from '../logs';

const NOTIFICATION_INBOX_STORAGE_KEY = 'notifications.inbox';
const MAX_INBOX_ITEMS = 60;
const DEFAULT_NOTIFICATION_TITLE = 'Dvaari Notification';
const DEFAULT_NOTIFICATION_BODY = 'Open Dvaari to view the latest update.';
const LEGACY_NOTIFICATION_TITLE = 'Dwar';
const LEGACY_NOTIFICATION_BODY = 'You have a new update.';
const inboxListeners = new Set<() => void>();
let inboxMutationQueue: Promise<void> = Promise.resolve();

function runInboxMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = inboxMutationQueue.then(operation, operation);
  inboxMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export type NotificationInboxItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  scheduleId?: string;
};

type RemoteMessage = {
  data?: Record<string, string>;
  notification?: {
    title?: string;
    body?: string;
  };
  messageId?: string;
};

async function getInboxStorageKey() {
  const userId = String((await getCurrentUserId()) || '').trim();
  return userId
    ? `${NOTIFICATION_INBOX_STORAGE_KEY}.${userId}`
    : NOTIFICATION_INBOX_STORAGE_KEY;
}

async function isMessageForCurrentUser(message: RemoteMessage) {
  const targetUserId = String(message.data?.targetUserId || '').trim();
  if (!targetUserId) return true;

  const currentUserId = String((await getCurrentUserId()) || '').trim();
  if (!currentUserId) return true;
  return currentUserId === targetUserId;
}

function normalizeInboxItem(item: NotificationInboxItem): NotificationInboxItem {
  const storedTitle = String(item.title || '').trim();
  const storedBody = String(item.body || '').trim();
  const hasLegacyTitle = storedTitle === LEGACY_NOTIFICATION_TITLE;
  const hasLegacyBody = storedBody === LEGACY_NOTIFICATION_BODY;
  const title = hasLegacyTitle ? '' : storedTitle;
  const body = hasLegacyBody ? '' : storedBody;
  if (!title || !body || hasLegacyTitle || hasLegacyBody) {
    logs.info('[notifications] stored inbox item missing display text; applying fallback', {
      id: String(item.id || ''),
      missingTitle: !title,
      missingBody: !body,
      migratedLegacyTitle: hasLegacyTitle,
      migratedLegacyBody: hasLegacyBody,
    });
  }

  return {
    id: String(item.id || ''),
    type: String(item.type || 'general'),
    title: title || DEFAULT_NOTIFICATION_TITLE,
    body: body || DEFAULT_NOTIFICATION_BODY,
    createdAt: String(item.createdAt || new Date().toISOString()),
    read: Boolean(item.read),
    scheduleId: item.scheduleId ? String(item.scheduleId) : undefined,
  };
}

function getRemoteText(message: RemoteMessage) {
  const title = String(
    message.notification?.title ||
    message.data?.title ||
    message.data?.heading ||
    '',
  ).trim();
  const body = String(
    message.notification?.body ||
    message.data?.body ||
    message.data?.message ||
    '',
  ).trim();

  if (!title || !body) {
    logs.info('[notifications] remote message missing display text; applying fallback', {
      messageId: String(message.messageId || ''),
      missingTitle: !title,
      missingBody: !body,
    });
  }

  return {
    title: title || DEFAULT_NOTIFICATION_TITLE,
    body: body || DEFAULT_NOTIFICATION_BODY,
  };
}

function buildInboxItemFromRemoteMessage(
  message: RemoteMessage,
): NotificationInboxItem {
  const { title, body } = getRemoteText(message);
  const id =
    String(message.messageId || '').trim() ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    type: String(message.data?.type || 'general'),
    title,
    body,
    createdAt: new Date().toISOString(),
    read: false,
    scheduleId: message.data?.scheduleId
      ? String(message.data.scheduleId)
      : undefined,
  };
}

export async function getNotificationInboxItems() {
  const raw = await AsyncStorage.getItem(await getInboxStorageKey());
  if (!raw) {
    return [] as NotificationInboxItem[];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeInboxItem);
  } catch (error) {
    logs.error('[notifications] failed to parse stored inbox items', String(error));
    return [];
  }
}

async function setNotificationInboxItems(items: NotificationInboxItem[]) {
  await AsyncStorage.setItem(
    await getInboxStorageKey(),
    JSON.stringify(items.slice(0, MAX_INBOX_ITEMS)),
  );
  inboxListeners.forEach(listener => {
    try {
      listener();
    } catch (error) {
      logs.error('[notifications] inbox listener failed after persistence', String(error));
    }
  });
}

export function subscribeToNotificationInbox(listener: () => void) {
  inboxListeners.add(listener);
  return () => {
    inboxListeners.delete(listener);
  };
}

export async function getUnreadNotificationInboxCount() {
  const items = await getNotificationInboxItems();
  return items.filter(item => !item.read).length;
}

export async function saveNotificationInboxItemFromRemoteMessage(
  message: RemoteMessage | null | undefined,
) {
  return runInboxMutation(async () => {
    if (!message) {
      return;
    }
    if (!(await isMessageForCurrentUser(message))) {
      return;
    }

    const nextItem = buildInboxItemFromRemoteMessage(message);
    const items = await getNotificationInboxItems();
    const existingIndex = items.findIndex(item => item.id === nextItem.id);

    if (existingIndex >= 0) {
      items[existingIndex] = {
        ...items[existingIndex],
        ...nextItem,
        createdAt: items[existingIndex].createdAt || nextItem.createdAt,
        read: false,
      };
    } else {
      items.unshift(nextItem);
    }

    await setNotificationInboxItems(items);
    logs.info('[notifications] inbox item saved', {
      id: nextItem.id,
      type: nextItem.type,
    });
  });
}

export async function markAllNotificationInboxItemsRead() {
  return runInboxMutation(async () => {
    const items = await getNotificationInboxItems();
    if (!items.some(item => !item.read)) {
      return;
    }

    await setNotificationInboxItems(items.map(item => ({ ...item, read: true })));
    logs.info('[notifications] all inbox items marked as read', {
      count: items.length,
    });
  });
}

export async function markNotificationInboxItemsReadByTypes(types: string[]) {
  return runInboxMutation(async () => {
    const targetTypes = new Set(types.map(type => String(type || '').trim()));
    if (!targetTypes.size) {
      return;
    }

    const items = await getNotificationInboxItems();
    const hasUnreadTarget = items.some(
      item => !item.read && targetTypes.has(String(item.type || '').trim()),
    );
    if (!hasUnreadTarget) {
      return;
    }

    await setNotificationInboxItems(
      items.map(item =>
        targetTypes.has(String(item.type || '').trim())
          ? { ...item, read: true }
          : item,
      ),
    );
    logs.info('[notifications] inbox item types marked as read', {
      types: Array.from(targetTypes),
    });
  });
}

export async function removeNotificationInboxItem(id: string) {
  return runInboxMutation(async () => {
    const items = await getNotificationInboxItems();
    await setNotificationInboxItems(items.filter(item => item.id !== id));
    logs.info('[notifications] inbox item persistence removed', { id });
  });
}

export async function clearNotificationInbox() {
  return runInboxMutation(async () => {
    await setNotificationInboxItems([]);
    logs.info('[notifications] inbox persistence cleared');
  });
}

export async function clearAllNotificationInboxStorage() {
  return runInboxMutation(async () => {
    const keys = await AsyncStorage.getAllKeys();
    const inboxKeys = keys.filter(
      key =>
        key === NOTIFICATION_INBOX_STORAGE_KEY ||
        key.startsWith(`${NOTIFICATION_INBOX_STORAGE_KEY}.`),
    );

    if (inboxKeys.length) {
      await AsyncStorage.multiRemove(inboxKeys);
    }

    inboxListeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        logs.error('[notifications] inbox listener failed after storage clear', String(error));
      }
    });
    logs.info('[notifications] all inbox storage cleared', {
      keyCount: inboxKeys.length,
    });
  });
}
