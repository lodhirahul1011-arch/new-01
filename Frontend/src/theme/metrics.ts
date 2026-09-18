// Standard horizontal screen-edge margin (content-to-screen-edge gap), used
// across every screen for a consistent left/right rhythm. Screens that scale
// their layout off Figma's 360px-wide canvas via a local `s(n)` function
// should use `s(SCREEN_PADDING_H)`; screens with static/unscaled layouts use
// it directly. Not meant for inner component padding (buttons, pills,
// cards) — those remain whatever each design calls for.
export const SCREEN_PADDING_H = 19;

// Breathing-room gap below a screen's bottom-pinned primary button (Continue,
// Send OTP, Save, etc.) — ONLY for screens whose safe-area bottom inset is
// already handled elsewhere (SafeAreaView with default/all edges,
// ResponsiveScrollScreen, or manual `insets.bottom`). On those screens, a
// large Figma-derived paddingBottom (often written as `s(812 - buttonY -
// N)`, reproducing the gap to Figma's own mockup home-indicator) double-
// counts the real device's safe area on top of it, pushing the button much
// further from the bottom than intended. Use this small fixed gap instead.
// Screens that DON'T already get a safe-area bottom inset (e.g.
// `SafeAreaView edges={['top']}`, or no SafeAreaView/insets at all) still
// need their own full-size padding — don't apply this constant there.
export const BOTTOM_BUTTON_GAP = 16;

// --- Primary action button -------------------------------------------------
//
// The pill CTA at the bottom of a form — "Continue", "Send OTP", "Save".
// These numbers are the profile screen's Save button (EditProfile), which is
// the reference the auth screens were reconciled against: each had reproduced
// its own Figma frame literally, and they had drifted into five different
// buttons (heights 30/35/39/40, radii 21/26/29/30/56, labels 12-18pt).
//
// The height is a MIN height, never a fixed one, for the reason
// AccountVerified already documented on its own button: the label grows with
// the OS font-size setting and a hard height clips it at the larger
// accessibility steps. 44 is also the minimum touch target — every fixed
// height the auth screens used (30-40) sat under it.
export const PRIMARY_BUTTON = {
  /** Design width. Always pair with `maxWidth: '100%'` so it fits narrow screens. */
  width: 305,
  minHeight: 44,
  radius: 26,
  fontSize: 15,
};

// Gap between the header's back disc and its title. The profile screen sets
// this as the title's own marginLeft; auth screens had drifted to 14.
export const HEADER_TITLE_GAP = 9;

// Screen/section heading beside a back button, matching the profile screen.
export const HEADER_TITLE_SIZE = 18;

// Field label and field text, matching the profile screen's form rows.
export const FIELD_LABEL_SIZE = 13;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const Radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  xxl: 22,
  full: 999,
};

export const FontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
  hero: 32,
};