import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Keyboard,
  Linking,
  Platform,
  Image,
  ScrollView,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
  StatusBar,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import {
  authApi,
  useLazyLinkedDevicesSummaryQuery,
  useGoogleSignInMutation,
  useRequestOtpMutation,
} from '../../../services/api/authApi';
import { useAppDispatch } from '../../../store/hooks';
import { authActions } from '../../../store/slices/authSlice';
import { setTokens } from '../../../services/storage/tokenStorage';
import { getAuthUserId, setCurrentUserId } from '../../../services/storage/sessionStorage';
import { syncPushTokenWithAccessToken } from '../../../services/notifications/pushNotifications';
import { logs } from '../../../services/logs';
import { countries, defaultCountry, getFlagEmoji } from '../data/countries';
import { SCREEN_PADDING_H, PRIMARY_BUTTON } from '../../../theme/metrics';
import { useTheme } from '../../../theme/ThemeContext';
import DarkGlow from '../../../components/ui/DarkGlow';
import DropdownArrowIcon from '../../../assets/icons/common/dropdown-arrow.svg';
import DropdownArrowWhiteIcon from '../../../assets/icons/common/dropdown-arrow-white.svg';
import CheckboxTickIcon from '../../../assets/icons/common/checkbox-tick.svg';
import EmailIcon from '../../../assets/icons/common/email-filled.svg';
import CloseRoundFillIcon from '../../../assets/icons/common/close-round-fill.svg';
import CloseRoundFillWhiteIcon from '../../../assets/icons/common/close-round-fill-white.svg';
import { useUiScale } from '../../../theme/responsive';
import {
  CONTENT_POLICY_URL,
  PRIVACY_POLICY_URL,
  TERMS_CONDITIONS_URL,
} from '../../../config/env';

// Same 4 photos used in the onboarding carousel — reused here for the
// Login hero's rotating banner (fileKey 0ZAjL8CnVgprbKaBMIjUqJ dropdown
// arrow: node 100:382).
const HERO_IMAGES = [
  require('../../../assets/images/onboarding/onboarding1.jpg'),
  require('../../../assets/images/onboarding/onboarding2.jpg'),
  require('../../../assets/images/onboarding/onboarding3.jpg'),
  require('../../../assets/images/onboarding/onboarding4.jpg'),
];

// Natural height/width of each hero photo, read straight off the bundled
// asset. The hero box is the full window (~0.46 aspect) but the photos are
// ~0.78, so neither resizeMode gives the right result on its own: `cover`
// scales them until their height fills the box and crops ~40% off the width,
// and `contain` centres them, leaving a large empty band above the photo.
// Giving each image its OWN true height instead means it draws full-width,
// uncropped, flush with the top of the box — the leftover height falls below
// it, where the card sits.
const HERO_ASPECTS = HERO_IMAGES.map(src => {
  const meta = Image.resolveAssetSource(src);
  return meta && meta.width ? meta.height / meta.width : 1423 / 1105;
});

const HERO_AUTO_SCROLL_MS = 3000;

async function openLegalDocument(label: string, url: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error('URL is not supported by this device');
    await Linking.openURL(url);
  } catch (error) {
    logs.error('[login] legal link failed', { label, url, error: String(error) });
    Alert.alert('Unable to open link', 'Please try again later.');
  }
}

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

// The web client id pairs with the backend's GOOGLE_WEB_CLIENT_ID — its
// audience check accepts tokens minted for this exact client, so the two
// configs must move together.
const GOOGLE_WEB_CLIENT_ID =
  '822625137979-dpgm251kc70m3j3lh5gbkgk45foe9uob.apps.googleusercontent.com';

