import { logs } from '../services/logs';

// Local backend for on-device testing, via USB + `adb reverse tcp:5000
// tcp:5000` (not the LAN IP) — the test Wi-Fi is a shared coworking network
// with client isolation, so devices on it can't reach each other directly.
// Run `adb reverse tcp:5000 tcp:5000` again any time the device reconnects.
const LOCAL_API_BASE_URL = 'http://localhost:5000';
const PRODUCTION_API_BASE_URL = 'https://api.grahnetra.com';
const isDebugBuild = typeof __DEV__ !== 'undefined' && __DEV__;

function normalizeApiBaseUrl(url: string) {
  const trimmedUrl = url.trim().replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(trimmedUrl)) {
    const normalizedUrl = `https://${trimmedUrl}`;
    logs.error('[env] API base URL missing protocol, using HTTPS URL', {
      configuredUrl: url,
      normalizedUrl,
    });
    return normalizedUrl;
  }

  logs.info('[env] API base URL configured', {
    apiBaseUrl: trimmedUrl,
    mode: isDebugBuild ? 'local' : 'production',
  });
  return trimmedUrl;
}

export const API_BASE_URL = normalizeApiBaseUrl(
  isDebugBuild ? LOCAL_API_BASE_URL : PRODUCTION_API_BASE_URL,
);
export const API_BASE_URL_FALLBACKS = [
  API_BASE_URL,
  normalizeApiBaseUrl(isDebugBuild ? PRODUCTION_API_BASE_URL : LOCAL_API_BASE_URL),
];
// Dev-only escape hatch for the "you must link a device before using the app"
// gate, so screens behind it can be worked on without a pairable device on
// hand. Flip SKIP_DEVICE_LINKING_IN_DEV back to false once linking works.
// Hard-ANDed with __DEV__ so it can never take effect in a release build.
const SKIP_DEVICE_LINKING_IN_DEV = true;
export const DEV_SKIP_DEVICE_LINKING =
  isDebugBuild && SKIP_DEVICE_LINKING_IN_DEV;

if (DEV_SKIP_DEVICE_LINKING) {
  logs.info('[env] DEV bypass active: device-linking gate is disabled');
}

// TEMPORARY preview switch: makes the Visitors tab open straight onto the
// Add Member flow (Invite Family Member -> Invitation Sent) so those screens
// can be reviewed without going through the members list first. Flip to false
// to restore the normal Visitors -> members list landing. Hard-ANDed with
// __DEV__ so it can never take effect in a release build.
const PREVIEW_ADD_MEMBER_FLOW_IN_DEV = false;
export const DEV_PREVIEW_ADD_MEMBER_FLOW =
  isDebugBuild && PREVIEW_ADD_MEMBER_FLOW_IN_DEV;

if (DEV_PREVIEW_ADD_MEMBER_FLOW) {
  logs.info('[env] DEV preview active: Visitors tab opens the Add Member flow');
}

// TEMPORARY preview switch: walks the whole post-signup chain end to end —
// permission dialogs, Link a device, the QR scanner, Linked devices, the
// "Do you have a Dvaari Box?" question, then box linking or Home — so those
// screens can be demoed without pairable hardware. It does three things the
// normal flow will not:
//   1. overrides DEV_SKIP_DEVICE_LINKING, which otherwise sends a dev build
//      straight from the permission dialogs to Home and skips all of this;
//   2. lets a tap anywhere on the QR scanner stand in for a successful scan;
//   3. shows Linked devices between the scanner and the Dvaari Box question.
// Flip to false to restore the real flow. Hard-ANDed with __DEV__ so it can
// never take effect in a release build.
const DEMO_ONBOARDING_WALKTHROUGH_IN_DEV = true;
export const DEMO_ONBOARDING_WALKTHROUGH =
  isDebugBuild && DEMO_ONBOARDING_WALKTHROUGH_IN_DEV;

if (DEMO_ONBOARDING_WALKTHROUGH) {
  logs.info('[env] DEV demo active: full onboarding walkthrough, QR scanner tap-to-pass');
}

export const PRIVACY_POLICY_URL = 'https://grahnetra.com/privacy-policy';
export const TERMS_CONDITIONS_URL = 'https://grahnetra.com/terms-and-conditions';
