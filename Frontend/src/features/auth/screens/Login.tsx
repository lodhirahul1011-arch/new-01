import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Keyboard,
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

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { useRequestOtpMutation } from '../../../services/api/authApi';
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

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

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
            onPress={() => Alert.alert('Coming Soon', 'Google sign-in is coming soon.')}
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
          <Text style={styles.legalLink}>Terms of Services</Text>
          {'  '}
          <Text style={styles.legalLink}>Privacy Policy</Text>
          {'  '}
          <Text style={styles.legalLink}>Content Policy</Text>
        </Text>
        </>
        )}
      </View>

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
      textDecorationLine: 'underline',
    },
  });
}
