import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

import { logs } from '../logs';

const ACTIVE_MOBILE_CALL_KEY = 'calls.mobileActiveCallId';
const BUSY_AUDIO_MODES = new Set(['in_call', 'in_communication']);

type MobileCallStateNativeModule = {
  getAudioCallState?: () => Promise<{
    busy?: boolean;
    mode?: string;
    modeValue?: number;
  }>;
};

const mobileCallStateNative =
  Platform.OS === 'android'
    ? (NativeModules.MobileCallState as MobileCallStateNativeModule | undefined)
    : undefined;

let activeMobileCallId = '';

async function getNativeAudioCallBusyState() {
  if (!mobileCallStateNative?.getAudioCallState) {
    logs.info('[calls] native audio call state module unavailable');
    return { busy: false, mode: 'unavailable' };
  }

  try {
    const state = await mobileCallStateNative.getAudioCallState();
    const mode = String(state?.mode || '').trim();
    const busy = Boolean(state?.busy) || BUSY_AUDIO_MODES.has(mode);

    logs.info('[calls] native audio call state checked', {
      busy,
      mode,
      modeValue: state?.modeValue,
    });

    return { busy, mode };
  } catch (error) {
    logs.error('[calls] failed to read native audio call state', String(error));
    return { busy: false, mode: 'error' };
  }
}

export function markMobileCallActive(callId: string) {
  const normalizedCallId = String(callId || '').trim();
  if (!normalizedCallId) {
    logs.error('[calls] cannot mark empty mobile call active');
    return;
  }

  activeMobileCallId = normalizedCallId;
  logs.info('[calls] mobile call marked active', normalizedCallId);
  AsyncStorage.setItem(ACTIVE_MOBILE_CALL_KEY, normalizedCallId).catch(error => {
    logs.error('[calls] failed to persist active mobile call', String(error));
  });
}

export async function clearMobileCallActive(callId?: string) {
  const normalizedCallId = String(callId || '').trim();
  const storedCallId = String((await AsyncStorage.getItem(ACTIVE_MOBILE_CALL_KEY)) || '').trim();
  const shouldClearMemory = !normalizedCallId || activeMobileCallId === normalizedCallId;
  const shouldClearStorage = !normalizedCallId || storedCallId === normalizedCallId;

  if (shouldClearMemory) {
    activeMobileCallId = '';
  }

  if (shouldClearStorage) {
    await AsyncStorage.removeItem(ACTIVE_MOBILE_CALL_KEY);
  }

  logs.info('[calls] mobile call active marker cleared', {
    callId: normalizedCallId || 'all',
    clearedMemory: shouldClearMemory,
    clearedStorage: shouldClearStorage,
  });
}

export async function isMobileBusyWithCall(nextCallId?: string) {
  const normalizedNextCallId = String(nextCallId || '').trim();
  const storedCallId = String((await AsyncStorage.getItem(ACTIVE_MOBILE_CALL_KEY)) || '').trim();
  const currentCallId = activeMobileCallId || storedCallId;
  const appCallBusy = Boolean(currentCallId && currentCallId !== normalizedNextCallId);
  const nativeCallState = await getNativeAudioCallBusyState();
  const busy = appCallBusy || nativeCallState.busy;

  logs.info('[calls] mobile busy check completed', {
    nextCallId: normalizedNextCallId,
    activeCallId: currentCallId,
    appCallBusy,
    nativeAudioMode: nativeCallState.mode,
    busy,
  });

  return busy;
}