let googleSignInConfigured = false;
function ensureGoogleSignInConfigured() {
  if (googleSignInConfigured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  googleSignInConfigured = true;
}

// Web-based Google OAuth (AppAuth). Native GoogleSignin caches the user's
// consent, so after the first sign-in the "Confirm your choices" screen
// never appears again and DOB/birthday scopes can't be (re)prompted. The
// web flow with `prompt: 'consent'` forces Google's consent form (with
// Allow/Cancel) on EVERY sign-in, and `select_account` always shows the
// account picker — matching the old app's behaviour exactly.
// AppAuth (Custom Tab) flow uses the ANDROID OAuth client from Google
// Cloud — not the Web client. Its redirect scheme is fixed by Google:
// (AppAuth-Android's README-Google pattern). Using the web client here
// made Google reject the redirect and the consent screen never appeared.
  // Provider-specific query params go through additionalParameters — a
  // top-level `prompt` key is ignored by react-native-app-auth. The library
  // types only allow a single prompt value, but Google accepts the
  // space-separated pair, so the whole config is cast loosely below.

// Warm the auth session in advance so the Custom Tab opens instantly. The
// `as any` sidesteps the library's narrow prompt-type (it permits one value;
// Google accepts the space-separated 'consent select_account' pair).

const INDIA_PHONE_REGEX = /^[6-9]\d{9}$/;
const GENERIC_PHONE_REGEX = /^\d{6,14}$/;

// Every number below is copied 1:1 from the Figma frame (fileKey
// 0ZAjL8CnVgprbKaBMIjUqJ, "Login Screen", node 100:330), a 360x812 canvas,
// scaled by a single width-based factor — same technique as Onboarding.tsx.
//
// The frame's hero/card split (a 513-tall hero with the card budgeted from
// what was left) is deliberately NOT reproduced: the hero is now full-bleed
// and the card floats over it at its own content height, so there is no
// height to divide up.
const CANVAS_W = 360;
// Figma's phone-input row is only 28 units tall — too small to comfortably
// read or tap on a real device, so it is bumped up to this.
const PHONE_ROW_H = 48;

// Dark-mode values follow the same rule confirmed against Figma's dark-mode
// page for Splash/Onboarding: white → #0F0F10, dark text → white, light-gray
// surfaces → translucent white overlays, brand blue/dots unchanged.
const THEME = {
  light: {
    background: '#FFFFFF',
    title: '#1E1E1E',
    inputBg: '#FFFFFF',
    inputBorder: 'rgba(0,0,0,0.18)',
    countryCode: 'rgba(0,0,0,0.84)',
    phoneText: '#000000',
    placeholder: '#999999',
    rememberText: 'rgba(0,0,0,0.76)',
    socialBtnBg: '#D9D9D9',
    legalText: '#333333',
    sendingBg: 'rgba(255,255,255,0.92)',
    sendingBorder: 'rgba(255,255,255,0.47)',
    sendingText: 'rgba(40,40,40,0.77)',
    sendingSpinner: '#666666',
  },
  dark: {
    background: '#0F0F10',
    title: 'rgba(255,255,255,0.94)',
    inputBg: 'rgba(255,255,255,0.08)',
    inputBorder: 'rgba(255,255,255,0.18)',
    countryCode: 'rgba(255,255,255,0.9)',
    phoneText: '#FFFFFF',
    placeholder: 'rgba(255,255,255,0.4)',
    rememberText: 'rgba(255,255,255,0.8)',
    socialBtnBg: 'rgba(255,255,255,0.14)',
    legalText: 'rgba(255,255,255,0.75)',
    sendingBg: 'rgba(24,24,26,0.94)',
    sendingBorder: 'rgba(255,255,255,0.15)',
    sendingText: 'rgba(255,255,255,0.85)',
    sendingSpinner: '#CCCCCC',
  },
};

export default function Login({ navigation, route }: Props) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const palette = isDark ? THEME.dark : THEME.light;
  const insets = useSafeAreaInsets();
  // Card text/buttons/spacing always scale off width alone, so they stay a
  // normal, comfortable size regardless of the device's aspect ratio — only
  // the hero image (below) flexes to soak up whatever height is actually
  // available, since a photo can shrink or grow without looking broken the
  // way shrunken buttons/text would.
  const scale = useUiScale(CANVAS_W);
  const s = (n: number) => n * scale;

  // Measured, not derived: the card is shorter while the keyboard is up (the
  // secondary rows unmount), and the carousel dots have to sit just above
  // whatever height it currently has.
  const [cardHeight, setCardHeight] = useState(0);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardOpen = keyboardHeight > 0;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, e =>
      setKeyboardHeight(e.endCoordinates?.height ?? 0),
    );
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // The manifest sets adjustResize, so on Android the window itself shrinks
  // and `bottom: 0` already clears the keyboard. iOS keeps the window at full
  // height, so there the card has to be lifted by the keyboard's own height.
  const cardBottom = Platform.OS === 'ios' ? keyboardHeight : 0;

  const [country, setCountry] = useState(defaultCountry);
  const [phone, setPhone] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const [requestOtp, { isLoading }] = useRequestOtpMutation();
  const [googleSignIn] = useGoogleSignInMutation();
  const [triggerLinkedDevicesSummary] = useLazyLinkedDevicesSummaryQuery();
  const dispatch = useAppDispatch();
  const [googleBusy, setGoogleBusy] = useState(false);

  // Google sign-in runs in two steps so nothing happens silently: step 1
  // only PICKS the Google account (no token exchange, no backend call),
  // then an in-app confirm sheet — the mirror of Google's web "You're
  // signing back in to …" page, which the native SDK never shows — asks
  // Continue/Cancel. Only Continue runs step 2, the real sign-in + login.
  const [googleConfirm, setGoogleConfirm] = useState<{ idToken: string; name: string; email: string; photo: string } | null>(null);

  const [heroIndex, setHeroIndex] = useState(0);
  const heroIndexRef = useRef(0);
  const heroScrollRef = useRef<ScrollView>(null);
  const heroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Drives the active dot's fill (0 → 1 over HERO_AUTO_SCROLL_MS) — the dot
  // doubles as the auto-scroll countdown, same as the onboarding carousel.
  const heroDotProgress = useRef(new Animated.Value(0)).current;

  // Restarts the auto-scroll countdown from `fromIndex` — called on mount
  // and after every move (auto or manual swipe), so a manual swipe never
  // gets immediately overridden by a stale timer.
  const startHeroAutoScroll = (fromIndex: number) => {
    if (heroTimerRef.current) clearTimeout(heroTimerRef.current);
    heroIndexRef.current = fromIndex;

    heroDotProgress.setValue(0);
    Animated.timing(heroDotProgress, {
      toValue: 1,
      duration: HERO_AUTO_SCROLL_MS,
      easing: Easing.linear,
      useNativeDriver: false, // animating width, not eligible for the native driver
    }).start();

    heroTimerRef.current = setTimeout(() => {
      const next = (heroIndexRef.current + 1) % HERO_IMAGES.length;
      heroScrollRef.current?.scrollTo({ x: next * width, animated: true });
      setHeroIndex(next);
      startHeroAutoScroll(next);
    }, HERO_AUTO_SCROLL_MS);
  };

  useEffect(() => {
    // Hold the carousel while the keyboard is up. The dots are hidden then
    // anyway, so this costs nothing visually — but it matters a lot for
    // smoothness: the active dot's fill animates a PERCENTAGE width, which the
    // native driver cannot handle, so every frame of the 3s countdown is
    // computed in JS and pushed over the bridge. Left running, it competed
    // with the keyboard's own transition for the JS thread, which is what made
    // opening the keyboard stutter. Leaving `keyboardOpen` in the deps means
    // the cleanup below fires as the keyboard opens, and the countdown starts
    // fresh when it closes.
    if (keyboardOpen) return;

    startHeroAutoScroll(heroIndexRef.current);
    return () => {
      if (heroTimerRef.current) clearTimeout(heroTimerRef.current);
      heroDotProgress.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, keyboardOpen]);

  // Built once per width, not per render. Android's adjustResize changes the
  // window height on every frame of the keyboard animation, and the hooks above
  // re-render this screen each time; without this the four photos would be
  // rebuilt with fresh style objects on every one of those frames, forcing
  // React to re-render and re-measure four full-screen images mid-transition.
  // Only `width` actually affects them, and `width` does not change.
  const heroSlides = useMemo(
    () =>
      HERO_IMAGES.map((src, i) => (
        <Image
          key={i}
          source={src}
          // Full width at the photo's own aspect ratio, so the box and the
          // image agree and nothing is cropped or letterboxed. See HERO_ASPECTS.
          style={{ width, height: width * HERO_ASPECTS[i] }}
          resizeMode="cover"
        />
      )),
    [width],
  );

  // User can also swipe the photos manually — pause the timer/fill while
  // dragging so it doesn't fight the gesture, then resync to wherever they
  // land and restart the countdown from there.
  const handleHeroScrollBeginDrag = () => {
    if (heroTimerRef.current) clearTimeout(heroTimerRef.current);
    heroDotProgress.stopAnimation();
  };

  const handleHeroMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const raw = Math.round(e.nativeEvent.contentOffset.x / width);
    const clamped = Math.max(0, Math.min(raw, HERO_IMAGES.length - 1));
    if (clamped !== heroIndexRef.current) setHeroIndex(clamped);
    startHeroAutoScroll(clamped);
  };

  useEffect(() => {
    const iso2 = route.params?.selectedCountryIso2;
    if (!iso2) return;
    const found = countries.find(c => c.iso2 === iso2);
    if (found) setCountry(found);
  }, [route.params?.selectedCountryIso2]);

  const isValid = useMemo(() => {
    const regex = country.iso2 === 'IN' ? INDIA_PHONE_REGEX : GENERIC_PHONE_REGEX;
    return regex.test(phone);
  }, [phone, country]);

  const onChangePhone = (text: string) => {
    setError(undefined);
    const cleaned = text.replace(/\D/g, '').slice(0, 14);
    setPhone(cleaned);
    // A standard mobile number is 10 digits — once that many are entered,
    // there's nothing more to type, so drop the keyboard automatically
    // instead of making the user dismiss it themselves.
    if (cleaned.length === 10) {
      Keyboard.dismiss();
    }
  };

  const onContinue = async () => {
    setError(undefined);

    if (!isValid || isLoading) {
      setError('Enter a valid mobile number.');
      return;
    }

    const identifier = `${country.dialCode}${phone}`;

    try {
      const response = await requestOtp({ identifier }).unwrap();

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
      });
    } catch (err: any) {
      const apiMessage =
        err?.data?.message || err?.error || 'Something went wrong. Please try again.';
      setError(apiMessage);
    }
  };

  // Google sign-up/sign-in. Google only ever returns an email identity —
  // never a phone number — so a fresh Google account has to end the same
  // place a fresh email sign-up does: Personal Details (the DOB/gender page)
  // to collect name extras, then the phone-verification leg. The Google
  // profile's name/photo ride along as prefills for those screens.
  //
  // The backend's /auth/google accepts the idToken, verifies it against
  // GOOGLE_WEB_CLIENT_ID, and returns tokens for existing accounts; for a
  // new one it just creates the user (verified, email-only). Either way the
  // route below depends on the *account shape*, not the isNewUser flag: an
  // account without a phone number still owes the phone-verification leg,
  // no matter how it was created.
  // STEP 1 — pick the account only. Nothing is signed in yet: the idToken is
  // parked in memory and an in-app confirm sheet — the mirror of Google's
  // web "You're signing back in to …" page, which the native SDK never
  // shows — asks Continue/Cancel before any login happens.
  // Native Google account picker: only profile, email, and an ID token are
  // requested. DOB and gender are collected in PersonalDetails instead.
  const handleGoogleSignIn = async () => {
    if (googleBusy) return;
    setError(undefined);
    setGoogleBusy(true);
    try {
      ensureGoogleSignInConfigured();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return;

      const idToken = response.data?.idToken;
      const googleName = response.data?.user?.name || '';
      const googleEmail = response.data?.user?.email || '';
      const googlePhoto = response.data?.user?.photo || '';
      if (!idToken || !googleEmail) {
        setError('Google did not return a valid account.');
        return;
      }

      const auth = await googleSignIn({ idToken }).unwrap();
      await setTokens(auth.accessToken, auth.refreshToken);
      await setCurrentUserId(getAuthUserId(auth.user));
      dispatch(authApi.util.resetApiState());
      dispatch(authActions.signedIn({ accessToken: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user }));
      syncPushTokenWithAccessToken(auth.accessToken, 'google_signed_in').catch(error =>
        logs.error('[notifications] google login token sync failed', String(error)),
      );

      const needsPhone = !auth.user?.phone || auth.user?.phoneVerified === false;
      const needsProfile = !auth.user?.name || !auth.user?.dateOfBirth || !auth.user?.gender;
      if (!needsPhone && !needsProfile) {
        const linked = await triggerLinkedDevicesSummary().unwrap();
        const total = linked?.data?.summary?.total ?? 0;
        navigation.reset({ index: 0, routes: [{ name: total > 0 ? 'MainTabs' : 'RequestPermissions' }] });
      } else if (needsPhone) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'EnterPhoneNumber', params: { googleName, googleEmail, googlePhoto, googleSignup: true } }],
        });
      } else {
        navigation.reset({
          index: 0,
          routes: [{ name: 'PersonalDetails', params: { next: 'DeviceSetup', prefillName: googleName, prefillPhoto: googlePhoto } }],
        });
      }
    } catch (err: any) {
      if (isErrorWithCode(err)) {
        if (err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS) return;
        if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setError('Google Play Services is not available on this device.');
          return;
        }
        const rawCode = Number(err.code);
        setError(rawCode === 10 || rawCode === 12500
          ? 'Google sign-in is not configured for this build (SHA-1 mismatch). Contact support.'
          : `Google sign-in failed (code ${String(err.code)}). Please try again.`);
      } else {
        logs.error('[auth] google sign-in failed', { message: String(err?.message ?? err) });
        setError(err?.data?.message || err?.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  const startGoogleSignIn = async () => {
    if (googleBusy) return;
    setError(undefined);
    setGoogleBusy(true);
    try {
      ensureGoogleSignInConfigured();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      // Clear Google's cached choice so the account picker shows on EVERY
      // sign-in (this is what made the old flow feel silent).
      await GoogleSignin.signOut().catch(() => undefined);
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response) || !response.data?.idToken) {
        return; // user closed the Google sheet — nothing to confirm
      }
      setGoogleConfirm({
        idToken: response.data.idToken,
        name: response.data.user?.name || '',
        email: response.data.user?.email || '',
        photo: response.data.user?.photo || '',
      });
    } catch (err: any) {
      if (isErrorWithCode(err)) {
        if (err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS) {
          return; // user-driven or transient — not an error worth a banner
        }
        if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setError('Google Play Services is not available on this device.');
          return;
        }
        // Raw Play Core codes surface as plain numbers (most notably 10 =
        // DEVELOPER_ERROR, i.e. this app's SHA-1/package isn't registered in
        // Firebase for the configured web client id). Show the code instead
        // of a blank failure so the cause is never silent.
        logs.error('[auth] google native sign-in failed', { code: String(err.code) });
        const rawCode = Number(err.code);
        setError(
          rawCode === 10 || rawCode === 12500
            ? 'Google sign-in is not configured for this build (SHA-1 mismatch). Contact support.'
            : `Google sign-in failed (code ${String(err.code)}). Please try again.`,
        );
        return;
      }
      logs.error('[auth] google sign-in failed', { message: String(err?.message ?? err) });
      setError(err?.data?.message || err?.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleBusy(false);
    }
  };

  // STEP 2 — Continue on the confirm sheet: run the real login with the
  // token already minted for the chosen account.
  const finishGoogleSignIn = async () => {
    const account = googleConfirm;
    setGoogleConfirm(null);
    if (!account) return;
    setError(undefined);
    setGoogleBusy(true);
    let idToken = account.idToken;
    let gUser = { name: account.name, email: account.email, photo: account.photo, birthday: '' };

    try {
      // The idToken was already minted by the account-picker step for the
      // exact account the user chose and confirmed on the sheet — send it to
      // the backend, which verifies it against GOOGLE_WEB_CLIENT_ID.
      if (!idToken) {
        return;
      }

      const auth = await googleSignIn({ idToken }).unwrap();

      // The API call alone doesn't sign the app in — persist the tokens and
      // seed the redux session exactly like Otp.tsx does after verify-otp,
      // so the rest of the app (and the next launch) sees a signed-in user.
      await setTokens(auth.accessToken, auth.refreshToken);
      await setCurrentUserId(getAuthUserId(auth.user));
      dispatch(authApi.util.resetApiState());
      dispatch(
        authActions.signedIn({
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken,
          user: auth.user,
        }),
      );
      syncPushTokenWithAccessToken(auth.accessToken, 'google_signed_in').catch(error => {
        logs.error('[notifications] google login token sync failed', String(error));
      });

      const googleName = gUser.name || '';
      const googleEmail = gUser.email || '';
      const googlePhoto = gUser.photo || '';

      // Google's birthday claim arrives as YYYY-MM-DD (or 0000-MM-DD with a
      // hidden year). PersonalDetails' input shows DD/MM/YYYY, so convert —
      // and only prefill when the year is real (>= 1900); a 0000 year would
      // fail the screen's own validation.
      const googleDob = (() => {
        const match = (gUser.birthday || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match || Number(match[1]) < 1900) return '';
        return `${match[3]}/${match[2]}/${match[1]}`;
      })();

      // Missing-profile check decides the route, in the order onboarding
      // collects things: DOB/gender page (PersonalDetails) -> phone leg ->
      // permissions/home. Google ALWAYS returns a name, so checking `name`
      // (as an earlier version did) meant brand-new Google accounts sailed
      // past Personal Details straight to the phone screen with their DOB,
      // gender and photo never captured.
      const needsPhone = !auth.user?.phone;
      const needsProfile = !auth.user?.dateOfBirth || !auth.user?.gender;

      if (!needsPhone && !needsProfile) {
        // Fully set up — same last step as the OTP flow: with no linked
        // devices the app still owes permissions and setup, otherwise it
        // drops straight into the tabs.
        const linked = await triggerLinkedDevicesSummary().unwrap();
        const total = linked?.data?.summary?.total ?? 0;
        navigation.reset({
          index: 0,
          routes: [{ name: total > 0 ? 'MainTabs' : 'RequestPermissions' }],
        });
      } else if (needsProfile) {
        // DOB/gender missing (the normal Google signup case): the details
        // page runs first with whatever Google already gave us (name, photo,
        // and — when the birthday scope was allowed — the DOB prefilled),
        // then the phone leg via its next: 'EnterPhoneNumber' param.
        navigation.reset({
          index: 0,
          routes: [{ name: 'PersonalDetails', params: { next: 'EnterPhoneNumber', prefillName: googleName, prefillPhoto: googlePhoto, prefillDob: googleDob } }],
        });
      } else {
        // Profile complete but no phone: collect + verify it now.
        navigation.reset({
          index: 0,
          routes: [{ name: 'EnterPhoneNumber', params: { googleName, googleEmail, googlePhoto } }],
        });
      }
    } catch (err: any) {
      if (isErrorWithCode(err)) {
        if (err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS) {
          return; // user-driven or transient — not an error worth a banner
        }
        if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setError('Google Play Services is not available on this device.');
          return;
        }
        // Raw Play Core codes surface as plain numbers (most notably 10 =
        // DEVELOPER_ERROR, i.e. this app's SHA-1/package isn't registered in
        // Firebase for the configured web client id). Show the code instead
        // of a blank failure so the cause is never silent.
        logs.error('[auth] google native sign-in failed', { code: String(err.code) });
        const rawCode = Number(err.code);
        setError(
          rawCode === 10 || rawCode === 12500
            ? 'Google sign-in is not configured for this build (SHA-1 mismatch). Contact support.'
            : `Google sign-in failed (code ${String(err.code)}). Please try again.`,
        );
        return;
      }
      logs.error('[auth] google sign-in failed', { message: String(err?.message ?? err) });
      setError(err?.data?.message || err?.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      {isDark && <DarkGlow scale={scale} />}
      <View style={styles.hero}>
        <ScrollView
          ref={heroScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={handleHeroScrollBeginDrag}
          onMomentumScrollEnd={handleHeroMomentumScrollEnd}
        >
          {heroSlides}
        </ScrollView>

        {!keyboardOpen && (
        <View style={[styles.dotsRowWrap, { bottom: cardHeight + s(10) }]}>
          <View style={[styles.dotsRow, { width: s(49), height: s(6) }]}>
            {HERO_IMAGES.map((_, i) =>
              i === heroIndex ? (
                // Active dot: gray track + blue fill that animates 0 → 100%
                // over the auto-scroll countdown (heroDotProgress).
                <View
                  key={i}
                  style={{
                    width: s(19),
                    height: s(6),
                    borderRadius: s(999),
                    backgroundColor: '#D9D9D9',
                    overflow: 'hidden',
                  }}
                >
                  <Animated.View
                    style={{
                      height: '100%',
                      borderRadius: s(999),
                      backgroundColor: '#2362EB',
                      width: heroDotProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    }}
                  />
                </View>
              ) : (
                <View
                  key={i}
                  style={{
                    width: s(6),
                    height: s(6),
                    borderRadius: s(999),
                    backgroundColor: '#D9D9D9',
                  }}
                />
              ),
            )}
          </View>
        </View>
        )}

      </View>

      <View
        onLayout={e => setCardHeight(e.nativeEvent.layout.height)}
        style={[
          styles.card,
          {
            backgroundColor: palette.background,
            bottom: cardBottom,
            paddingTop: s(16),
            paddingHorizontal: s(SCREEN_PADDING_H),
            // Only the real safe-area inset plus one small gap. The card
            // used to stretch (flex: 1) inside a min-height scroll view
            // AND add a 32-unit pad on top of the inset, which left a
            // dead band under the legal text.
            paddingBottom: (keyboardOpen ? 0 : insets.bottom) + s(12),
          },
        ]}
      >
        <Text style={[styles.title, { fontSize: s(18), lineHeight: s(26), color: palette.title }]}>
          Log in or sign up
        </Text>

        <View style={[styles.phoneRow, { marginTop: s(10), gap: s(6) }]}>
          <Pressable
            style={[
              styles.countryPill,
              { width: s(58), height: s(PHONE_ROW_H), borderRadius: s(10), backgroundColor: palette.inputBg, borderColor: palette.inputBorder },
            ]}
            onPress={() => navigation.navigate('CountryCode')}
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
                // Rendered at its native pre-rotation size (matching the
                // raw SVG viewBox exactly) — the -90deg rotation below
                // then produces the correct on-screen footprint
                // (effectively 5.27 wide x 4.11 tall), derived from
                // Figma's nested inset/rotation chain on this icon
                // (node 100:382) rather than eyeballed.
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
              maxLength={14}
              style={[styles.phoneInput, { fontSize: s(16), color: palette.phoneText }]}
            />
            {!!phone && (
              // Figma's actual clear icon (node 311:1053, "Close_round_fill",
              // found on a later Login Screen duplicate frame) — a filled
              // dark circle with a cut-out X, not the plain "✕" text glyph
              // this used to render.
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

        {!!error && <Text style={[styles.errorText, { fontSize: s(12) }]}>{error}</Text>}

        {!keyboardOpen && (
        <Pressable
          style={[styles.rememberRow, { marginTop: s(12), gap: s(8) }]}
          onPress={() => setRememberMe(v => !v)}
          hitSlop={8}
        >
          <View
            style={[
              styles.checkbox,
              { width: s(15), height: s(15), borderRadius: s(3) },
              rememberMe && styles.checkboxChecked,
            ]}
          >
            {rememberMe ? (
              <CheckboxTickIcon
                width={s(7)}
                height={s(8)}
                style={{ transform: [{ rotate: '90deg' }] }}
              />
            ) : null}
          </View>
          <Text style={[styles.rememberText, { fontSize: s(13), color: palette.rememberText }]}>
            Remember my login for faster sign-in
          </Text>
        </Pressable>
        )}

        <Pressable
          onPress={onContinue}
          disabled={!isValid || isLoading}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              marginTop: s(19),
              alignSelf: 'center',
              width: s(PRIMARY_BUTTON.width),
              maxWidth: '100%',
              minHeight: s(PRIMARY_BUTTON.minHeight),
              borderRadius: s(PRIMARY_BUTTON.radius),
            },
            (!isValid || isLoading) && styles.primaryBtnDisabled,
            pressed && isValid && !isLoading && styles.primaryBtnPressed,
          ]}
        >
          <Text style={[styles.primaryBtnText, { fontSize: s(PRIMARY_BUTTON.fontSize) }]}>
            {isLoading ? 'Please wait...' : 'Continue'}
          </Text>
        </Pressable>

        {!keyboardOpen && (
        <>
        <View style={[styles.socialRow, { marginTop: s(18), gap: s(11) }]}>
          <Pressable
            style={[styles.socialBtn, { width: s(35), height: s(35), borderRadius: s(17.5), backgroundColor: palette.socialBtnBg }]}
            onPress={startGoogleSignIn}
            disabled={googleBusy}
          >
            <Image
              source={require('../../../assets/icons/common/social-google.png')}
              style={{ width: s(18), height: s(18) }}
              resizeMode="contain"
            />
          </Pressable>

          <Pressable
            style={[styles.socialBtn, { width: s(35), height: s(35), borderRadius: s(17.5), backgroundColor: palette.socialBtnBg }]}
            onPress={() => navigation.navigate('ContinueWithEmail')}
          >
            <EmailIcon width={s(24)} height={s(24)} />
          </Pressable>

          <Pressable
            style={[styles.socialBtn, { width: s(35), height: s(35), borderRadius: s(17.5), backgroundColor: palette.socialBtnBg }]}
            onPress={() => Alert.alert('Coming Soon', 'Apple sign-in is coming soon.')}
          >
            <Image
              source={require('../../../assets/icons/common/social-apple.png')}
              style={{ width: s(24), height: s(24) }}
              resizeMode="contain"
            />
          </Pressable>
        </View>

        <Text
          style={[
            styles.legalText,
            // No fixed width here — Figma's own 195px box somehow fits
            // "Terms of Services Privacy Policy Content Policy" on one
            // line in Figma's renderer, but the same width wraps it
            // mid-phrase on-device (font metrics differ). Letting it use
            // the full available width (bounded by the card's own
            // horizontal padding) gives it enough room to stay on one line.
            { marginTop: s(16), fontSize: s(10), lineHeight: s(16), color: palette.legalText },
          ]}
        >
          By continuing, you agree to our{'\n'}
          <Text
            style={styles.legalLink}
            accessibilityRole="link"
            onPress={() => openLegalDocument('terms_conditions', TERMS_CONDITIONS_URL)}
          >
            Terms of Services
          </Text>
          {'  '}
          <Text
            style={styles.legalLink}
            accessibilityRole="link"
            onPress={() => openLegalDocument('privacy_policy', PRIVACY_POLICY_URL)}
          >
            Privacy Policy
          </Text>
          {'  '}
          <Text
            style={styles.legalLink}
            accessibilityRole="link"
            onPress={() => openLegalDocument('content_policy', CONTENT_POLICY_URL)}
          >
            Content Policy
          </Text>
        </Text>
        </>
        )}
      </View>

      {!!googleConfirm && (
        // In-app mirror of Google's web "You're signing back in to …" sheet:
        // the native SDK signs in silently, so this is the explicit
        // Continue/Cancel gate before ANY login happens. Nothing has been
        // sent to the backend yet — Cancel just discards the picked token.
        <View style={styles.googleConfirmBackdrop}>
          <View
            style={[
              styles.googleConfirmCard,
              { backgroundColor: palette.background, borderColor: palette.inputBorder },
            ]}
          >
            <View style={styles.googleConfirmBrandRow}>
              <Image
                source={require('../../../assets/icons/common/social-google.png')}
                style={{ width: s(20), height: s(20) }}
                resizeMode="contain"
              />
              <Text style={[styles.googleConfirmBrand, { fontSize: s(13), color: palette.title }]}>
                Sign in with Google
              </Text>
            </View>

            <Text style={[styles.googleConfirmTitle, { fontSize: s(18), lineHeight: s(26), color: palette.title }]}>
              {googleConfirm.name ? `You're signing in to Dvaari as ${googleConfirm.name}` : "You're signing in to Dvaari"}
            </Text>
            <Text style={[styles.googleConfirmEmail, { fontSize: s(13), color: palette.rememberText }]}>
              {googleConfirm.email}
            </Text>

            <View style={styles.googleConfirmActions}>
              <Pressable
                style={[styles.googleConfirmBtn, styles.googleConfirmBtnSecondary, { borderColor: palette.inputBorder }]}
                onPress={() => setGoogleConfirm(null)}
                disabled={googleBusy}
              >
                <Text style={[styles.googleConfirmBtnText, { fontSize: s(14), color: palette.title }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.googleConfirmBtn, styles.googleConfirmBtnPrimary]}
                onPress={finishGoogleSignIn}
                disabled={googleBusy}
              >
                {googleBusy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.googleConfirmBtnText, styles.googleConfirmBtnTextPrimary, { fontSize: s(14) }]}>
                    Continue
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {isLoading && (
        // A full-screen sibling of the card, so it stays centred on the
        // viewport when the user taps Continue.
        <View style={styles.sendingBackdrop}>
          <View
            style={[
              styles.sendingOverlay,
              {
                width: s(321),
                height: s(59),
                borderRadius: s(4),
                gap: s(10),
                backgroundColor: palette.sendingBg,
                borderColor: palette.sendingBorder,
              },
            ]}
          >
            <ActivityIndicator size="small" color={palette.sendingSpinner} />
            <Text style={[styles.sendingText, { fontSize: s(12), color: palette.sendingText }]}>
              Sending OTP
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function useStyles() {
  const scale = useUiScale();
  return useMemo(() => createStyles(scale), [scale]);
}

function createStyles(scale: number) {
  const s = (n: number) => n * scale;

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#FFFFFF',
    },

    // Full-bleed: the hero fills the window — including the strip behind the
    // translucent status bar — and the card floats over its lower part, so the
    // clock and battery icons sit on the photo rather than on a white band.
    // Pinned with `bottom: 0` rather than a JS-computed `height: window.height`
    // so that Android's adjustResize shrinking the window on keyboard-open is
    // handled by the native layout pass alone, instead of pushing a new height
    // through JS and re-laying out the four hero photos on every frame of the
    // keyboard animation.
    hero: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'hidden',
    },

    dotsRowWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
    },

    dotsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    sendingBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'center',
      alignItems: 'center',
    },

    sendingOverlay: {
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderWidth: 0.5,
      borderColor: 'rgba(255,255,255,0.47)',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },

    sendingText: {
      fontFamily: 'Satoshi-Regular',
      color: 'rgba(40,40,40,0.77)',
    },

    card: {
      position: 'absolute',
      left: 0,
      right: 0,
      backgroundColor: '#FFFFFF',
    },

    title: {
      textAlign: 'center',
      fontFamily: 'Satoshi-Bold',
      color: '#1E1E1E',
    },

    phoneRow: {
      flexDirection: 'row',
    },

    countryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s(4),
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
      marginTop: s(8),
      color: '#EA8080',
      fontFamily: 'Satoshi-Medium',
    },

    rememberRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    checkbox: {
      borderWidth: 1.5,
      borderColor: '#2362EB',
      alignItems: 'center',
      justifyContent: 'center',
    },

    checkboxChecked: {
      backgroundColor: '#2362EB',
      borderWidth: 0,
    },

    rememberText: {
      fontFamily: 'Satoshi-Medium',
      color: 'rgba(0,0,0,0.76)',
    },

    primaryBtn: {
      backgroundColor: '#2362EB',
      alignItems: 'center',
      justifyContent: 'center',
    },

    primaryBtnDisabled: {
      backgroundColor: '#81A5F3',
    },

    primaryBtnPressed: {
      opacity: 0.9,
    },

    primaryBtnText: {
      fontFamily: 'Satoshi-Medium',
      color: '#FFFFFF',
    },

    socialRow: {
      flexDirection: 'row',
      justifyContent: 'center',
    },

    // In-app Google confirm sheet (mirror of Google's web confirm page —
    // the native SDK signs in silently, so the explicit gate lives here).
    googleConfirmBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: s(24),
    },

    googleConfirmCard: {
      width: '100%',
      maxWidth: s(340),
      borderRadius: s(16),
      borderWidth: 1,
      paddingTop: s(18),
      paddingHorizontal: s(18),
      paddingBottom: s(18),
      gap: s(10),
    },

    googleConfirmBrandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(8),
    },

    googleConfirmBrand: {
      fontFamily: 'Satoshi-Medium',
      color: 'rgba(0,0,0,0.7)',
    },

    googleConfirmTitle: {
      fontFamily: 'Satoshi-Bold',
      color: '#1E1E1E',
    },

    googleConfirmEmail: {
      fontFamily: 'Satoshi-Medium',
      color: 'rgba(0,0,0,0.6)',
    },

    googleConfirmActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: s(10),
      marginTop: s(6),
    },

    googleConfirmBtn: {
      minHeight: s(42),
      borderRadius: s(999),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: s(20),
    },

    googleConfirmBtnSecondary: {
      borderWidth: 1,
      backgroundColor: 'transparent',
    },

    googleConfirmBtnPrimary: {
      backgroundColor: '#2362EB',
    },

    googleConfirmBtnText: {
      fontFamily: 'Satoshi-Medium',
      color: '#1E1E1E',
    },

    googleConfirmBtnTextPrimary: {
      color: '#FFFFFF',
    },

    socialBtn: {
      backgroundColor: '#D9D9D9',
      alignItems: 'center',
      justifyContent: 'center',
    },

    legalText: {
      alignSelf: 'center',
      textAlign: 'center',
      fontFamily: 'Satoshi-Regular',
      color: '#333333',
    },

    legalLink: {
      // Explicit colour is required because nested Text inherits the parent
      // legal copy colour by default.  These are actionable web links, so
      // make them visibly distinct on both light and dark login themes.
      color: '#2362EB',
      textDecorationLine: 'underline',
      fontFamily: 'Satoshi-Medium',
    },
  });
}
