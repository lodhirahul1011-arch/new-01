import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  StatusBar,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import OtpInput from '../../../components/ui/OtpInput';
import ResponsiveScrollScreen from '../../../components/layout/ResponsiveScrollScreen';
import {
  authApi,
  useDeviceRegistrationVerifyOtpMutation,
  useLazyLinkedDevicesSummaryQuery,
  useRequestLinkOtpMutation,
  useRequestWhatsappOtpMutation,
  useResendOtpMutation,
  useVerifyLinkOtpMutation,
  type AuthUser,
  useVerifyOtpMutation,
} from '../../../services/api/authApi';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { authActions } from '../../../store/slices/authSlice';
import { setTokens } from '../../../services/storage/tokenStorage';
import { getAuthUserId, setCurrentUserId } from '../../../services/storage/sessionStorage';
import { syncPushTokenWithAccessToken } from '../../../services/notifications/pushNotifications';
import { logs } from '../../../services/logs';
import ArrowLeftSvg from '../../../assets/icons/common/arrow-back-otp.svg';
import ArrowLeftWhiteIcon from '../../../assets/icons/common/arrow-back-otp-white.svg';
import {
  SCREEN_PADDING_H,
  HEADER_TITLE_SIZE,
  HEADER_TITLE_GAP,
} from '../../../theme/metrics';
import { useTheme } from '../../../theme/ThemeContext';
import DarkGlow from '../../../components/ui/DarkGlow';
import CloseXIcon from '../../../assets/icons/common/close-x-light.svg';
import CloseXWhiteIcon from '../../../assets/icons/common/close-x-white.svg';
import { useUiScale } from '../../../theme/responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'Otp'>;

function maskDestination(destination?: string) {
  if (!destination) return '';

  if (destination.includes('@')) {
    const [user, domain] = destination.split('@');
    if (!user) return destination;
    const maskedUser =
      user.length <= 2
        ? `${user[0]}*`
        : user.slice(0, 2) + '*'.repeat(user.length - 2);
    return `${maskedUser}@${domain}`;
  }

  const digits = destination.replace(/\D/g, '');
  if (digits.length < 6) return destination;

  const country = digits.slice(0, 2);
  const rest = digits.slice(2);
  // Figma masks the phone number on the OTP screen — keep only the last 4
  // digits visible (standard verification-code masking convention).
  const masked =
    rest.length > 4 ? '*'.repeat(rest.length - 4) + rest.slice(-4) : rest;
  return `+${country} ${masked}`;
}

// Every number below is copied 1:1 from the Figma frame (fileKey
// 0ZAjL8CnVgprbKaBMIjUqJ, "OTP Fetch 1" node 49:431 / "Wrong OTP" node
// 73:847), a 360x812 canvas, scaled by a single width-based factor — same
// technique as Login/Onboarding/Splash.
const CANVAS_W = 360;
const HEADER_TOP = 28; // 72 (Figma) - 44 (its status-bar mockup already covered by SafeAreaView)
const HEADER_H = 26;

const THEME = {
  light: {
    background: '#F2F2F2',
    backBtnBg: 'rgba(217,217,217,0.46)',
    backBtnBorder: 'rgba(0,0,0,0.15)',
    title: '#000000',
    subtitle: '#1E1E1E',
    phoneText: 'rgba(13,13,13,0.89)',
    hintText: 'rgba(35,98,235,0.67)',
    resendLabel: 'rgba(30,30,30,0.9)',
    resendTimer: 'rgba(51,51,51,0.56)',
    closeBtnBg: '#FFFFFF',
    sheetBg: '#FFFFFF',
    sheetTitle: '#333333',
    sheetDivider: 'rgba(0,0,0,0.08)',
    whatsappBorder: 'rgba(0,0,0,0.25)',
    whatsappText: 'rgba(51,51,51,0.73)',
    whatsappNotice: 'rgba(51,51,51,0.6)',
  },
  dark: {
    background: '#0F0F10',
    backBtnBg: 'rgba(255,255,255,0.15)',
    backBtnBorder: 'rgba(255,255,255,0.15)',
    title: '#FFFFFF',
    subtitle: 'rgba(255,255,255,0.94)',
    phoneText: '#FFFFFF',
    hintText: '#6B9CF7',
    resendLabel: 'rgba(255,255,255,0.85)',
    resendTimer: 'rgba(255,255,255,0.5)',
    closeBtnBg: '#232324',
    sheetBg: '#1A1A1B',
    sheetTitle: 'rgba(255,255,255,0.7)',
    sheetDivider: 'rgba(255,255,255,0.12)',
    whatsappBorder: 'rgba(255,255,255,0.2)',
    whatsappText: 'rgba(255,255,255,0.8)',
    whatsappNotice: 'rgba(255,255,255,0.55)',
  },
};

