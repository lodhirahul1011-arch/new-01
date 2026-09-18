import {NativeModules, Platform} from 'react-native';
import {logs} from '../logs';

export const DEFAULT_DELIVERY_NOTIFICATION_KEYWORDS = [
  'delivery',
  'arriving',
  'arriving today',
  'out for delivery',
  'scheduled',
  'shipment',
  'courier',
  'package',
  'order',
  'ready to deliver',
  'collect the order',
  'confirm your availability',
];

type DeliveryNotificationNativeModule = {
  isNotificationAccessEnabled?: () => Promise<boolean>;
  openNotificationAccessSettings?: () => Promise<boolean>;
  isFeatureEnabled?: () => Promise<boolean>;
  setFeatureEnabled?: (enabled: boolean) => Promise<boolean>;
  getReminderLeadMinutes?: () => Promise<number>;
  setReminderLeadMinutes?: (minutes: number) => Promise<number>;
  getKeywords?: () => Promise<string[]>;
  setKeywords?: (keywords: string[]) => Promise<boolean>;
  getMonitoredSources?: () => Promise<string[]>;
  scheduleReminder?: (
    scheduleId: string,
    title: string,
    scheduledForIso: string,
    leadMinutes: number,
  ) => Promise<boolean>;
  cancelReminder?: (scheduleId: string) => Promise<boolean>;
};

const nativeModule =
  Platform.OS === 'android'
    ? ((NativeModules as {DeliveryNotificationModule?: DeliveryNotificationNativeModule})
        .DeliveryNotificationModule as DeliveryNotificationNativeModule | undefined)
    : undefined;

function ensureAndroidModule() {
  if (Platform.OS !== 'android') {
    logs.info('[delivery-notifications] Android-only feature skipped', Platform.OS);
    return null;
  }

  if (!nativeModule) {
    logs.error('[delivery-notifications] native module unavailable');
    return null;
  }

  return nativeModule;
}

export async function isDeliveryNotificationAccessEnabled() {
  const module = ensureAndroidModule();
  if (!module?.isNotificationAccessEnabled) return false;

  try {
    const enabled = await module.isNotificationAccessEnabled();
    logs.info('[delivery-notifications] notification access checked', {enabled});
    return enabled;
  } catch (error) {
    logs.error('[delivery-notifications] notification access check failed', error);
    return false;
  }
}

export async function openDeliveryNotificationAccessSettings() {
  const module = ensureAndroidModule();
  if (!module?.openNotificationAccessSettings) return false;

  try {
    const opened = await module.openNotificationAccessSettings();
    logs.info('[delivery-notifications] notification access settings opened');
    return opened;
  } catch (error) {
    logs.error('[delivery-notifications] notification access settings failed', error);
    return false;
  }
}

export async function isDeliveryNotificationFeatureEnabled() {
  const module = ensureAndroidModule();
  if (!module?.isFeatureEnabled) return false;

  try {
    const enabled = await module.isFeatureEnabled();
    logs.info('[delivery-notifications] feature state checked', {enabled});
    return enabled;
  } catch (error) {
    logs.error('[delivery-notifications] feature state check failed', error);
    return false;
  }
}

export async function setDeliveryNotificationFeatureEnabled(enabled: boolean) {
  const module = ensureAndroidModule();
  if (!module?.setFeatureEnabled) return false;

  try {
    const nextEnabled = await module.setFeatureEnabled(enabled);
    logs.info('[delivery-notifications] feature state updated', {enabled: nextEnabled});
    return nextEnabled;
  } catch (error) {
    logs.error('[delivery-notifications] feature state update failed', error);
    return false;
  }
}

