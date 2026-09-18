import { NativeModules, Platform } from 'react-native';
import { logs } from '../logs';

type CallRingtoneNativeModule = {
  playDefaultRingtone?: () => void;
  stopDefaultRingtone?: () => void;
};

const nativeModule =
  Platform.OS === 'android'
    ? (NativeModules.CallRingtone as CallRingtoneNativeModule | undefined)
    : undefined;

export function playDefaultCallRingtone() {
  if (Platform.OS !== 'android') {
    logs.info('[call-ringtone] native ringtone skipped on iOS');
    return;
  }
  nativeModule?.playDefaultRingtone?.();
}

export function stopDefaultCallRingtone() {
  if (Platform.OS !== 'android') {
    logs.info('[call-ringtone] native ringtone stop skipped on iOS');
    return;
  }
  nativeModule?.stopDefaultRingtone?.();
}
