import {Platform} from 'react-native';
import {
  check,
  checkNotifications,
  PERMISSIONS,
  request,
  requestNotifications,
  RESULTS,
  type Permission,
} from 'react-native-permissions';
import { logs } from '../../../services/logs';

export type PermissionKey =
  | 'notification'
  | 'location'
  | 'camera'
  | 'mic';

export type PermissionState = Record<PermissionKey, boolean>;

export const REQUIRED_PERMISSION_KEYS: PermissionKey[] = [
  'notification',
  'location',
  'camera',
  'mic',
];

export const getPermissionForType = (
  type: Exclude<PermissionKey, 'notification'>,
): Permission => {
  switch (type) {
    case 'location':
      return Platform.OS === 'ios'
        ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
        : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;
    case 'camera':
      return Platform.OS === 'ios'
        ? PERMISSIONS.IOS.CAMERA
        : PERMISSIONS.ANDROID.CAMERA;
    case 'mic':
      return Platform.OS === 'ios'
        ? PERMISSIONS.IOS.MICROPHONE
        : PERMISSIONS.ANDROID.RECORD_AUDIO;
  }
};

export const hasRequiredPermissions = (permissions: PermissionState) =>
  REQUIRED_PERMISSION_KEYS.every(key => permissions[key]);

// Requests every permission via its native OS dialog, in the same order as
// Permissions.tsx's "Enable All" flow, but with no dedicated screen UI — for
// flows that just need the dialogs fired and don't want to show the
// toggle-list screen.
//
// Each permission is requested independently and a denial never short-
// circuits the rest. These are genuinely unrelated grants: notifications
// aren't a prerequisite for camera, so gating on them meant a single "Don't
// allow" on the first dialog silently skipped every remaining prompt. That
// bites hardest on Android 13+, where POST_NOTIFICATIONS is auto-denied
// after two refusals and returns instantly with no UI at all.
const PERMISSION_STEP_TIMEOUT_MS = 20000;

// react-native-permissions can leave a request promise unsettled — most often
// when the hosting Activity is recreated while a dialog is on screen. That
// used to be hidden, because a denied notification permission short-circuited
// the whole sequence; now that each permission is asked for independently, one
// stalled call would strand RequestPermissions on "Setting things up…"
// forever. Every step is bounded so the flow always terminates, and a timeout
// is logged with the step that hung rather than failing silently.
async function withTimeout<T>(
  promise: Promise<T>,
  step: string,
): Promise<T | null> {
  return new Promise<T | null>(resolve => {
    let settled = false;

    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      logs.error('[permissions] request timed out', { step });
      resolve(null);
    }, PERMISSION_STEP_TIMEOUT_MS);

    promise.then(finish).catch(error => {
      logs.error('[permissions] request failed', { step, error: String(error) });
      finish(null);
    });
  });
}

export const requestAllPermissions = async (): Promise<PermissionState> => {
  logs.info('[permissions] requesting all permissions', Platform.OS);

  const notification = await withTimeout(
    requestNotifications(['alert', 'sound']),
    'notification',
  );
  logs.info('[permissions] notification permission requested', {
    status: notification?.status ?? 'timed-out',
  });

  // If one native call stalls the rest almost certainly will too, so stop
  // asking rather than burning the full timeout three more times.
  let stalled = notification === null;

  for (const type of ['location', 'camera', 'mic'] as const) {
    if (stalled) {
      logs.info('[permissions] skipping request after earlier stall', { type });
      continue;
    }

    const status = await withTimeout(request(getPermissionForType(type)), type);
    stalled = status === null;
    logs.info('[permissions] device permission requested', {
      type,
      status: status ?? 'timed-out',
    });
  }

  const state = await withTimeout(checkAppPermissions(), 'check');
  return (
    state ?? {
      notification: false,
      location: false,
      camera: false,
      mic: false,
    }
  );
};

export const checkAppPermissions = async (): Promise<PermissionState> => {
  try {
    logs.info('[permissions] checking app permission state', Platform.OS);

    const [
      {status: notificationStatus},
      locationStatus,
      cameraStatus,
      micStatus,
    ] = await Promise.all([
      checkNotifications(),
      check(getPermissionForType('location')),
      check(getPermissionForType('camera')),
      check(getPermissionForType('mic')),
    ]);

    const state = {
      notification: notificationStatus === RESULTS.GRANTED,
      location: locationStatus === RESULTS.GRANTED,
      camera: cameraStatus === RESULTS.GRANTED,
      mic: micStatus === RESULTS.GRANTED,
    };
    logs.info('[permissions] app permission state checked', JSON.stringify(state));
    return state;
  } catch (error) {
    logs.error('[permissions] app permission state check failed', String(error));
    throw error;
  }
};
