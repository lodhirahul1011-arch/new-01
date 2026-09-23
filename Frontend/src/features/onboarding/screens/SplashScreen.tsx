import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  Text,
  Pressable,
} from 'react-native';

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../../navigation/RootNavigator';

import { useAppDispatch } from '../../../store/hooks';
import { authActions } from '../../../store/slices/authSlice';
import { preferencesActions } from '../../../store/slices/preferencesSlice';

import {
  clearTokens,
  getOnboardingCompleted,
  getAccessToken,
  getStoredTokens,
  setTokens,
} from '../../../services/storage/tokenStorage';
import { getStoredLanguage } from '../../../services/storage/languageStorage';
import { getStoredSimpleMode } from '../../../services/storage/simpleModeStorage';
import { clearCurrentUserId, getAuthUserId, setCurrentUserId } from '../../../services/storage/sessionStorage';
import { i18n, supportedLanguages, useAppTranslation } from '../../../services/i18n';
import { logs } from '../../../services/logs';

import { useLazyMeQuery } from '../../../services/api/authApi';
import { syncPushTokenWithAccessToken } from '../../../services/notifications/pushNotifications';
import { useLazyLinkedDevicesSummaryQuery } from '../../../services/api/authApi';
import SplashIconSvg from '../../../assets/icons/splash-icon.svg';
import { Colors, Spacing, Radius, FontSize } from '../../../theme';
import {
  checkAppPermissions,
  hasRequiredPermissions,
} from '../../setup/utils/permissions';
import { DEV_SKIP_DEVICE_LINKING, TEMP_SKIP_ONBOARDING } from '../../../config/env';
import { useUiScale } from '../../../theme/responsive';

// BootSplash is optional native module
let BootSplash: { hide: (options?: { fade?: boolean }) => Promise<void> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  BootSplash = require('react-native-bootsplash')?.default ?? require('react-native-bootsplash');
} catch {
  // BootSplash not installed / available
}