export default function Otp({ navigation, route }: Props) {
  const styles = useStyles();
  const scale = useUiScale(CANVAS_W);
  const s = (n: number) => n * scale;
  const { isDark } = useTheme();
  const palette = isDark ? THEME.dark : THEME.light;
  const dispatch = useAppDispatch();

  const destination = route.params?.destination ?? '';
  const flow = route.params?.flow ?? 'login';
  const [otpSessionId, setOtpSessionId] = useState(route.params?.otpSessionId);
  const otpLength = route.params?.otpLength === 6 ? 6 : 4;

  // Dev-only convenience: the backend only ever returns debugCode when its
  // OTP_EXPOSE_CODE_IN_RESPONSE flag is on (never in production), so this is
  // a no-op unless that's explicitly enabled — pre-fills the code so testing
  // doesn't require a real SMS/email provider or manually checking server
  // logs. The existing auto-submit-on-complete effect below takes it from here.
  const [code, setCode] = useState(() => {
    const initialDebugCode = route.params?.debugCode;
    return __DEV__ && initialDebugCode?.length === otpLength ? initialDebugCode : '';
  });
  const [codeTouched, setCodeTouched] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [whatsappNotice, setWhatsappNotice] = useState<string | undefined>();

  const [verifyLoginOtp, { isLoading: loginLoading }] = useVerifyOtpMutation();
  const [verifySignupOtp, { isLoading: signupLoading }] =
    useDeviceRegistrationVerifyOtpMutation();
  const [verifyLinkOtp, { isLoading: linkLoading }] = useVerifyLinkOtpMutation();
  const [resendOtp, { isLoading: resendLoading }] = useResendOtpMutation();
  const [requestLinkOtp, { isLoading: relinkLoading }] = useRequestLinkOtpMutation();
  const [requestWhatsappOtp, { isLoading: whatsappLoading }] =
    useRequestWhatsappOtpMutation();
  const [triggerLinkedDevicesSummary] = useLazyLinkedDevicesSummaryQuery();

  // Signed in already means this OTP is the second identifier of onboarding,
  // not a sign-in — see onVerify.
  const isLinking = Boolean(useAppSelector(state => state.auth.accessToken));

  const verifying = loginLoading || signupLoading || linkLoading;
  const canSubmit = code.length === otpLength && !verifying;

  useEffect(() => {
    setSecondsLeft(30);
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft(value => value - 1), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  // OTP autofill used to read the inbox through READ_SMS. That permission was
  // removed to satisfy Google Play's "Permissions and APIs that Access Sensitive
  // Information" policy, so the code is now entered by hand — Android's keyboard
  // still offers the incoming code as a suggestion, which needs no permission.
  // Auto-submit below still fires as soon as all digits are present.

  const otpErrorText = (() => {
    if (err) return err;
    if (!codeTouched) return undefined;
    if (!code) return 'OTP is required.';
    if (code.length !== otpLength) return `Please enter ${otpLength} digit code.`;
    return undefined;
  })();

  // Onboarding needs BOTH identifiers verified before it can collect personal
  // details, and the two entry points are mirror images:
  //
  //   email first -> verify email -> verify phone -> Personal Details
  //   phone first -> verify phone -> verify email -> Personal Details
  //
  // Both legs belong to SIGN-UP only. `name` is what separates the two cases:
  // Personal Details is onboarding's last step and the only thing that sets a
  // name, so a named account has finished — whatever rules applied when it did
  // — and must drop straight through to the app. Without that guard every
  // established phone-only account gets asked for an email forever, because
  // the phone sign-in path stores `phone` and leaves `email` unset entirely.
  const routeAfterVerification = async (user: AuthUser) => {
    if (!user?.name) {
      // Presence, not the verified flag, decides which leg still has to run:
      // these screens exist to COLLECT the missing identifier, and whatever
      // they collect is OTP-verified on the way in.
      if (!user?.phone) {
        // Figma's "Enter Phone number when Email" screen (node 414:5219).
        navigation.reset({ index: 0, routes: [{ name: 'EnterPhoneNumber' }] });
        return;
      }

      if (!user?.email) {
        navigation.reset({ index: 0, routes: [{ name: 'ContinueWithEmail' }] });
        return;
      }

      navigation.reset({ index: 0, routes: [{ name: 'PersonalDetails' }] });
      return;
    }

    const linked = await triggerLinkedDevicesSummary().unwrap();
    const total = linked?.data?.summary?.total ?? 0;

    if (total <= 0) {
      navigation.reset({ index: 0, routes: [{ name: 'RequestPermissions' }] });
      return;
    }

    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  const onVerify = async () => {
    setCodeTouched(true);
    setErr(undefined);

    if (!code) {
      setErr('OTP is required.');
      return;
    }

    if (code.length !== otpLength) {
      setErr(`Please enter ${otpLength} digit code.`);
      return;
    }

    try {
      const payload = {
        identifier: destination,
        code,
        ...(otpSessionId ? { otpSessionId } : {}),
      };

      // Already signed in means this is the SECOND identifier of onboarding —
      // the email leg of a phone signup, or the phone leg of an email one. That
      // goes to link-identifier, which attaches it to the current account.
      // verify-otp would instead look the identifier up, find nothing, and
      // create a duplicate account with the first one orphaned.
      if (isLinking) {
        const linked = await verifyLinkOtp(payload).unwrap();
        dispatch(authActions.userUpdated(linked.user));
        await routeAfterVerification(linked.user);
        return;
      }

      const response =
        flow === 'signup'
          ? await verifySignupOtp(payload).unwrap()
          : await verifyLoginOtp(payload).unwrap();

      await setTokens(response.accessToken, response.refreshToken);
      await setCurrentUserId(getAuthUserId(response.user));
      dispatch(authApi.util.resetApiState());
      dispatch(
        authActions.signedIn({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          user: response.user,
        }),
      );

      syncPushTokenWithAccessToken(response.accessToken, 'otp_signed_in').catch(error => {
        logs.error('[notifications] login token sync failed', String(error));
      });

      await routeAfterVerification(response.user);
    } catch (error: any) {
      setErr(error?.data?.message || 'The OTP entered is invalid/incorrect. Please try again.');
    }
  };

  // Figma's OTP screen (every state — empty, filled, error) has no submit
  // button at all, only the 4 boxes: the code verifies itself the instant
  // it's complete, whether typed manually or filled by SMS autofill above.
  const autoSubmittedCodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (canSubmit && autoSubmittedCodeRef.current !== code) {
      autoSubmittedCodeRef.current = code;
      onVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSubmit, code]);

  const onResend = async () => {
    try {
      // A link code lives under its own OTP purpose behind an authenticated
      // endpoint; the public resend route only knows login/register codes, so
      // re-requesting is what issues a fresh one for this leg.
      const response = isLinking
        ? await requestLinkOtp({ identifier: destination }).unwrap()
        : await resendOtp({
            identifier: destination,
            purpose: flow === 'signup' ? 'register' : 'login',
          }).unwrap();
      setOtpSessionId(response.otpSessionId);
      setSecondsLeft(30);
      setCode(__DEV__ && response.debugCode?.length === otpLength ? response.debugCode : '');
      setErr(undefined);
      // A fresh code may coincidentally match the last (failed) one typed —
      // clear the auto-submit guard so it isn't silently blocked from
      // re-triggering.
      autoSubmittedCodeRef.current = null;
    } catch (error: any) {
      setErr(error?.data?.message || 'Could not resend OTP');
    }
  };

  // "Send OTP on Whatsapp" (Figma node 73:380) flips the pending OTP's
  // delivery channel to WhatsApp: /auth/whatsapp-otp re-uses or re-issues the
  // code for the same purpose and pushes it through the WhatsApp Cloud API.
  // The Otp doc's channel becomes 'whatsapp', so later Resend taps stay on
  // WhatsApp too. Fails with PHONE_INVALID for email destinations, which the
  // row below hides anyway.
  const onSendWhatsappOtp = async () => {
    if (whatsappLoading) return;
    setErr(undefined);
    try {
      const response = await requestWhatsappOtp({
        identifier: destination,
        purpose: isLinking ? 'link_identifier' : flow === 'signup' ? 'register' : 'login',
      }).unwrap();
      setOtpSessionId(response.otpSessionId);
      // A channel switch delivers a brand-new code: drop the old one (and any
      // dev debugCode prefill), rearm auto-submit, and restart the cooldown.
      setCode('');
      setCodeTouched(false);
      autoSubmittedCodeRef.current = null;
      setSecondsLeft(30);
      setWhatsappNotice(undefined);
      setMoreOptionsOpen(false);
    } catch (error: any) {
      setWhatsappNotice(error?.data?.message || 'Could not send OTP on WhatsApp');
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
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={{
              width: s(26),
              height: s(26),
              borderRadius: s(13),
              // Figma's back button (node 100:95, "Ellipse 6"): a translucent
              // gray disc, not a flat opaque fill — matches the design exactly
              // instead of the earlier flat #F2F2F2 approximation.
              backgroundColor: palette.backBtnBg,
              borderWidth: s(0.23),
              borderColor: palette.backBtnBorder,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Exact Figma arrow asset (node 100:95, "Vector 9") at its
                native aspect ratio — a filled chevron+shaft path, not the
                generic two-stroke arrow used elsewhere in the app. */}
            {isDark ? (
              <ArrowLeftWhiteIcon width={s(11.2071)} height={s(8.70711)} />
            ) : (
              <ArrowLeftSvg width={s(11.2071)} height={s(8.70711)} />
            )}
          </Pressable>
          <Text style={[styles.topBarTitle, { fontSize: s(HEADER_TITLE_SIZE), color: palette.title }]}>
            OTP verification
          </Text>
        </View>

        <View style={[styles.content, { paddingHorizontal: s(SCREEN_PADDING_H) }]}>
          <Text
            style={[
              styles.subtitle,
              { marginTop: s(151 - HEADER_TOP - HEADER_H), fontSize: s(14), lineHeight: s(20), color: palette.subtitle },
            ]}
          >
            We have sent a verification code to{'\n'}
            <Text style={[styles.phoneText, { fontSize: s(14), lineHeight: s(20), color: palette.phoneText }]}>
              {maskDestination(destination)}
            </Text>
          </Text>

          <View style={[styles.otpWrap, { marginTop: s(16) }]}>
            <OtpInput
              length={otpLength}
              value={code}
              onChange={value => {
                setCode(value);
                setCodeTouched(true);
                setErr(undefined);
              }}
              errorText={otpErrorText}
              activeColor="#2362EB"
              scale={scale}
              dark={isDark}
            />
          </View>

          {!otpErrorText && verifying && (
            <Text style={[styles.hintText, { marginTop: s(17), fontSize: s(12), color: palette.hintText }]}>
              Verifying...
            </Text>
          )}

          <View style={[styles.resendRow, { marginTop: s(11) }]}>
            <Text style={[styles.resendLabel, { fontSize: s(13), color: palette.resendLabel }]}>
              Didn't get the OTP?{' '}
            </Text>
            {secondsLeft === 0 ? (
              <Pressable onPress={onResend}>
                <Text style={[styles.resendLink, { fontSize: s(15) }]}>
                  {resendLoading || relinkLoading ? 'Sending...' : 'Resend OTP'}
                </Text>
              </Pressable>
            ) : (
              <Text style={[styles.resendTimer, { fontSize: s(13), color: palette.resendTimer }]}>
                Resend OTP in {secondsLeft}s
              </Text>
            )}
          </View>

          <Pressable
            onPress={() => setMoreOptionsOpen(true)}
            style={{ marginTop: s(12) }}
          >
            <Text style={[styles.tryMoreOptionsText, { fontSize: s(13) }]}>Try more options</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, minHeight: s(24) }} />

        <Pressable
          onPress={() => navigation.replace('Login')}
          style={{ alignSelf: 'center', marginBottom: s(812 - 741.5) }}
        >
          <Text style={[styles.backToMethodsText, { fontSize: s(14) }]}>
            Go back to login methods
          </Text>
        </Pressable>

        {moreOptionsOpen && (
          // Figma's "Methods For Otp" bottom sheet (node 73:380) — a slide-up
          // panel offering an alternate delivery channel. Whatsapp is the
          // only option Figma shows here; tapping it switches the pending
          // OTP's delivery to WhatsApp via /auth/whatsapp-otp.
          <View style={styles.moreOptionsBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                setMoreOptionsOpen(false);
                setWhatsappNotice(undefined);
              }}
            />

            <View style={[styles.moreOptionsCloseWrap, { bottom: s(812 - 666) }]}>
              <Pressable
                onPress={() => {
                  setMoreOptionsOpen(false);
                  setWhatsappNotice(undefined);
                }}
                hitSlop={8}
                style={[
                  styles.moreOptionsCloseBtn,
                  { width: s(35), height: s(35), borderRadius: s(17.5), backgroundColor: palette.closeBtnBg },
                ]}
              >
                {isDark ? <CloseXWhiteIcon width={s(13)} height={s(13)} /> : <CloseXIcon width={s(13)} height={s(13)} />}
              </Pressable>
            </View>

            <View
              style={[
                styles.moreOptionsSheet,
                { height: s(113), borderTopLeftRadius: s(10), borderTopRightRadius: s(10), paddingHorizontal: s(19), backgroundColor: palette.sheetBg },
              ]}
            >
              <Text style={[styles.moreOptionsTitle, { marginTop: s(712 - 699), fontSize: s(12), color: palette.sheetTitle }]}>
                More Options
              </Text>

              <View
                style={[
                  styles.moreOptionsDivider,
                  { marginTop: s(734 - 712 - 12), marginHorizontal: -s(19), backgroundColor: palette.sheetDivider },
                ]}
              />

              {!destination.includes('@') && (
                <Pressable
                  onPress={onSendWhatsappOtp}
                  disabled={whatsappLoading}
                  style={[
                    styles.whatsappRow,
                    { marginTop: s(746 - 734), height: s(30), borderRadius: s(5), paddingHorizontal: s(11), gap: s(8), borderColor: palette.whatsappBorder },
                  ]}
                >
                  <Image
                    source={require('../../../assets/icons/common/whatsapp.png')}
                    style={{ width: s(17), height: s(17) }}
                    resizeMode="contain"
                  />
                  <Text style={[styles.whatsappText, { fontSize: s(12), color: palette.whatsappText }]}>
                    {whatsappLoading ? 'Sending...' : 'Send OTP on Whatsapp'}
                  </Text>
                </Pressable>
              )}

              {!!whatsappNotice && (
                <Text style={[styles.whatsappNoticeText, { marginTop: s(6), fontSize: s(10), color: palette.whatsappNotice }]}>
                  {whatsappNotice}
                </Text>
              )}
            </View>
          </View>
        )}
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
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    topBarTitle: {
      fontFamily: 'Satoshi-Medium',
      color: '#000000',
    },
    content: {
      alignItems: 'center',
    },
    subtitle: {
      fontFamily: 'Satoshi-Regular',
      textAlign: 'center',
      color: '#1E1E1E',
    },
    phoneText: {
      fontFamily: 'Satoshi-Medium',
      color: 'rgba(13,13,13,0.89)',
    },
    otpWrap: {
      width: '100%',
    },
    hintText: {
      fontFamily: 'Satoshi-Regular',
      color: 'rgba(35,98,235,0.67)',
      textAlign: 'center',
    },
    resendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
    },
    resendLabel: {
      fontFamily: 'Satoshi-Regular',
      color: 'rgba(30,30,30,0.9)',
    },
    resendLink: {
      fontFamily: 'Satoshi-Regular',
      color: '#2362EB',
    },
    resendTimer: {
      fontFamily: 'Satoshi-Regular',
      color: 'rgba(51,51,51,0.56)',
    },
    tryMoreOptionsText: {
      fontFamily: 'Satoshi-Regular',
      color: '#2362EB',
    },
    backToMethodsText: {
      fontFamily: 'Satoshi-Regular',
      color: '#2362EB',
    },

    moreOptionsBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },

    moreOptionsCloseWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
    },

    moreOptionsCloseBtn: {
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },

    moreOptionsSheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#FFFFFF',
    },

    moreOptionsTitle: {
      fontFamily: 'Satoshi-Regular',
      color: '#333333',
    },

    moreOptionsDivider: {
      height: s(1),
      backgroundColor: 'rgba(0,0,0,0.08)',
    },

    whatsappRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 0.45,
      borderColor: 'rgba(0,0,0,0.25)',
    },

    whatsappText: {
      fontFamily: 'Satoshi-Regular',
      color: 'rgba(51,51,51,0.73)',
    },

    whatsappNoticeText: {
      fontFamily: 'Satoshi-Regular',
      color: 'rgba(51,51,51,0.6)',
      textAlign: 'center',
    },
  });
}