export async function isDeliveryNotificationPermissionReady() {
  if (Platform.OS !== 'android') {
    logs.info('[delivery-notifications] permission readiness skipped on non-Android', Platform.OS);
    return true;
  }

  try {
    const [accessEnabled, featureEnabled] = await Promise.all([
      isDeliveryNotificationAccessEnabled(),
      isDeliveryNotificationFeatureEnabled(),
    ]);
    const ready = accessEnabled && featureEnabled;
    logs.info('[delivery-notifications] permission readiness checked', {
      accessEnabled,
      featureEnabled,
      ready,
    });
    return ready;
  } catch (error) {
    logs.error('[delivery-notifications] permission readiness check failed', error);
    return false;
  }
}

export async function getDeliveryReminderLeadMinutes() {
  const module = ensureAndroidModule();
  if (!module?.getReminderLeadMinutes) return 60;

  try {
    const minutes = await module.getReminderLeadMinutes();
    logs.info('[delivery-notifications] reminder lead read', {minutes});
    return Number.isFinite(minutes) ? minutes : 60;
  } catch (error) {
    logs.error('[delivery-notifications] reminder lead read failed', error);
    return 60;
  }
}

export async function setDeliveryReminderLeadMinutes(minutes: number) {
  const module = ensureAndroidModule();
  if (!module?.setReminderLeadMinutes) return 60;

  try {
    const nextMinutes = await module.setReminderLeadMinutes(minutes);
    logs.info('[delivery-notifications] reminder lead updated', {minutes: nextMinutes});
    return nextMinutes;
  } catch (error) {
    logs.error('[delivery-notifications] reminder lead update failed', error);
    return 60;
  }
}

export async function getDeliveryNotificationKeywords() {
  const module = ensureAndroidModule();
  if (!module?.getKeywords) return DEFAULT_DELIVERY_NOTIFICATION_KEYWORDS;

  try {
    const keywords = await module.getKeywords();
    logs.info('[delivery-notifications] keywords read', {count: keywords.length});
    return keywords.length ? keywords : DEFAULT_DELIVERY_NOTIFICATION_KEYWORDS;
  } catch (error) {
    logs.error('[delivery-notifications] keywords read failed', error);
    return DEFAULT_DELIVERY_NOTIFICATION_KEYWORDS;
  }
}

export async function setDeliveryNotificationKeywords(keywords: string[]) {
  const module = ensureAndroidModule();
  if (!module?.setKeywords) return false;

  try {
    await module.setKeywords(keywords);
    logs.info('[delivery-notifications] keywords updated', {count: keywords.length});
    return true;
  } catch (error) {
    logs.error('[delivery-notifications] keywords update failed', error);
    return false;
  }
}

export async function getDeliveryNotificationMonitoredSources() {
  const module = ensureAndroidModule();
  if (!module?.getMonitoredSources) return [];

  try {
    const sources = await module.getMonitoredSources();
    logs.info('[delivery-notifications] monitored sources read', {count: sources.length});
    return sources;
  } catch (error) {
    logs.error('[delivery-notifications] monitored sources read failed', error);
    return [];
  }
}

export async function scheduleDeliveryReminder(options: {
  scheduleId: string;
  title: string;
  scheduledForIso: string;
  leadMinutes: number;
}) {
  const module = ensureAndroidModule();
  if (!module?.scheduleReminder) return false;

  try {
    const scheduled = await module.scheduleReminder(
      options.scheduleId,
      options.title,
      options.scheduledForIso,
      options.leadMinutes,
    );
    logs.info('[delivery-notifications] reminder scheduled from JS', {
      scheduleId: options.scheduleId,
      scheduled,
    });
    return scheduled;
  } catch (error) {
    logs.error('[delivery-notifications] reminder schedule failed from JS', error);
    return false;
  }
}

export async function cancelDeliveryReminder(scheduleId: string) {
  const module = ensureAndroidModule();
  if (!module?.cancelReminder) return false;

  try {
    const cancelled = await module.cancelReminder(scheduleId);
    logs.info('[delivery-notifications] reminder cancelled from JS', {
      scheduleId,
      cancelled,
    });
    return cancelled;
  } catch (error) {
    logs.error('[delivery-notifications] reminder cancel failed from JS', error);
    return false;
  }
}
