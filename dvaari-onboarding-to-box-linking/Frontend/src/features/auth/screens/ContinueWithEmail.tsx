import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  StatusBar,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import {
  useRequestLinkOtpMutation,
  useRequestOtpMutation,
} from '../../../services/api/authApi';
import ArrowLeftSvg from '../../../assets/icons/common/arrow-left-black.svg';
import ArrowLeftWhiteIcon from '../../../assets/icons/common/arrow-left-white.svg';
import CloseRoundFillIcon from '../../../assets/icons/common/close-round-fill.svg';
import CloseRoundFillWhiteIcon from '../../../assets/icons/common/close-round-fill-white.svg';
import { useAppSelector } from '../../../store/hooks';
import ResponsiveScrollScreen from '../../../components/layout/ResponsiveScrollScreen';
import {
  SCREEN_PADDING_H,
  PRIMARY_BUTTON,
  HEADER_TITLE_SIZE,
  HEADER_TITLE_GAP,
} from '../../../theme/metrics';
import { useTheme } from '../../../theme/ThemeContext';
import DarkGlow from '../../../components/ui/DarkGlow';
import { useUiScale } from '../../../theme/responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'ContinueWithEmail'>;

const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Every number below is copied 1:1 from the Figma frame (fileKey
// 0ZAjL8CnVgprbKaBMIjUqJ, "And Continue" node 73:534), a 360x812 canvas,
// scaled by a single width-based factor — same technique as Otp/Login.
const CANVAS_W = 360;
const HEADER_TOP = 28; // 72 (Figma) - 44 (its status-bar mockup already covered by SafeAreaView)
const HEADER_H = 26;

const THEME = {
  light: {
    background: '#FFFFFF',
    backBtnBg: '#F2F2F2',
    backBtnBorder: 'rgba(0,0,0,0.12)',
    title: '#000000',
    label: '#000000',
    inputBorder: 'rgba(51,51,51,0.18)',
    inputText: 'rgba(0,0,0,0.73)',
    placeholder: 'rgba(0,0,0,0.4)',
  },
  dark: {
    background: '#0F0F10',
    backBtnBg: 'rgba(255,255,255,0.15)',
    backBtnBorder: 'rgba(255,255,255,0.15)',
    title: '#FFFFFF',
    label: 'rgba(255,255,255,0.9)',
    inputBorder: 'rgba(255,255,255,0.2)',
    inputText: 'rgba(255,255,255,0.85)',
    placeholder: 'rgba(255,255,255,0.35)',
  },
};

export default function ContinueWithEmail({ navigation }: Props) {
  const styles = useStyles();
  const scale = useUiScale(CANVAS_W);
  const s = (n: number) => n * scale;
  const { isDark } = useTheme();
  const palette = isDark ? THEME.dark : THEME.light;

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [requestOtp, { isLoading }] = useRequestOtpMutation();
  const [requestLinkOtp, { isLoading: linkLoading }] = useRequestLinkOtpMutation();
  // Signed in already means this is onboardings second identifier, which must
  // attach to the current account rather than resolve/create one of its own.
  const isLinking = Boolean(useAppSelector(state => state.auth.accessToken));
  const sending = isLoading || linkLoading;

  const trimmedEmail = useMemo(() => email.trim(), [email]);
  const isValid = useMemo(() => EMAIL_REGEX.test(trimmedEmail), [trimmedEmail]);

  const onContinue = async () => {
    setError(undefined);

    if (!isValid || sending) {
      setError('Please enter a valid email address.');
      return;
    }

    try {
      // Signed in already means this is onboarding's second leg (email on
      // top of a phone signup), which must ATTACH to the current account.
      // request-otp would resolve the email to no account and create a
      // duplicate, orphaning the phone one.
      const response = isLinking
        ? await requestLinkOtp({ identifier: trimmedEmail }).unwrap()
        : await requestOtp({ identifier: trimmedEmail }).unwrap();

      if (!response?.ok) {
        setError('Could not send verification code. Please try again.');
        return;
      }

      navigation.navigate('CheckEmail', {
        destination: trimmedEmail,
        otpSessionId: response.otpSessionId,
        debugCode: response.debugCode,
      });
    } catch (err: any) {
      const apiMessage =
        err?.data?.message || err?.error || 'Something went wrong. Please try again.';
      setError(apiMessage);
    }
  };

  return (
    <ResponsiveScrollScreen
      backgroundColor={palette.background}
      keyboardAware
      contentContainerStyle={styles.scrollContent}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      {isDark && <DarkGlow scale={scale} />}
      <View style={[styles.container, { paddingTop: s(HEADER_TOP) }]}>
        <View style={[styles.topBar, { height: s(HEADER_H), paddingHorizontal: s(SCREEN_PADDING_H), gap: s(HEADER_TITLE_GAP) }]}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={{
              width: s(26),
              height: s(26),
              borderRadius: s(13),
              backgroundColor: palette.backBtnBg,
              borderWidth: s(0.5),
              borderColor: palette.backBtnBorder,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isDark ? (
              <ArrowLeftWhiteIcon width={s(16)} height={s(16)} />
            ) : (
              <ArrowLeftSvg width={s(16)} height={s(16)} />
            )}
          </Pressable>
          <Text style={[styles.topBarTitle, { fontSize: s(HEADER_TITLE_SIZE), color: palette.title }]}>
            Continue with Email
          </Text>
        </View>

        <View style={[styles.content, { paddingHorizontal: s(SCREEN_PADDING_H) }]}>
          <Text style={[styles.label, { marginTop: s(31), fontSize: s(13), color: palette.label }]}>
            Please enter your email
          </Text>

          <View
            style={[
              styles.inputWrap,
              { marginTop: s(9), height: s(48), borderRadius: s(10), paddingHorizontal: s(14), borderColor: palette.inputBorder },
            ]}
          >
            <TextInput
              value={email}
              onChangeText={text => {
                setError(undefined);
                setEmail(text.replace(/\s/g, ''));
              }}
              placeholder="liamsmith@gmail.com"
              placeholderTextColor={palette.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              keyboardType="email-address"
              style={[styles.input, { fontSize: s(15), color: palette.inputText }]}
            />
            {!!email && (
              <Pressable onPress={() => setEmail('')} hitSlop={8}>
                {isDark ? (
                  <CloseRoundFillWhiteIcon width={s(14)} height={s(14)} />
                ) : (
                  <CloseRoundFillIcon width={s(14)} height={s(14)} />
                )}
              </Pressable>
            )}
          </View>

          {!!error && <Text style={[styles.errorText, { fontSize: s(12) }]}>{error}</Text>}
        </View>

        <View style={{ flex: 1, minHeight: s(24) }} />

        {/* ResponsiveScrollScreen's SafeAreaView already insets for the
            device's real bottom safe area (gesture bar/home indicator) —
            this only needs a small extra breathing-room gap beyond that,
            not Figma's full mockup gap to its own fake home indicator
            (stacking both created a large double gap below the button). */}
        <View style={[styles.bottomArea, { paddingHorizontal: s(SCREEN_PADDING_H), paddingBottom: s(16) }]}>
          <Pressable
            onPress={onContinue}
            disabled={!isValid || sending}
            style={[
              styles.primaryBtn,
              { minHeight: s(PRIMARY_BUTTON.minHeight), borderRadius: s(PRIMARY_BUTTON.radius) },
              (!isValid || sending) && styles.primaryBtnDisabled,
            ]}
          >
            <Text style={[styles.primaryBtnText, { fontSize: s(PRIMARY_BUTTON.fontSize) }]}>
              {sending ? 'Please wait...' : 'Continue'}
            </Text>
          </Pressable>
        </View>
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
    scrollContent: {
      flexGrow: 1,
    },

    container: {
      flex: 1,
    },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    topBarTitle: {
      fontFamily: 'Satoshi-Medium',
      color: '#000000',
    },

    content: {},

    label: {
      fontFamily: 'Satoshi-Regular',
      color: '#000000',
    },

    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 0.45,
      borderColor: 'rgba(51,51,51,0.18)',
    },

    input: {
      flex: 1,
      fontFamily: 'Satoshi-Regular',
      color: 'rgba(0,0,0,0.73)',
    },

    errorText: {
      marginTop: s(8),
      color: '#EA8080',
      fontFamily: 'Satoshi-Medium',
    },

    bottomArea: {},

    primaryBtn: {
      alignSelf: 'center',
      width: s(PRIMARY_BUTTON.width),
      maxWidth: '100%',
      backgroundColor: '#2362EB',
      alignItems: 'center',
      justifyContent: 'center',
    },

    primaryBtnDisabled: {
      backgroundColor: '#81A5F3',
    },

    primaryBtnText: {
      color: '#FFFFFF',
      fontFamily: 'Satoshi-Medium',
    },
  });
}
