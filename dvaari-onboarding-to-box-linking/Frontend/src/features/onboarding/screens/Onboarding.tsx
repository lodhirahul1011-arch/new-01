import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StatusBar,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { onboardingData } from './onboardingData';
import { setOnboardingCompleted } from '../../../services/storage/tokenStorage';
import ResponsiveScrollScreen from '../../../components/layout/ResponsiveScrollScreen';
import ArrowLeftIcon from '../../../assets/icons/common/arrow-left-gray.svg';
import ArrowLeftWhiteIcon from '../../../assets/icons/common/arrow-left-white.svg';
import LogoIcon from '../../../assets/icons/common/logo-icon.svg';
import LogoWordmark from '../../../assets/icons/common/logo-wordmark.svg';
import LogoWordmarkDark from '../../../assets/icons/common/logo-wordmark-dark.svg';
import DarkGlow from '../../../components/ui/DarkGlow';
import { SCREEN_PADDING_H } from '../../../theme/metrics';
import { useTheme } from '../../../theme/ThemeContext';
import { useUiScale } from '../../../theme/responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

// Every number below is copied 1:1 from the Figma frame (fileKey
// 0ZAjL8CnVgprbKaBMIjUqJ, First/Second/Third/Fourth Screen — node ids
// 9:109 / 9:168 / 9:220 / 9:326), a 360x812 canvas. They're scaled by a
// single width-based factor so proportions stay exact on any device, and
// the layout stays a fluid flex column (not a fixed centered canvas) so it
// fills whatever height the device actually has instead of leaving blank
// letterbox bars — any extra height beyond Figma's 812 becomes breathing
// room in the flexible zone around the title/subtitle, exactly the way
// Figma itself keeps the "Next" button pinned at y=666 regardless of how
// many lines the description text wraps to.
const CANVAS_W = 360;
// Figma's "row 1" (back/skip) sits at canvas y=72, but that canvas already
// includes its own status-bar mockup (~44pt, iPhone-style). SafeAreaView
// already pushes past the device's real status bar, so only the leftover
// (72 - 44 = 28) belongs in our own top padding — using the raw 72 here
// double-counts the status bar and pushes row 1 down way too far.
const HEADER_TOP = 28;
const HERO = { left: 62, top: 192, width: 232, height: 299 };
// Blob canvas positions copied directly from Figma (node 9:110 / 9:111) —
// they are NOT centered behind the hero image, they're independently
// placed (blob2 sits almost flush with the screen's left edge), which is
// what creates the asymmetric "photo stack" fan effect behind the image.
const BLOB_BACK = { left: 64.89, top: 195.15, width: 288.559, height: 295.983, innerW: 233.646, innerH: 244.112, rotate: '14.9deg' };
const BLOB_FRONT = { left: 6, top: 198.85, width: 286.733, height: 294.288, innerW: 233.646, innerH: 244.112, rotate: '-14.31deg' };
const HERO_ROW_TOP = Math.min(HERO.top, BLOB_BACK.top, BLOB_FRONT.top);
const HERO_ROW_BOTTOM = Math.max(
  HERO.top + HERO.height,
  BLOB_BACK.top + BLOB_BACK.height,
  BLOB_FRONT.top + BLOB_FRONT.height,
);
// Content-only budget (title + gap + subtitle, NOT the 32px gap above the
// title — that's applied separately as textZone's own marginTop below).
// Derived from Figma's dark frames: title line-height ~36px (30px, normal
// leading) + 14px gap + subtitle worst case ~3 wrapped lines at up to 16px
// (~60px) — the longest real copy (First Screen's two-sentence description).
const TEXT_ZONE_MIN_H = 120;
// Hero (with its 34px top margin) + dots (17px margin + 6px height) + the
// 32px gap above the title + the text zone's own minimum — the same fixed
// budget the flex column used to lay out vertically. The carousel needs an
// explicit height (horizontal ScrollViews don't auto-size to content), so
// this reproduces that budget instead of letting each page's height drift
// independently.
const CAROUSEL_H = HERO_ROW_BOTTOM - HERO_ROW_TOP + 34 + 17 + 6 + 32 + TEXT_ZONE_MIN_H;
// How long each slide stays on screen before auto-advancing.
const AUTO_SCROLL_INTERVAL_MS = 4000;

