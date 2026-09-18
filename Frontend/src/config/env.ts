import { logs } from '../services/logs';

// For debug builds, Android devices should call the local backend through
// `adb reverse tcp:5000 tcp:5000`, so use localhost rather than a stale LAN IP.
const LOCAL_API_BASE_URL = 'http://192.168.1.7:5000'; // PC WiFi IP - change back to localhost if using emulator
const PRODUCTION_API_BASE_URL = 'https://api.grahnetra.com';
const USE_LOCAL_BACKEND = true; // Use local development backend
const isDebugBuild = (typeof __DEV__ !== 'undefined' && __DEV__) || USE_LOCAL_BACKEND;

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
const SKIP_DEVICE_LINKING_IN_DEV = true;
export const DEV_SKIP_DEVICE_LINKING =
  isDebugBuild && SKIP_DEVICE_LINKING_IN_DEV;

if (DEV_SKIP_DEVICE_LINKING) {
  logs.info('[env] DEV bypass active: device-linking gate is disabled');
}

// TEMPORARY preview switch: makes the Visitors tab open straight onto the
// Add Member flow (Invite Family Member -> Invitation Sent) so those screens
// can be reviewed without going through the members list first.
const PREVIEW_ADD_MEMBER_FLOW_IN_DEV = false;
export const DEV_PREVIEW_ADD_MEMBER_FLOW =
  isDebugBuild && PREVIEW_ADD_MEMBER_FLOW_IN_DEV;

if (DEV_PREVIEW_ADD_MEMBER_FLOW) {
  logs.info('[env] DEV preview active: Visitors tab opens the Add Member flow');
}

// TEMPORARY preview switch: walks the whole post-signup chain end to end —
// permission dialogs, Link a device, the QR scanner, Linked devices, the
// "Do you have a Dvaari Box?" question, then box linking or Home — so those
// screens can be demoed without pairable hardware.
const DEMO_ONBOARDING_WALKTHROUGH_IN_DEV = true;
export const DEMO_ONBOARDING_WALKTHROUGH =
  isDebugBuild && DEMO_ONBOARDING_WALKTHROUGH_IN_DEV;

if (DEMO_ONBOARDING_WALKTHROUGH) {
  logs.info('[env] DEV demo active: full onboarding walkthrough, QR scanner tap-to-pass');
}
export const PRIVACY_POLICY_URL = 'https://grahnetra.com/privacy-policy';
export const TERMS_CONDITIONS_URL = 'https://grahnetra.com/terms-and-conditions';

export const GOOGLE_WEB_CLIENT_ID = '822625137979-dpgm251kc70m3j3lh5gbkgk45foe9uob.apps.googleusercontent.com';
export const CONTENT_POLICY_URL = 'https://grahnetra.com/content-policy';
