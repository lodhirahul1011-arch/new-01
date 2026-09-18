import AsyncStorage from '@react-native-async-storage/async-storage';

type PersistedSmsShape = {
  text?: string;
  company?: string;
  trackingId?: string | null;
  smsId?: string | null;
  smsDate?: number | null;
  sender?: string | null;
};

type SmsSyncState = {
  lastProcessedAt: number;
  processedKeys: string[];
};

const SMS_SYNC_STATE_KEY = 'sms.sync.state.v1';
const MAX_PROCESSED_KEYS = 500;

const EMPTY_STATE: SmsSyncState = {
  lastProcessedAt: 0,
  processedKeys: [],
};

export function getParsedSmsKey(item: PersistedSmsShape): string {
  if (item.smsId) return `sms:${item.smsId}`;
  if (item.trackingId && item.smsDate != null) {
    return `tracking-date:${item.trackingId}:${item.smsDate}`;
  }
  if (item.smsDate != null) return `date:${item.smsDate}:${item.text || ''}`;
  if (item.trackingId) return `tracking:${item.trackingId}:${item.text || ''}`;
  return `text:${item.company || 'Unknown'}:${item.text || ''}`;
}

export function getBackendMessageId(item: PersistedSmsShape): string {
  if (item.smsId) return `native:${item.smsId}`;
  return `${item.sender || 'unknown'}:${(item.text || '').substring(0, 80)}`;
}

export async function loadSmsSyncState(): Promise<SmsSyncState> {
  try {
    const raw = await AsyncStorage.getItem(SMS_SYNC_STATE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<SmsSyncState>;
    return {
      lastProcessedAt:
        typeof parsed.lastProcessedAt === 'number' &&
        Number.isFinite(parsed.lastProcessedAt)
          ? parsed.lastProcessedAt
          : 0,
      processedKeys: Array.isArray(parsed.processedKeys)
        ? parsed.processedKeys.filter(
            value => typeof value === 'string' && value.trim().length > 0,
          )
        : [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

export async function markSmsProcessed(item: PersistedSmsShape): Promise<void> {
  const current = await loadSmsSyncState();
  const key = getParsedSmsKey(item);
  const processedKeys = Array.from(
    new Set([...current.processedKeys, key]),
  ).slice(-MAX_PROCESSED_KEYS);
  const lastProcessedAt =
    item.smsDate != null && Number.isFinite(item.smsDate)
      ? Math.max(current.lastProcessedAt, item.smsDate)
      : current.lastProcessedAt;

  await AsyncStorage.setItem(
    SMS_SYNC_STATE_KEY,
    JSON.stringify({
      lastProcessedAt,
      processedKeys,
    }),
  );
}