// Figma (fileKey 0ZAjL8CnVgprbKaBMIjUqJ, node 100:236 "Frame 54050") places the
// logo lockup at 184x56 on a 360-wide canvas — scale that ratio to the device.
const FIGMA_CANVAS_WIDTH = 360;
const FIGMA_LOGO_W = 184;
const FIGMA_LOGO_H = 56;
const LOGO = { width: FIGMA_LOGO_W, height: FIGMA_LOGO_H };

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export default function SplashScreen({ navigation }: Props) {

  const dispatch = useAppDispatch();
  const { t } = useAppTranslation();
  const [triggerMe] = useLazyMeQuery();
  const [triggerLinkedDevicesSummary] = useLazyLinkedDevicesSummaryQuery();
  const scale = useUiScale();
  const styles = useMemo(() => createStyles(scale), [scale]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootNonce, setBootNonce] = useState(0);
  const bootInFlightRef = useRef(false);

  // Hide the native boot splash the instant this JS splash screen mounts —
  // it renders the same blue/logo look, so waiting for the async bootstrap
  // below (token/API calls) to finish before hiding it just shows the same
  // splash twice in a row instead of once.
  useEffect(() => {
    BootSplash?.hide?.({ fade: true });
  }, []);

  useEffect(() => {

    const bootstrap = async () => {

      if (bootInFlightRef.current) return;
      bootInFlightRef.current = true;
      setBootError(null);

      const isAuthFailure = (err: any) => {
        const status =
          err?.status ??
          err?.originalStatus ??
          err?.data?.status ??
          err?.error?.status;
        return status === 401 || status === 403;
      };

      const signOutToLogin = async () => {
        await clearTokens();
        await clearCurrentUserId();
        dispatch(authActions.signedOut());
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      };

      try {
        const onboardingCompleted = await getOnboardingCompleted();
        const tokens = await getStoredTokens();
        const storedLanguage = await getStoredLanguage();
        const storedSimpleMode = await getStoredSimpleMode();

        if (storedLanguage && supportedLanguages.includes(storedLanguage as any)) {
          dispatch(
            preferencesActions.languageUpdated(
              storedLanguage as Parameters<
                typeof preferencesActions.languageUpdated
              >[0],
            ),
          );
          await i18n.changeLanguage(storedLanguage);
          logs.info('Stored app language restored', { language: storedLanguage });
        } else if (storedLanguage) {
          logs.error('Stored app language is not supported', { language: storedLanguage });
        }

        dispatch(preferencesActions.simpleModeHydrated(storedSimpleMode));

        if (!onboardingCompleted && !tokens.accessToken) {
          navigation.replace('Onboarding');
          return;
        }

        if (!tokens.accessToken) {
          navigation.replace('Login');
          return;
        }

        await setTokens(tokens.accessToken, tokens.refreshToken || '');

        dispatch(
          authActions.restoredTokens({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
          }),
        );

        // Try a few times before showing an error. Important: do NOT sign out on transient failures.
        let meUser: any | null = null;
        let linkedTotal: number | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await triggerMe().unwrap();
            meUser = res?.user ?? null;
          } catch (err: any) {
            if (isAuthFailure(err)) {
              await signOutToLogin();
              return;
            }
          }

          try {
            const linked = await triggerLinkedDevicesSummary().unwrap();
            linkedTotal = linked?.data?.summary?.total ?? 0;
          } catch (err: any) {
            if (isAuthFailure(err)) {
              await signOutToLogin();
              return;
            }
          }

          if (meUser && linkedTotal !== null) break;

          // small backoff to avoid hammering backend if it is rate-limiting / restarting
          await new Promise<void>(resolve => setTimeout(() => resolve(), 700));
        }

        if (meUser) {
          await setCurrentUserId(getAuthUserId(meUser));
          dispatch(authActions.userUpdated(meUser));
        }

        dispatch(authActions.bootstrapCompleted());

        getAccessToken()
          .then(latestAccessToken =>
            syncPushTokenWithAccessToken(
              latestAccessToken || tokens.accessToken,
              'splash_restored_auth',
            ),
          )
          .catch(error => {
            logs.error('[notifications] splash token sync failed', String(error));
          });

        // Resumes an UNFINISHED sign-up on relaunch, in the same priority order
        // routeAfterVerification uses in Otp.tsx. A missing name is what marks
        // it unfinished, and it gates the identifier legs too: an established
        // account that never stored an email (the phone sign-in path leaves the
        // field unset) has already completed onboarding and must not be sent
        // back to collect one. Checked before the device-linking gate below.
        if (meUser && !meUser.name) {
          if (!meUser.phone) {
            navigation.reset({ index: 0, routes: [{ name: 'EnterPhoneNumber' }] });
            return;
          }

          if (!meUser.email) {
            navigation.reset({ index: 0, routes: [{ name: 'ContinueWithEmail' }] });
            return;
          }

          navigation.reset({
            index: 0,
            routes: [{ name: 'PersonalDetails' }],
          });
          return;
        }

        // Enforce: user must link a device before accessing the app.
        // DEV_SKIP_DEVICE_LINKING lifts that gate for local UI work only.
        const needsDeviceSetup =
          !DEV_SKIP_DEVICE_LINKING && linkedTotal !== null && linkedTotal <= 0;

        // If we couldn't confirm user/device status due to transient backend issues, keep user on Splash
        // and let them retry without forcing logout. Device setup still wins
        // when we positively know there's no linked device, same as before.
        if (!needsDeviceSetup && (!meUser || linkedTotal === null)) {
          setBootError(t('splash_unable_to_connect'));
          return;
        }

        let permissions;
        try {
          permissions = await checkAppPermissions();
        } catch {
          permissions = {
            notification: false,
            location: false,
            camera: false,
            mic: false,
          };
        }

        if (needsDeviceSetup) {
          // Fire the native permission dialogs BEFORE device setup, the same
          // way the fresh-signup path does (Otp -> RequestPermissions ->
          // DeviceSetup). Resetting straight to DeviceSetup here is what made
          // every relaunch skip the dialogs entirely: RequestPermissions is
          // only ever pushed from the one-time signup screens, so a returning
          // user with no linked device never saw a single prompt.
          // RequestPermissions forwards to DeviceSetup once it's done.
          if (!hasRequiredPermissions(permissions)) {
            navigation.reset({
              index: 0,
              routes: [
                {
                  name: 'RequestPermissions',
                  params: { next: 'DeviceSetup' },
                },
              ],
            });
            return;
          }

          navigation.reset({
            index: 0,
            routes: [
              {
                name: 'DeviceSetup',
                params: { type: 'device', from: 'setup' },
              },
            ],
          });
          return;
        }

        navigation.reset({
          index: 0,
          routes: [
            {
              name: hasRequiredPermissions(permissions)
                ? 'MainTabs'
                : 'Permissions',
            },
          ],
        });

      } catch (err: any) {
        if (isAuthFailure(err)) {
          await signOutToLogin();
          return;
        }

        setBootError(t('splash_something_went_wrong'));
      } finally {
        bootInFlightRef.current = false;
      }

    };

    bootstrap();

  }, [bootNonce, dispatch, navigation, t, triggerLinkedDevicesSummary, triggerMe]);

  return (

    <SafeAreaView edges={[]} style={styles.safe}>

      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={styles.container}>

        <SplashIconSvg width={styles.logo.width} height={styles.logo.height} />

        {!!bootError && (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{bootError}</Text>
            <Pressable
              onPress={() => {
                setBootError(null);
                setBootNonce(n => n + 1);
              }}
              style={styles.retryBtn}
            >
              <Text style={styles.retryText}>{t('retry')}</Text>
            </Pressable>
          </View>
        )}

      </View>

    </SafeAreaView>

  );

}

function createStyles(scale: number) {
  const s = (n: number) => n * scale;

  return StyleSheet.create({

    safe: {
      flex: 1,
      backgroundColor: Colors.primaryBlue,
    },

    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    logo: {
      width: s(LOGO.width),
      height: s(LOGO.height),
    },

    errorWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: s(48),
      paddingHorizontal: s(Spacing.xxl),
      alignItems: 'center',
    },

    errorText: {
      color: Colors.white,
      opacity: 0.9,
      textAlign: 'center',
      marginBottom: s(Spacing.md),
      fontSize: s(FontSize.md),
    },

    retryBtn: {
      paddingHorizontal: s(Spacing.xl - Spacing.xs),
      paddingVertical: s(Spacing.sm + Spacing.xs),
      borderRadius: Radius.full,
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },

    retryText: {
      color: Colors.white,
      fontWeight: '600',
      fontSize: s(FontSize.md),
    },

  });
}
