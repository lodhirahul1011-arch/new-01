import { NativeModules, Platform } from 'react-native';
import { logs } from '../../services/logs';

type LiveFeedAudioNativeModule = {
  activateMediaSpeaker?: () => void;
  activateCallEarpiece?: () => void;
  activateCallSpeaker?: () => void;
  releaseMediaSpeaker?: () => void;
};

const nativeModule =
  Platform.OS === 'android'
    ? (NativeModules.LiveFeedAudio as LiveFeedAudioNativeModule | undefined)
    : undefined;

export function activateLiveFeedAudioRoute() {
  if (Platform.OS !== 'android') {
    logs.info('[audio-route] media speaker route skipped on iOS');
    return;
  }
  nativeModule?.activateMediaSpeaker?.();
}

export function activateCallEarpieceRoute() {
  if (Platform.OS !== 'android') {
    logs.info('[audio-route] call earpiece route skipped on iOS');
    return;
  }
  nativeModule?.activateCallEarpiece?.();
}

export function activateCallSpeakerRoute() {
  if (Platform.OS !== 'android') {
    logs.info('[audio-route] call speaker route skipped on iOS');
    return;
  }
  nativeModule?.activateCallSpeaker?.();
}

export function releaseLiveFeedAudioRoute() {
  if (Platform.OS !== 'android') {
    logs.info('[audio-route] media speaker release skipped on iOS');
    return;
  }
  nativeModule?.releaseMediaSpeaker?.();
}

export const activateLiveFeedMediaSpeaker = activateLiveFeedAudioRoute;
export const releaseLiveFeedMediaSpeaker = releaseLiveFeedAudioRoute;
