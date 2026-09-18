import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { logs } from '../logs';

const ACCESS_KEY = 'auth.accessToken';
const REFRESH_KEY = 'auth.refreshToken';
const ONBOARDING_KEY = 'app.onboardingCompleted';

type StoredTokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

type NativeAuthTokens = {
  accessToken: string;
  refreshToken: string;
  updatedAt: number;
};

type NativeCallModule = {
  setAuthTokens?: (accessToken: string, refreshToken: string) => void;
  clearAuthTokens?: () => void;
  getAuthTokens?: () => Promise<{
    accessToken?: string | null;
    refreshToken?: string | null;
    updatedAt?: number | null;
  }>;
};

const nativeCall =
  Platform.OS === 'android'
    ? (NativeModules.NativeCall as NativeCallModule | undefined)
    : undefined;

export async function getAccessToken() {
  const tokens = await getStoredTokens();
  return tokens.accessToken;
}

export async function getRefreshToken() {
  const tokens = await getStoredTokens();
  return tokens.refreshToken;
}

export async function getStoredTokens() {
  const values = await AsyncStorage.multiGet([ACCESS_KEY, REFRESH_KEY]);
  const stored = {
    accessToken: values[0][1],
    refreshToken: values[1][1],
  };

  const nativeTokens = await getNativeAuthTokens();
  if (shouldUseNativeTokens(stored, nativeTokens)) {
    const nextTokens = {
      accessToken: nativeTokens.accessToken || stored.accessToken,
      refreshToken: nativeTokens.refreshToken || stored.refreshToken,
    };

    if (nextTokens.accessToken && nextTokens.refreshToken) {
      await AsyncStorage.multiSet([
        [ACCESS_KEY, nextTokens.accessToken],
        [REFRESH_KEY, nextTokens.refreshToken],
      ]);
      logs.info('[storage] auth tokens restored from native mirror', {
        hasAccessToken: Boolean(nextTokens.accessToken),
        hasRefreshToken: Boolean(nextTokens.refreshToken),
        nativeUpdatedAt: nativeTokens.updatedAt || 0,
      });
      return nextTokens;
    }
  }

  return stored;
}

export async function setTokens(accessToken: string, refreshToken: string) {
  await AsyncStorage.multiSet([
    [ACCESS_KEY, accessToken],
    [REFRESH_KEY, refreshToken],
  ]);
  try {
    nativeCall?.setAuthTokens?.(accessToken, refreshToken);
    logs.info('[storage] native call auth token mirror updated');
  } catch (error) {
    logs.error('[storage] native call auth token mirror failed', String(error));
  }
}

export async function clearTokens() {
  logs.info('[storage] clearing auth tokens');
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
  try {
    nativeCall?.clearAuthTokens?.();
    logs.info('[storage] native call auth token mirror cleared');
  } catch (error) {
    logs.error('[storage] native call auth token clear failed', String(error));
  }
}

export async function getOnboardingCompleted() {
  const value = await AsyncStorage.getItem(ONBOARDING_KEY);
  return value === 'true';
}

export async function setOnboardingCompleted(value: boolean) {
  await AsyncStorage.setItem(ONBOARDING_KEY, value ? 'true' : 'false');
}

async function getNativeAuthTokens(): Promise<NativeAuthTokens> {
  if (!nativeCall?.getAuthTokens) {
    return emptyNativeTokens();
  }

  try {
    const tokens = await nativeCall.getAuthTokens();
    return {
      accessToken: String(tokens?.accessToken || '').trim(),
      refreshToken: String(tokens?.refreshToken || '').trim(),
      updatedAt: Number(tokens?.updatedAt || 0),
    };
  } catch (error) {
    logs.error('[storage] native call auth token read failed', String(error));
    return emptyNativeTokens();
  }
}

function emptyNativeTokens(): NativeAuthTokens {
  return {
    accessToken: '',
    refreshToken: '',
    updatedAt: 0,
  };
}

function shouldUseNativeTokens(
  stored: StoredTokens,
  nativeTokens: NativeAuthTokens,
) {
  if (!nativeTokens.accessToken || !nativeTokens.refreshToken) {
    return false;
  }

  if (!stored.accessToken || !stored.refreshToken) {
    logs.info('[storage] native auth mirror selected because stored tokens are incomplete');
    return true;
  }

  if (nativeTokens.refreshToken !== stored.refreshToken) {
    logs.info('[storage] native auth mirror selected because refresh token rotated outside JS');
    return true;
  }

  if (nativeTokens.accessToken !== stored.accessToken && nativeTokens.updatedAt > 0) {
    logs.info('[storage] native auth mirror selected because access token differs');
    return true;
  }

  return false;
}
