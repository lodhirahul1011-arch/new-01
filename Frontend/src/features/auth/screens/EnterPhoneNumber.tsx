import React, { useEffect, useMemo, useState } from 'react';
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
import { countries, defaultCountry, getFlagEmoji } from '../data/countries';
import ArrowLeftSvg from '../../../assets/icons/common/arrow-back-otp.svg';
import ArrowLeftWhiteIcon from '../../../assets/icons/common/arrow-back-otp-white.svg';
import DropdownArrowIcon from '../../../assets/icons/common/dropdown-arrow.svg';
import DropdownArrowWhiteIcon from '../../../assets/icons/common/dropdown-arrow-white.svg';
import CloseRoundFillIcon from '../../../assets/icons/common/close-round-fill.svg';
import CloseRoundFillWhiteIcon from '../../../assets/icons/common/close-round-fill-white.svg';
import { useAppSelector } from '../../../store/hooks';
import ResponsiveScrollScreen from '../../../components/layout/ResponsiveScrollScreen';
import {
  SCREEN_PADDING_H,
  BOTTOM_BUTTON_GAP,
  PRIMARY_BUTTON,
  HEADER_TITLE_SIZE,
  FIELD_LABEL_SIZE,
  HEADER_TITLE_GAP,
} from '../../../theme/metrics';
import { useTheme } from '../../../theme/ThemeContext';
import DarkGlow from '../../../components/ui/DarkGlow';
import { useUiScale } from '../../../theme/responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'EnterPhoneNumber'>;

const TEN_DIGIT_PHONE_REGEX = /^\d{10}$/;

// Every number below is copied 1:1 from the Figma frame (fileKey
// 0ZAjL8CnVgprbKaBMIjUqJ, "Enter Phone number when Email" node 414:5219), a
// 360x812 canvas, scaled by a single width-based factor — same technique as
// Otp/Login/ContinueWithEmail. Shown right after a fresh email sign-up
// verifies its email OTP (Otp.tsx routes here before PersonalDetails), so
// the account ends up with a verified phone too.
const CANVAS_W = 360;
const HEADER_TOP = 28; // 72 (Figma) - 44 (its status-bar mockup already covered by SafeAreaView)
const HEADER_H = 26;
// Figma's phone-input row is only 28px tall — too small to comfortably read/
// tap on a real device, so it's bumped up to PHONE_ROW_H, same fix as
// Login.tsx's phone row.
const PHONE_ROW_H = 48;

const THEME = {
  light: {
    background: '#FFFFFF',
    backBtnBg: 'rgba(217,217,217,0.46)',
    backBtnBorder: 'rgba(0,0,0,0.15)',
    title: '#000000',
    subtitle: '#000000',
    inputBg: '#FFFFFF',
    inputBorder: 'rgba(0,0,0,0.18)',
    countryCode: 'rgba(0,0,0,0.84)',
    phoneText: '#000000',
    placeholder: 'rgba(0,0,0,0.42)',
  },
  dark: {
    background: '#0F0F10',
    backBtnBg: 'rgba(255,255,255,0.15)',
    backBtnBorder: 'rgba(255,255,255,0.15)',
    title: '#FFFFFF',
    subtitle: '#FFFFFF',
    inputBg: 'rgba(255,255,255,0.08)',
    inputBorder: 'rgba(255,255,255,0.18)',
    countryCode: 'rgba(255,255,255,0.9)',
    phoneText: '#FFFFFF',
    placeholder: 'rgba(255,255,255,0.4)',
  },
};

