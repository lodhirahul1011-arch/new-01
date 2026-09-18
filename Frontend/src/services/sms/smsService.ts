import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  TurboModuleRegistry,
} from 'react-native';
import { logs } from '../logs';

export type SmsMessage = {
  body: string;
  [key: string]: unknown;
};

const SMS_DEBUG = typeof __DEV__ !== 'undefined' && __DEV__;
const debugLog = (...args: unknown[]) => {
  if (!SMS_DEBUG) return;
  logs.info('[sms]', args);
};

type SmsNativeModule = {
  getSMS?: (options: {since?: number; limit?: number} | null) => Promise<unknown>;
  consumePendingBackgroundSms?: () => Promise<unknown>;
  startSmsObserver?: () => void;
  stopSmsObserver?: () => void;
  addListener?: (eventName: string) => void;
  removeListeners?: (count: number) => void;
};

const smsModuleFromNativeModules = (NativeModules as {SmsModule?: unknown})
  ?.SmsModule as SmsNativeModule | undefined;

const smsModuleFromTurbo = (TurboModuleRegistry.get?.('SmsModule') ??
  undefined) as SmsNativeModule | undefined;

const SmsModule =
  smsModuleFromNativeModules ?? smsModuleFromTurbo ?? undefined;
const smsModuleSource = smsModuleFromNativeModules
  ? 'NativeModules'
  : smsModuleFromTurbo
    ? 'TurboModuleRegistry'
    : 'missing';

debugLog('SmsModule resolve', {source: smsModuleSource});

const SmsModuleTyped = SmsModule as
  | {
      getSMS?: (
        options: {since?: number; limit?: number} | null,
      ) => Promise<unknown>;
      consumePendingBackgroundSms?: () => Promise<unknown>;
      startSmsObserver?: () => void;
      stopSmsObserver?: () => void;
      addListener?: (eventName: string) => void;
      removeListeners?: (count: number) => void;
    }
  | undefined;

const SMS_CHANGED_EVENT = 'SmsModule:smsChanged';
let observerRefCount = 0;
let eventEmitter: NativeEventEmitter | null = null;

function getEmitter(): NativeEventEmitter | null {
  if (Platform.OS !== 'android') return null;
  if (!SmsModuleTyped) return null;
  if (eventEmitter) return eventEmitter;
  eventEmitter = new NativeEventEmitter(SmsModuleTyped as never);
  debugLog('NativeEventEmitter created');
  return eventEmitter;
}

function normalizeSmsList(raw: unknown): SmsMessage[] {
  let value = raw;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      debugLog('normalize: failed to JSON.parse string result');
      return [];
    }
  }

  if (!Array.isArray(value)) {
    debugLog('normalize: non-array result', typeof value);
    return [];
  }

  const result: SmsMessage[] = [];

  for (const item of value) {
    if (typeof item === 'string') {
      result.push({body: item});
      continue;
    }

    if (item && typeof item === 'object') {
      const body = (item as {body?: unknown}).body;
      if (typeof body === 'string' && body.trim().length > 0) {
        result.push({...(item as Record<string, unknown>), body});
      } else {
        debugLog('normalize: skipped item without string body');
      }
    }
  }

  return result;
}

export const fetchSMS = async (options?: {
  since?: number;
  limit?: number;
}): Promise<SmsMessage[]> => {
  if (Platform.OS !== 'android') {
    logs.info('[sms] fetch skipped on unsupported platform', Platform.OS);
    return [];
  }

  try {
    if (!SmsModuleTyped?.getSMS) {
      debugLog('fetchSMS: SmsModule.getSMS not available', {
        platform: Platform.OS,
        hasSmsModule: !!SmsModuleTyped,
        source: smsModuleSource,
        keys:
          SmsModuleTyped && typeof SmsModuleTyped === 'object'
            ? Object.keys(SmsModuleTyped as Record<string, unknown>)
            : null,
      });
      return [];
    }

    const requestOptions =
      options && Object.keys(options).length > 0 ? options : null;

    debugLog('fetchSMS: calling native getSMS()', requestOptions);
    const smsList = await SmsModuleTyped.getSMS(requestOptions);
    const normalized = normalizeSmsList(smsList);
    debugLog('fetchSMS: got', normalized.length, 'messages');
    return normalized;
  } catch (error) {
    logs.error('[sms] fetch failed', String(error));
    return [];
  }
};

export function subscribeToSmsChanges(onChange: () => void): () => void {
  const emitter = getEmitter();
  if (!emitter || !SmsModuleTyped?.startSmsObserver) {
    debugLog('subscribe: observer not available (platform/module missing)', {
      platform: Platform.OS,
      hasEmitter: !!emitter,
      hasSmsModule: !!SmsModuleTyped,
      source: smsModuleSource,
      hasStart: !!SmsModuleTyped?.startSmsObserver,
      keys:
        SmsModuleTyped && typeof SmsModuleTyped === 'object'
          ? Object.keys(SmsModuleTyped as Record<string, unknown>)
          : null,
    });
    return () => {};
  }

  observerRefCount += 1;
  if (observerRefCount === 1) {
    debugLog('subscribe: startSmsObserver()');
    SmsModuleTyped.startSmsObserver();
  } else {
    debugLog('subscribe: observer already running, count=', observerRefCount);
  }

  const sub = emitter.addListener(SMS_CHANGED_EVENT, () => {
    debugLog('event:', SMS_CHANGED_EVENT);
    onChange();
  });

  return () => {
    sub.remove();
    observerRefCount = Math.max(0, observerRefCount - 1);
    if (observerRefCount === 0) {
      debugLog('unsubscribe: stopSmsObserver()');
      SmsModuleTyped.stopSmsObserver?.();
    } else {
      debugLog('unsubscribe: remaining count=', observerRefCount);
    }
  };
}


export const consumePendingBackgroundSMS = async (): Promise<SmsMessage[]> => {
  if (Platform.OS !== 'android') {
    logs.info('[sms] background consume skipped on unsupported platform', Platform.OS);
    return [];
  }

  try {
    if (!SmsModuleTyped?.consumePendingBackgroundSms) {
      debugLog('consumePendingBackgroundSMS: native method unavailable');
      return [];
    }

    debugLog('consumePendingBackgroundSMS: calling native consume');
    const smsList = await SmsModuleTyped.consumePendingBackgroundSms();
    const normalized = normalizeSmsList(smsList);
    debugLog('consumePendingBackgroundSMS: got', normalized.length, 'messages');
    return normalized;
  } catch (error) {
    logs.error('[sms] background consume failed', String(error));
    return [];
  }
};