// Dark-mode values copied 1:1 from the Figma "Dark Mode Dvaari" page (First/
// Second/Third/Fourth Screen — node ids 204:2572 / 204:2679 / 212:2739 /
// 212:2836). The dots and CTA button are identical in both modes, so only
// these need a light/dark split.
const THEME = {
  light: {
    background: '#FFFFFF',
    backBtnBg: '#F2F2F2',
    backBtnBorder: 'rgba(0,0,0,0.12)',
    skipBg: 'rgba(217,217,217,0.46)',
    skipBorder: 'rgba(0,0,0,0.27)',
    skipText: 'rgba(30,30,30,0.76)',
    blobBg: '#EFEFEF',
    blobBorder: 'transparent',
    title: 'rgba(17,17,17,0.94)',
    subtitle: '#333333',
  },
  dark: {
    background: '#0F0F10',
    backBtnBg: 'rgba(255,255,255,0.15)',
    backBtnBorder: 'rgba(255,255,255,0.15)',
    skipBg: 'rgba(255,255,255,0.15)',
    skipBorder: 'rgba(255,254,254,0.27)',
    skipText: '#FFFFFF',
    blobBg: '#282828',
    blobBorder: 'rgba(255,255,255,0.2)',
    title: 'rgba(255,255,255,0.94)',
    subtitle: 'rgba(255,255,255,0.85)',
  },
};

