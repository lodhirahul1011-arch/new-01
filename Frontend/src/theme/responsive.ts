import { useContext, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

// Every Figma frame in this project is drawn on a 360x812 portrait artboard,
// and the screens reproduce it by multiplying each Figma number through a
// local `s(n)` helper. This module owns the one piece those screens all got
// wrong on their own: turning a device size into that multiplier.
export const CANVAS_W = 360;
export const CANVAS_H = 812;

// Raw `width / 360` is only correct while `width` really is a phone's portrait
// width. It stops being correct in two situations the app actually reaches:
//
//   - Rotation. Android has no `android:screenOrientation` and iPad allows all
//     four orientations, so `width` becomes the LONG edge — 812 on a phone,
//     1024+ on a tablet — and every layout inflates 2x-3x.
//   - Large devices. A 10" tablet is ~800dp wide in portrait, so even upright
//     the raw ratio doubles every font, icon and padding on screen.
//
// Measuring off the SHORTEST edge fixes the first (a screen is the same size
// turned as it is upright), and clamping fixes the second (a tablet gets a
// comfortably larger phone layout, not a magnified one). The bounds are
// deliberately narrow: these layouts are pixel-reproductions of one artboard,
// so they degrade by stretching, not by scaling past ~15%.
export const MIN_SCALE = 0.85;
export const MAX_SCALE = 1.15;

// Shortest edge (in dp) at which a device is treated as a tablet — the same
// threshold Android uses for its `sw600dp` resource bucket.
export const TABLET_BREAKPOINT = 600;

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

// Pure form, for `createStyles(...)` factories and anything outside a component.
export function layoutScale(width: number, height: number, canvasW = CANVAS_W) {
  return clamp(Math.min(width, height) / canvasW, MIN_SCALE, MAX_SCALE);
}

export type Responsive = {
  width: number;
  height: number;
  /** Clamped, orientation-stable multiplier for Figma numbers. */
  scale: number;
  /** Scales a Figma dimension to this device. */
  s: (n: number) => number;
  isLandscape: boolean;
  isTablet: boolean;
};

export function useResponsive(canvasW = CANVAS_W): Responsive {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const scale = layoutScale(width, height, canvasW);
    return {
      width,
      height,
      scale,
      s: (n: number) => n * scale,
      isLandscape: width > height,
      isTablet: Math.min(width, height) >= TABLET_BREAKPOINT,
    };
  }, [width, height, canvasW]);
}

// Convenience for the many screens that already destructure
// `useWindowDimensions()` themselves and only need the multiplier.
export function useUiScale(canvasW = CANVAS_W) {
  const { width, height } = useWindowDimensions();
  return layoutScale(width, height, canvasW);
}

// --- Canvas height & the floating tab bar ---------------------------------
//
// DvaariTabBar is `position: 'absolute'; bottom: 0`, so it paints over the
// screen and reserves no layout space of its own. Anything scrolling beneath
// it has to reserve that space itself or its last row ends up under the bar.
//
// On the artboard the bar's centre FAB starts at y=743, so the bar owns the
// bottom 69 units of the 812-tall canvas. Its own root then adds the safe-area
// inset plus a 15-unit gap under the 54-unit container — the same 69 units.
export const TAB_BAR_TOP = 743;
export const TAB_BAR_CANVAS_H = CANVAS_H - TAB_BAR_TOP; // 69

// Resting gap under the last element of a scrolling screen, in canvas units.
export const CONTENT_BOTTOM_GAP = 24;

// `useSafeAreaInsets` throws outright when no SafeAreaProvider is above it,
// which takes down any unit test that renders a screen in isolation. Reading
// the context directly returns null in that case, so a screen stays renderable
// without a provider and simply sees zero insets.
const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

function useInsetsOrZero() {
  return useContext(SafeAreaInsetsContext) ?? NO_INSETS;
}

/**
 * Bottom padding a scroll container needs so its last item clears the floating
 * tab bar. Returns 0 for screens that aren't hosted in the tab navigator.
 */
export function useTabBarSpace(hasTabBar = true) {
  const scale = useUiScale();
  const insets = useInsetsOrZero();
  return hasTabBar ? scale * TAB_BAR_CANVAS_H + insets.bottom : 0;
}

export type CanvasScreen = {
  scale: number;
  s: (n: number) => number;
  /**
   * The 812-tall artboard scaled to this device, less the safe-area insets a
   * SafeAreaView has already carved out. Apply it as `minHeight` on a scroll
   * container's contentContainerStyle: the screen then keeps the design's full
   * vertical rhythm, and scrolls exactly when the device cannot show all of it.
   */
  canvasMinHeight: number;
  /**
   * Bottom padding for a screen-level scroll container: the space the floating
   * tab bar occupies when there is one, plus a resting gap so the last element
   * never sits flush against the screen edge.
   *
   * This is applied inline, which BEATS the stylesheet — so it has to be the
   * whole intended padding. It previously carried only the tab-bar space, which
   * meant that on the 18 screens where the bar is hidden it evaluated to 0 and
   * silently wiped out the paddingBottom their stylesheet had set.
   */
  contentBottomGap: number;
  /** True when the scaled canvas is taller than the space actually available. */
  overflows: boolean;
};

export function useCanvasScreen(hasTabBar = false): CanvasScreen {
  const { width, height } = useWindowDimensions();
  const insets = useInsetsOrZero();
  const scale = layoutScale(width, height);

  return useMemo(() => {
    const canvas = scale * CANVAS_H - insets.top - insets.bottom;
    const available = height - insets.top - insets.bottom;

    return {
      scale,
      s: (n: number) => n * scale,
      // Capped at the viewport. The artboard is 360x812 — an aspect of 2.256 —
      // while real handsets are proportionally shorter (844/390 = 2.164), so
      // scaling the canvas by WIDTH always overshoots the available HEIGHT by
      // 12-36pt. Left uncapped that overshoot forced a small scroll on every
      // screen even when its content fitted comfortably. Capping keeps the
      // useful half of the rule — content still fills the screen, and still
      // scrolls whenever it genuinely runs past the bottom — without inventing
      // a scroll out of the artboard's aspect ratio.
      canvasMinHeight: Math.min(canvas, available),
      contentBottomGap:
        (hasTabBar ? scale * TAB_BAR_CANVAS_H + insets.bottom : 0) +
        scale * CONTENT_BOTTOM_GAP,
      overflows: canvas > available,
    };
  }, [scale, height, insets.top, insets.bottom, hasTabBar]);
}
