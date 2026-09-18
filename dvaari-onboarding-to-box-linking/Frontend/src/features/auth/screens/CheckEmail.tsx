import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Linking,
  NativeModules,
  Platform,
  StatusBar,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import ResponsiveScrollScreen from '../../../components/layout/ResponsiveScrollScreen';
import ArrowLeftSvg from '../../../assets/icons/common/arrow-left-black.svg';
import ArrowLeftWhiteIcon from '../../../assets/icons/common/arrow-left-white.svg';
import { logs } from '../../../services/logs';
import { SCREEN_PADDING_H, PRIMARY_BUTTON, HEADER_TITLE_SIZE } from '../../../theme/metrics';
import { useTheme } from '../../../theme/ThemeContext';
import DarkGlow from '../../../components/ui/DarkGlow';
import { useUiScale } from '../../../theme/responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'CheckEmail'>;

function maskEmail(email: string) {
  const [user, domain] = email.split('@');
  if (!user || !domain) return email;
  const masked = user.length <= 2 ? `${user[0]}*` : user.slice(0, 2) + '*'.repeat(user.length - 2);
  return `${masked}@${domain}`;
}

// Every number below is copied 1:1 from the Figma frame (fileKey
// 0ZAjL8CnVgprbKaBMIjUqJ, "Check OTp on Email" node 168:176), a 360x812
// canvas, scaled by a single width-based factor — same technique as
// Otp/Login/ContinueWithEmail. Figma's copy ("tap the button in the email")
// implies a magic-link flow, but the backend only ever emails a plain
// numeric code (no magic-link endpoint exists) — so "Open Email App" both
// opens the mail app and carries the user forward to the existing
// code-entry screen (Otp.tsx, already shared with the phone flow) instead
// of a link-based verification this backend can't do.
const CANVAS_W = 360;
const HEADER_TOP = 28; // 72 (Figma) - 44 (its status-bar mockup already covered by SafeAreaView)

const THEME = {
  light: {
    background: '#FFFFFF',
    backBtnBg: '#F2F2F2',
    backBtnBorder: 'rgba(0,0,0,0.12)',
    text: '#000000',
  },
  dark: {
    background: '#0F0F10',
    backBtnBg: 'rgba(255,255,255,0.15)',
    backBtnBorder: 'rgba(255,255,255,0.15)',
    text: '#FFFFFF',
  },
};

export default function CheckEmail({ navigation, route }: Props) {
  const styles = useStyles();
  const scale = useUiScale(CANVAS_W);
  const s = (n: number) => n * scale;
  const { isDark } = useTheme();
  const palette = isDark ? THEME.dark : THEME.light;

  const destination = route.params?.destination ?? '';
  const otpSessionId = route.params?.otpSessionId;
  const debugCode = route.params?.debugCode;

  const goToCodeEntry = () => {
    navigation.replace('Otp', {
      destination,
      via: 'email',
      flow: 'login',
      otpSessionId,
      debugCode,
    });
  };

  const openEmailApp = () => {
    // `mailto:` always lands on a blank compose screen — there's no inbox
    // variant of it. Two JS-only approaches were tried and both proved
    // unreliable: Gmail doesn't register a bare `googlegmail://` deep link
    // at all, and `android-app://<package>` (Android's "launch this app"
    // URI) isn't deterministic either — Gmail declares several
    // MAIN/LAUNCHER activities (ConversationListActivityGmail,
    // GmailActivity, ui.MailActivityGmail, ...) and which one Android
    // resolves to has been observed to vary between calls, sometimes
    // landing somewhere other than the inbox. The `OpenApp` native module
    // (android/.../OpenAppModule.kt) uses
    // PackageManager.getLaunchIntentForPackage(), the exact lookup Android
    // itself uses when the user taps the app's home-screen icon — the only
    // way to deterministically land on Gmail's actual default screen.
    // `mailto:` is kept as a fallback for when Gmail isn't installed, or on
    // iOS where this native module doesn't exist. Deliberately not awaited:
    // opening a mail app can leave this promise unresolved until the user
    // backgrounds/returns to the app, which would otherwise block
    // navigation and make this screen feel stuck. Fire it and move on
    // immediately regardless of outcome.
    const openGmail =
      Platform.OS === 'android' && NativeModules.OpenApp
        ? (NativeModules.OpenApp.openApp('com.google.android.gm') as Promise<boolean>)
        : Promise.resolve(false);

    openGmail
      .then(opened => {
        if (!opened) return Linking.openURL('mailto:');
      })
      .catch(error => {
        logs.error('[check-email] could not open mail app', String(error));
      });
    goToCodeEntry();
  };

  return (
    <ResponsiveScrollScreen backgroundColor={palette.background}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      {isDark && <DarkGlow scale={scale} />}
      <View style={styles.container}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={{
            position: 'absolute',
            top: s(HEADER_TOP),
            left: s(SCREEN_PADDING_H),
            width: s(26),
            height: s(26),
            borderRadius: s(13),
            backgroundColor: palette.backBtnBg,
            borderWidth: s(0.5),
            borderColor: palette.backBtnBorder,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
          }}
        >
          {isDark ? (
            <ArrowLeftWhiteIcon width={s(16)} height={s(16)} />
          ) : (
            <ArrowLeftSvg width={s(16)} height={s(16)} />
          )}
        </Pressable>

        <Image
          source={require('../../../assets/images/auth/check-email.png')}
          style={{ width: s(143), height: s(133), marginTop: s(31), alignSelf: 'center' }}
          resizeMode="contain"
        />

        <Text style={[styles.title, { marginTop: s(38), fontSize: s(HEADER_TITLE_SIZE), color: palette.text }]}>
          Check Your Email
        </Text>

        <Text
          style={[
            styles.description,
            { marginTop: s(18), fontSize: s(14), lineHeight: s(20), width: s(276), color: palette.text },
          ]}
        >
          To confirm your email address, please tap the button in the email we sent to{' '}
          {maskEmail(destination)}
        </Text>

        <Pressable
          onPress={openEmailApp}
          style={[styles.primaryBtn, { marginTop: s(24), minHeight: s(PRIMARY_BUTTON.minHeight), borderRadius: s(PRIMARY_BUTTON.radius) }]}
        >
          <Text style={[styles.primaryBtnText, { fontSize: s(PRIMARY_BUTTON.fontSize) }]}>Open Email App</Text>
        </Pressable>
      </View>
    </ResponsiveScrollScreen>
  );
}

function useStyles() {
  const scale = useUiScale();
  return useMemo(() => createStyles(scale), [scale]);
}

function createStyles(scale: number) {
  const s = (n: number) => n * scale;

  return StyleSheet.create({
    container: {
      flex: 1,
    },

    title: {
      alignSelf: 'center',
      textAlign: 'center',
      fontFamily: 'Satoshi-Regular',
      color: '#000000',
    },

    description: {
      alignSelf: 'center',
      textAlign: 'center',
      fontFamily: 'Satoshi-Regular',
      color: '#000000',
    },

    primaryBtn: {
      alignSelf: 'center',
      width: s(PRIMARY_BUTTON.width),
      maxWidth: '100%',
      backgroundColor: '#2362EB',
      alignItems: 'center',
      justifyContent: 'center',
    },

    primaryBtnText: {
      color: '#FFFFFF',
      fontFamily: 'Satoshi-Medium',
    },
  });
}