export default function Onboarding({ navigation }: Props) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const scale = useUiScale(CANVAS_W);
  const s = (n: number) => n * scale;
  const { isDark } = useTheme();
  const palette = isDark ? THEME.dark : THEME.light;

  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Drives the active dot's fill (0 → 1 over AUTO_SCROLL_INTERVAL_MS), so the
  // dot itself doubles as the auto-scroll countdown — the same way Instagram/
  // Snapchat story progress bars work.
  const dotProgress = useRef(new Animated.Value(0)).current;

  const isLast = index === onboardingData.length - 1;

  const clearAutoScroll = () => {
    if (autoScrollTimer.current) {
      clearTimeout(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }
    dotProgress.stopAnimation();
  };

  // Restarts the countdown (and its dot-fill animation) from `fromIndex` —
  // called after any move (auto, swipe, or button) so a manual action never
  // gets fought by a stale timer. Takes the index explicitly rather than
  // reading `index` state, since state updates aren't visible synchronously
  // to the caller that just triggered them.
  const startAutoScroll = (fromIndex: number) => {
    clearAutoScroll();
    indexRef.current = fromIndex;

    const isLastSlide = fromIndex >= onboardingData.length - 1;
    // Last slide has nothing to auto-advance to — show its dot fully filled
    // (still "active") without a ticking countdown, instead of empty.
    dotProgress.setValue(isLastSlide ? 1 : 0);
    if (isLastSlide) return;

    Animated.timing(dotProgress, {
      toValue: 1,
      duration: AUTO_SCROLL_INTERVAL_MS,
      easing: Easing.linear,
      useNativeDriver: false, // animating width, not eligible for the native driver
    }).start();

    autoScrollTimer.current = setTimeout(() => {
      const next = fromIndex + 1;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setIndex(next);
      startAutoScroll(next);
    }, AUTO_SCROLL_INTERVAL_MS);
  };

  useEffect(() => {
    startAutoScroll(indexRef.current);
    return clearAutoScroll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const goToIndex = (next: number) => {
    const clamped = Math.max(0, Math.min(next, onboardingData.length - 1));
    setIndex(clamped);
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    startAutoScroll(clamped);
  };

  const goNext = async () => {
    if (!isLast) {
      goToIndex(index + 1);
      return;
    }
    // Figma prototype: the last onboarding screen's "Next" leads to Login.
    await setOnboardingCompleted(true);
    navigation.replace('Login');
  };

  const goBack = () => {
    goToIndex(index - 1);
  };

  const skip = async () => {
    await setOnboardingCompleted(true);
    navigation.replace('Login');
  };

  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    if (newIndex !== indexRef.current) setIndex(newIndex);
    startAutoScroll(newIndex);
  };

  return (
    <ResponsiveScrollScreen backgroundColor={palette.background}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      <View style={[styles.container, { paddingTop: s(HEADER_TOP), paddingBottom: s(40) }]}>
        {/* Ambient blue glow behind the status bar — present on every dark-mode
            frame (Figma node 204:2734, "Ellipse 19"), absent in light mode. */}
        {isDark && <DarkGlow scale={scale} />}

        {/* Row 1: back (left) / skip (right) — its own row above the logo, exactly as Figma lays it out */}
        <View style={[styles.headerRow, { height: s(34), paddingHorizontal: s(SCREEN_PADDING_H) }]}>
          <View style={styles.headerSide}>
            {index > 0 && (
              <Pressable
                onPress={goBack}
                hitSlop={8}
                style={{
                  width: s(34),
                  height: s(34),
                  borderRadius: s(17),
                  backgroundColor: palette.backBtnBg,
                  borderWidth: s(0.5),
                  borderColor: palette.backBtnBorder,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isDark ? (
                  <ArrowLeftWhiteIcon width={s(20)} height={s(20)} />
                ) : (
                  <ArrowLeftIcon width={s(20)} height={s(20)} />
                )}
              </Pressable>
            )}
          </View>

          <View style={[styles.headerSide, styles.headerSideRight]}>
            {/* Skip pill — Figma's Fourth Screen has no Skip node, so it's intentionally omitted there */}
            {!isLast && (
              <Pressable
                onPress={skip}
                hitSlop={8}
                style={{
                  width: s(86),
                  height: s(34),
                  borderRadius: s(24),
                  backgroundColor: palette.skipBg,
                  borderWidth: s(0.23),
                  borderColor: palette.skipBorder,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: palette.skipText, fontSize: s(16) }}>
                  Skip
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Row 2: centered logo, 24px below row 1. Rendered as the two Figma-exported
            SVGs (icon + wordmark) instead of the old logo2.png, which is a fixed
            132x40px raster — on a 3x-density phone that gets upscaled ~3x and reads
            as blurry. Vectors stay crisp at any size. */}
        <View style={[styles.logoRow, { marginTop: s(24), height: s(36.25), gap: s(10.5) }]}>
          <LogoIcon width={s(30.283)} height={s(36.249)} />
          {isDark ? (
            <LogoWordmarkDark width={s(90.621)} height={s(26.533)} />
          ) : (
            <LogoWordmark width={s(90.621)} height={s(26.533)} />
          )}
        </View>

        {/* Swipeable + auto-advancing carousel — one page per slide, each reproducing
            Figma's hero image, dot indicator, and title/description block exactly as
            they were laid out before. Dots always read from the shared `index` state
            (not the page's own position), so they stay in sync regardless of whether
            the page changed via swipe, the Next/Back buttons, or the auto-scroll timer. */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={clearAutoScroll}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          style={[styles.carousel, { height: s(CAROUSEL_H) }]}
        >
          {onboardingData.map(item => (
            <View key={item.id} style={{ width }}>
              {/* Hero image, 34px below the logo, with the stacked-photo decoration behind it.
                  Full-bleed row (no horizontal padding) so blob2's near-edge canvas position
                  (x=6) lands in the right place — it's positioned in the same coordinate
                  space as the rest of the 360-wide canvas, not centered under the image. */}
              <View
                style={[
                  styles.heroSection,
                  { marginTop: s(34), width: s(CANVAS_W), height: s(HERO_ROW_BOTTOM - HERO_ROW_TOP) },
                ]}
              >
                <View
                  style={[
                    styles.heroBlobOuter,
                    {
                      left: s(BLOB_BACK.left),
                      top: s(BLOB_BACK.top - HERO_ROW_TOP),
                      width: s(BLOB_BACK.width),
                      height: s(BLOB_BACK.height),
                    },
                  ]}
                >
                  <View
                    style={{
                      width: s(BLOB_BACK.innerW),
                      height: s(BLOB_BACK.innerH),
                      borderRadius: s(29),
                      backgroundColor: palette.blobBg,
                      borderWidth: isDark ? s(0.23) : 0,
                      borderColor: palette.blobBorder,
                      transform: [{ rotate: BLOB_BACK.rotate }],
                    }}
                  />
                </View>

                <View
                  style={[
                    styles.heroBlobOuter,
                    {
                      left: s(BLOB_FRONT.left),
                      top: s(BLOB_FRONT.top - HERO_ROW_TOP),
                      width: s(BLOB_FRONT.width),
                      height: s(BLOB_FRONT.height),
                    },
                  ]}
                >
                  <View
                    style={{
                      width: s(BLOB_FRONT.innerW),
                      height: s(BLOB_FRONT.innerH),
                      borderRadius: s(29),
                      backgroundColor: palette.blobBg,
                      borderWidth: isDark ? s(0.23) : 0,
                      borderColor: palette.blobBorder,
                      transform: [{ rotate: BLOB_FRONT.rotate }],
                    }}
                  />
                </View>

                <View
                  style={[
                    styles.heroImageShadow,
                    {
                      left: s(HERO.left),
                      top: s(HERO.top - HERO_ROW_TOP),
                      width: s(HERO.width),
                      height: s(HERO.height),
                      borderRadius: s(29),
                    },
                  ]}
                >
                  <Image
                    source={item.image}
                    style={[styles.hero, { borderRadius: s(29) }]}
                    resizeMode="cover"
                  />
                </View>
              </View>

              {/* Dots, 17px below the hero — 49px total: 19px active + 6+6+6px inactive, gaps split the rest */}
              <View
                style={[
                  styles.dotsRow,
                  { marginTop: s(17), width: s(49), height: s(6) },
                ]}
              >
                {onboardingData.map((_, i) =>
                  i === index ? (
                    // Active dot: a gray track with a blue fill that animates
                    // 0 → 100% over the auto-scroll countdown (dotProgress).
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
                          width: dotProgress.interpolate({
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

              {/* Figma keeps the title pinned at a fixed y (564px on all 4 dark frames,
                  32px below the dots) and the button pinned at a fixed y below that —
                  it's the gap *under* the subtitle that absorbs however many lines the
                  description wraps to, not the gap above the title. minHeight here is a
                  floor sized for the real (longer, 2-line on most slides) copy; any extra
                  device height becomes slack below the subtitle instead of centering the
                  whole block, which would drift from the real layout. */}
              <View style={[styles.textZone, { marginTop: s(32), minHeight: s(TEXT_ZONE_MIN_H) }]}>
                <Text style={[styles.title, { fontSize: s(30), color: palette.title }]}>
                  {item.title}
                </Text>
                <Text
                  style={[
                    styles.subtitle,
                    {
                      // Figma's per-slide title→subtitle edge gap ranges 11-20px
                      // depending on how many lines the description wraps to
                      // (shorter single-line subtitles sit closer, longer 2-line
                      // ones a bit further) — 14px is the representative middle.
                      marginTop: s(14),
                      width: s(323),
                      fontSize: s(item.descriptionFontSize ?? 14),
                      lineHeight: s((item.descriptionFontSize ?? 14) * 1.45),
                      color: palette.subtitle,
                    },
                  ]}
                >
                  {item.description}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Button — 305x39, matching Figma exactly */}
        <Pressable
          onPress={goNext}
          style={{
            alignSelf: 'center',
            width: s(305),
            height: s(39),
            borderRadius: s(29),
            backgroundColor: '#2362EB',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: s(20) }}>Next</Text>
        </Pressable>
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
    container: {
      flex: 1,
    },

    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    headerSide: {
      justifyContent: 'center',
    },

    headerSideRight: {
      alignItems: 'flex-end',
    },

    logoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },

    carousel: {
      flexGrow: 0,
    },

    heroSection: {
      alignSelf: 'center',
      position: 'relative',
    },

    heroBlobOuter: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },

    heroImageShadow: {
      position: 'absolute',
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },

    hero: {
      width: '100%',
      height: '100%',
    },

    dotsRow: {
      flexDirection: 'row',
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    textZone: {
      // Top-aligned, not centered: Figma pins the title at a fixed offset
      // below the dots on every slide (y=564 on all 4 dark frames) and lets
      // the *gap below the subtitle* absorb however many lines it wraps to,
      // not the gap above the title. Centering the block would spread that
      // slack evenly on both sides instead, drifting from the real layout.
      alignItems: 'center',
    },

    title: {
      textAlign: 'center',
      fontFamily: 'Satoshi-Medium',
      color: 'rgba(17,17,17,0.94)',
    },

    subtitle: {
      textAlign: 'center',
      fontFamily: 'Satoshi-Regular',
      color: '#333333',
    },
  });

