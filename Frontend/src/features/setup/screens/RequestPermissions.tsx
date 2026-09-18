import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { requestAllPermissions } from '../utils/permissions';
import {
  DEV_SKIP_DEVICE_LINKING,
  DEMO_ONBOARDING_WALKTHROUGH,
} from '../../../config/env';
import { useTheme } from '../../../theme/ThemeContext';
import { logs } from '../../../services/logs';
import { useUiScale } from '../../../theme/responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'RequestPermissions'>;

const THEME = {
  light: { background: '#FFFFFF', text: 'rgba(0,0,0,0.6)', spinner: '#2362EB' },
  dark: { background: '#0F0F10', text: 'rgba(255,255,255,0.7)', spinner: '#FFFFFF' },
};

// A transitional step, not a screen with its own design — fires every
// permission's native OS dialog back-to-back (same request order as
// Permissions.tsx's "Enable All", via the shared requestAllPermissions
// helper) before device setup starts, instead of asking for permissions
// piecemeal or only at the very end of onboarding. Proceeds regardless of
// what the user grants or denies — DeviceSetup's own camera-permission gate
// (and Permissions.tsx, still reachable from Settings) handle any gaps
// later, so this never blocks onboarding on a single denial.
export default function RequestPermissions({ navigation, route }: Props) {
  const styles = useStyles();
  const { isDark } = useTheme();
  const palette = isDark ? THEME.dark : THEME.light;
  // The fresh-signup path (Otp/AccountVerified/PersonalDetails) always lands
  // on DeviceSetup from here, so the dev bypass has to be honoured here too —
  // Splash's gate alone only covers relaunches.
  // The demo walkthrough wants the real chain, so it beats the dev bypass
  // that would otherwise jump from here to Home.
  const next = DEMO_ONBOARDING_WALKTHROUGH
    ? 'DeviceSetup'
    : DEV_SKIP_DEVICE_LINKING
      ? 'MainTabs'
      : route.params?.next ?? 'DeviceSetup';

  useEffect(() => {
    let cancelled = false;

    requestAllPermissions()
      .catch(error => {
        logs.error('[request-permissions] flow failed', String(error));
      })
      .finally(() => {
        if (cancelled) return;
        logs.info('[request-permissions] dialogs done, continuing', { next });
        navigation.reset({
          index: 0,
          routes: [
            next === 'MainTabs'
              ? { name: 'MainTabs' }
              : {
                  name: 'DeviceSetup',
                  params: { type: 'device', from: 'setup' },
                },
          ],
        });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      <View style={styles.container}>
        <ActivityIndicator size="large" color={palette.spinner} />
        <Text style={[styles.text, { color: palette.text }]}>Setting things up…</Text>
      </View>
    </SafeAreaView>
  );
}

function useStyles() {
  const scale = useUiScale();
  return useMemo(() => createStyles(scale), [scale]);
}

function createStyles(scale: number) {
  const s = (n: number) => n * scale;

  return StyleSheet.create({
    safe: {
      flex: 1,
    },
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      marginTop: s(16),
      fontSize: s(14),
      fontFamily: 'Satoshi-Regular',
    },
  });
}