export default function EnterPhoneNumber({ navigation, route }: Props) {
  const styles = useStyles();
  const scale = useUiScale(CANVAS_W);
  const s = (n: number) => n * scale;
  const { isDark } = useTheme();
  const palette = isDark ? THEME.dark : THEME.light;

  const [country, setCountry] = useState(defaultCountry);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [requestOtp, { isLoading }] = useRequestOtpMutation();
  const [requestLinkOtp, { isLoading: linkLoading }] = useRequestLinkOtpMutation();
  // Signed in already means this is onboardings second identifier, which must
  // attach to the current account rather than resolve/create one of its own.
  const isLinking = Boolean(useAppSelector(state => state.auth.accessToken));
  const sending = isLoading || linkLoading;

  useEffect(() => {
    const iso2 = route.params?.selectedCountryIso2;
    if (!iso2) return;
    const found = countries.find(c => c.iso2 === iso2);
    if (found) setCountry(found);
  }, [route.params?.selectedCountryIso2]);

  const isValid = useMemo(() => {
    return TEN_DIGIT_PHONE_REGEX.test(phone);
  }, [phone]);

  const onChangePhone = (text: string) => {
    setError(undefined);
    setPhone(text.replace(/\D/g, '').slice(0, 10));
  };

  const onSendOtp = async () => {
    setError(undefined);

    if (!isValid || sending) {
      setError('Enter a valid 10 digit mobile number.');
      return;
    }

    const identifier = `${country.dialCode}${phone}`;

    try {
      const response = isLinking
        ? await requestLinkOtp({ identifier }).unwrap()
        : await requestOtp({ identifier }).unwrap();

      if (!response?.ok) {
        setError('Could not send verification code. Please try again.');
        return;
      }

      navigation.navigate('Otp', {
        destination: identifier,
        via: 'phone',
        flow: 'login',
        otpSessionId: response.otpSessionId,
        debugCode: response.debugCode,
        // A Google sign-up lands here before Personal Details — carry the
        // identity forward. Otp only needs these if it has to route into
        // PersonalDetails (nameless-account fallback); the normal link-verify
        // path completes without showing the details page again.
        prefillName: route.params?.googleName,
        prefillDob: route.params?.googleDob,
        prefillGender: route.params?.googleGender,
        prefillPhoto: route.params?.googlePhoto,
        showAccountVerified: route.params?.googleSignup,
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
        <View style={[styles.headerRow, { height: s(HEADER_H), paddingHorizontal: s(SCREEN_PADDING_H), gap: s(HEADER_TITLE_GAP) }]}>
          <Pressable
            onPress={() =>
              // EnterPhoneNumber is always reached via navigation.reset()
              // (Otp.tsx, right after the email OTP verifies), so the stack
              // never actually contains Login/ContinueWithEmail underneath
              // it — a plain navigate('ContinueWithEmail') would just push a
              // second copy on top, and *that* screen's own goBack() would
              // then land back here instead of on Login. Rebuild the real
              // history instead, so ContinueWithEmail's back button goes
              // where it normally would.
              navigation.reset({
                index: 1,
                routes: [{ name: 'Login' }, { name: 'ContinueWithEmail' }],
              })
            }
            hitSlop={8}
            style={{
              width: s(26),
              height: s(26),
              borderRadius: s(13),
              // Figma's back button (node 414:5237, "Ellipse 6"): a
              // translucent gray disc — same asset as Otp/PersonalDetails.
              backgroundColor: palette.backBtnBg,
              borderWidth: s(0.23),
              borderColor: palette.backBtnBorder,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isDark ? (
              <ArrowLeftWhiteIcon width={s(11.2071)} height={s(8.70711)} />
            ) : (
              <ArrowLeftSvg width={s(11.2071)} height={s(8.70711)} />
            )}
          </Pressable>
          <Text style={[styles.headerTitle, { fontSize: s(HEADER_TITLE_SIZE), color: palette.title }]}>
            Enter Phone Number
          </Text>
        </View>

        <Text
          style={[
            styles.subtitle,
            { marginTop: s(36), paddingHorizontal: s(SCREEN_PADDING_H), fontSize: s(FIELD_LABEL_SIZE), color: palette.subtitle },
          ]}
        >
          Verify your phone number
        </Text>

        <View style={[styles.phoneRow, { marginTop: s(20), paddingHorizontal: s(SCREEN_PADDING_H), gap: s(6) }]}>
          <Pressable
            style={[
              styles.countryPill,
              { width: s(58), height: s(PHONE_ROW_H), borderRadius: s(10), gap: s(4), backgroundColor: palette.inputBg, borderColor: palette.inputBorder },
            ]}
            onPress={() => navigation.navigate('CountryCode', { returnTo: 'EnterPhoneNumber' })}
          >
            <Text style={[styles.countryFlag, { fontSize: s(20) }]}>{getFlagEmoji(country.iso2)}</Text>
            {isDark ? (
              <DropdownArrowWhiteIcon
                width={s(4.10949)}
                height={s(5.27032)}
                style={{ transform: [{ rotate: '-90deg' }] }}
              />
            ) : (
              <DropdownArrowIcon
                width={s(4.10949)}
                height={s(5.27032)}
                style={{ transform: [{ rotate: '-90deg' }] }}
              />
            )}
          </Pressable>

          <View
            style={[
              styles.phoneInputWrap,
              { height: s(PHONE_ROW_H), borderRadius: s(10), paddingHorizontal: s(12), backgroundColor: palette.inputBg, borderColor: palette.inputBorder },
            ]}
          >
            <Text style={[styles.countryCode, { fontSize: s(16), marginRight: s(10), color: palette.countryCode }]}>
              {country.dialCode}
            </Text>
            <TextInput
              value={phone}
              onChangeText={onChangePhone}
              placeholder="Enter Phone Number"
              placeholderTextColor={palette.placeholder}
              keyboardType="number-pad"
              maxLength={10}
              style={[styles.phoneInput, { fontSize: s(16), color: palette.phoneText }]}
            />
            {!!phone && (
              <Pressable onPress={() => setPhone('')} hitSlop={8}>
                {isDark ? (
                  <CloseRoundFillWhiteIcon width={s(14)} height={s(14)} />
                ) : (
                  <CloseRoundFillIcon width={s(14)} height={s(14)} />
                )}
              </Pressable>
            )}
          </View>
        </View>

        {!!error && (
          <Text style={[styles.errorText, { marginTop: s(8), paddingHorizontal: s(SCREEN_PADDING_H), fontSize: s(12) }]}>
            {error}
          </Text>
        )}

        <View style={{ flex: 1, minHeight: s(24) }} />

        {/* ResponsiveScrollScreen's SafeAreaView already insets for the
            device's real bottom safe area — this only needs a small extra
            breathing-room gap beyond that, not Figma's mockup gap to its
            own fake home indicator (stacking both doubles the gap). */}
        <View style={[styles.bottomArea, { paddingHorizontal: s(SCREEN_PADDING_H), paddingBottom: s(BOTTOM_BUTTON_GAP) }]}>
          <Pressable
            onPress={onSendOtp}
            disabled={!isValid || sending}
            style={[
              styles.primaryBtn,
              {
                width: s(PRIMARY_BUTTON.width),
                maxWidth: '100%',
                minHeight: s(PRIMARY_BUTTON.minHeight),
                borderRadius: s(PRIMARY_BUTTON.radius),
              },
              (!isValid || sending) && styles.primaryBtnDisabled,
            ]}
          >
            <Text
              style={[
                styles.primaryBtnText,
                { fontSize: s(PRIMARY_BUTTON.fontSize) },
                (!isValid || sending) && styles.primaryBtnTextDisabled,
              ]}
            >
              {sending ? 'Sending...' : 'Send OTP'}
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

function createStyles(_scale: number) {
  // Nothing in this sheet is dimensional — every size on this screen is
  // applied inline through the component's own scaled s() helper.
  return StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
    },

    container: {
      flex: 1,
    },

    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    headerTitle: {
      fontFamily: 'Satoshi-Medium',
      color: '#000000',
    },

    subtitle: {
      // Figma (node 414:5239) positions this at left: calc(50% - 96.5px) with
      // a -translate-x-1/2 anchor — i.e. left-aligned to the same edge as the
      // header/phone row, not centered on the screen.
      alignSelf: 'flex-start',
      textAlign: 'left',
      fontFamily: 'Satoshi-Regular',
      color: '#000000',
    },

    phoneRow: {
      flexDirection: 'row',
    },

    countryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.18)',
      backgroundColor: '#FFFFFF',
    },

    countryFlag: {},

    phoneInputWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.18)',
      backgroundColor: '#FFFFFF',
    },

    countryCode: {
      fontFamily: 'Satoshi-Medium',
      color: 'rgba(0,0,0,0.84)',
    },

    phoneInput: {
      flex: 1,
      fontFamily: 'Satoshi-Medium',
      color: '#000000',
      padding: 0,
    },

    errorText: {
      color: '#EA8080',
      fontFamily: 'Satoshi-Medium',
    },

    bottomArea: {},

    primaryBtn: {
      alignSelf: 'center',
      backgroundColor: '#2362EB',
      alignItems: 'center',
      justifyContent: 'center',
    },

    primaryBtnDisabled: {
      backgroundColor: 'rgba(67,67,75,0.16)',
    },

    primaryBtnText: {
      color: '#FFFFFF',
      fontFamily: 'Satoshi-Medium',
    },

    primaryBtnTextDisabled: {
      // Figma (node 414:5249): deliberately near-invisible text on the
      // disabled state, not just a duller gray — a stronger "can't interact
      // with this yet" signal than the previous #999999 guess.
      color: '#F9F9F9',
    },
  });
}
