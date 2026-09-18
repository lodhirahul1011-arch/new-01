import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  check,
  openSettings,
  request,
  requestNotifications,
  RESULTS,
  type PermissionStatus,
} from 'react-native-permissions';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { SCREEN_PADDING_H } from '../../../theme/metrics';
import { AppAlert as Alert } from '../../../components/modals/AppAlert';
import SvgToggle from '../../../components/ui/SvgToggle';
import {
  checkAppPermissions,
  getPermissionForType,
  hasRequiredPermissions,
  type PermissionKey,
  type PermissionState,
} from '../utils/permissions';
import PermissionsSecureSvg from '../../../assets/icons/permmisons/Secure.svg';
import PermissionsToggleActiveSvg from '../../../assets/icons/permmisons/Toggle.svg';
import PermissionsToggleInactiveSvg from '../../../assets/icons/permmisons/Toggle (1).svg';
import PermissionsToggleInactiveDarkSvg from '../../../assets/icons/permmisons/toggle-inactive-dark.svg';

import {
  isDeliveryNotificationSupported,
  isNotificationAccessGranted,
  openNotificationAccessSettings,
} from '../../../services/notifications/deliveryNotificationService';

import MicSvg from '../../../assets/icons/permmisons/mic.svg';
import MicWhiteSvg from '../../../assets/icons/permmisons/mic-white.svg';
import SmsSvg from '../../../assets/icons/permmisons/sms.svg';
import SmsWhiteSvg from '../../../assets/icons/permmisons/sms-white.svg';
import LocationSvg from '../../../assets/icons/permmisons/location.svg';
import LocationWhiteSvg from '../../../assets/icons/permmisons/location-white.svg';
import CameraSvg from '../../../assets/icons/permmisons/camera.svg';
import CameraWhiteSvg from '../../../assets/icons/permmisons/camera-white.svg';
import BellSvg from '../../../assets/icons/permmisons/bell.svg';
import BellWhiteSvg from '../../../assets/icons/permmisons/bell-white.svg';
import { logs } from '../../../services/logs';
import { useTheme } from '../../../theme/ThemeContext';
import { useCanvasScreen, useUiScale } from '../../../theme/responsive';


type Props = NativeStackScreenProps<RootStackParamList, 'Permissions'>;

const THEME = {
  light: {
    background: '#F6F7FB',
    heading: '#000000',
    desc: '#6B7280',
    cardBg: '#FFFFFF',
    itemTitle: '#000000',
    itemSub: '#6B7280',
  },
  dark: {
    background: '#0F0F10',
    heading: '#FFFFFF',
    desc: 'rgba(255,255,255,0.6)',
    cardBg: '#1C1C1E',
    itemTitle: '#FFFFFF',
    itemSub: 'rgba(255,255,255,0.6)',
  },
};

type PermissionItemProps = {
  SvgIcon: React.ComponentType<any>;
  title: string;
  subtitle: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
  palette: { cardBg: string; itemTitle: string; itemSub: string };
  dark?: boolean;
};

function PermissionItem({
  SvgIcon,
  title,
  subtitle,
  enabled,
  disabled = false,
  onToggle,
  palette,
  dark = false,
}: PermissionItemProps) {
  const styles = useStyles();
  return (
    <View style={[styles.card, { backgroundColor: palette.cardBg }]}>
      <View style={styles.left}>
        <SvgIcon width={26} height={26} />

        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: palette.itemTitle }]}>{title}</Text>
          <Text style={[styles.sub, { color: palette.itemSub }]}>{subtitle}</Text>
        </View>
      </View>

      <SvgToggle
        value={enabled}
        onValueChange={onToggle}
        activeIcon={PermissionsToggleActiveSvg}
        inactiveIcon={dark ? PermissionsToggleInactiveDarkSvg : PermissionsToggleInactiveSvg}
        disabled={disabled}
      />
    </View>
  );
}

export default function Permissions({ navigation }: Props) {
  const styles = useStyles();
  const { canvasMinHeight, contentBottomGap } = useCanvasScreen(false);
  const { isDark } = useTheme();
  const palette = isDark ? THEME.dark : THEME.light;
  const [isEnablingAll, setIsEnablingAll] = useState(false);
  // Special access, granted in Settings rather than by a runtime dialog. Deliberately
  // optional — it is never part of hasAllRequiredPermissions.
  const [notificationAccess, setNotificationAccess] = useState(false);
  const [permissions, setPermissions] = useState<PermissionState>({
    notification: false,
    location: false,
    camera: false,
    mic: false,
  });

  const hasAllRequiredPermissions = hasRequiredPermissions(permissions);

  const updatePermissionState = (type: PermissionKey, value: boolean) => {
    setPermissions(current => ({ ...current, [type]: value }));
  };

  const permissionFlow: PermissionKey[] = [
    'notification',
    'location',
    'camera',
    'mic',
  ];

  const canTogglePermission = (type: PermissionKey) => {
    const index = permissionFlow.indexOf(type);
    if (index <= 0) return true;

    return permissionFlow.slice(0, index).every(step => permissions[step]);
  };

  const promptToOpenSettings = useCallback(() => {
    Alert.alert('Permission Blocked', 'Please enable permission from settings', [
      { text: 'Cancel' },
      {
        text: 'Open Settings',
        onPress: () => {
          logs.info('[permissions] opening app settings');
          openSettings().catch(error => {
            logs.error('[permissions] failed to open app settings', String(error));
          });
        },
      },
    ]);
  }, []);

  const syncPermission = async (
    type: Exclude<PermissionKey, 'notification'>,
  ) => {
    const permission = getPermissionForType(type);
    const status = await check(permission);
    updatePermissionState(type, status === RESULTS.GRANTED);
    return status;
  };

  const checkAllPermissions = useCallback(async () => {
    const latestPermissions = await checkAppPermissions();
    setPermissions(latestPermissions);

    if (isDeliveryNotificationSupported) {
      setNotificationAccess(await isNotificationAccessGranted());
    }
  }, []);

  // Sends the user to Settings; the AppState listener below re-checks on return.
  const requestNotificationAccess = useCallback(async () => {
    const opened = await openNotificationAccessSettings();
    if (!opened) {
      Alert.alert(
        'Unavailable',
        'Notification access settings could not be opened on this device.',
      );
    }
  }, []);

  // Runtime dialogs cannot cover this one — it is special access, granted on a Settings
  // screen. Without an explicit hand-off here, "Enable All Permissions" would silently
  // leave delivery detection off while appearing to have enabled everything.
  const offerNotificationAccess = useCallback(async () => {
    if (!isDeliveryNotificationSupported) return;
    if (await isNotificationAccessGranted()) return;

    Alert.alert(
      'One more step',
      'Dwaari reads courier notifications to detect your deliveries automatically. Android grants this from Settings.',
      [
        { text: 'Not now' },
        { text: 'Open Settings', onPress: () => void requestNotificationAccess() },
      ],
    );
  }, [requestNotificationAccess]);

  useEffect(() => {
    checkAllPermissions();
  }, [checkAllPermissions]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') checkAllPermissions();
    });
    return () => sub.remove();
  }, [checkAllPermissions]);

  // `silent` suppresses the blocked-permission Alert so a batch run can ask
  // for everything and raise a single prompt at the end, instead of stacking
  // one modal per blocked permission.
  const requestDevicePermission = async (
    type: Exclude<PermissionKey, 'notification'>,
    silent = false,
  ): Promise<PermissionStatus> => {
    const permission = getPermissionForType(type);
    logs.info('[permissions] requesting device permission', {
      type,
      platform: Platform.OS,
    });
    const result = await request(permission);

    updatePermissionState(type, result === RESULTS.GRANTED);

    if (result === RESULTS.BLOCKED && !silent) promptToOpenSettings();

    return result;
  };

  const requestPermission = async (
    type: PermissionKey,
    silent = false,
  ): Promise<PermissionStatus> => {
    if (type === 'notification') {
      const { status } = await requestNotifications(['alert', 'sound']);
      updatePermissionState('notification', status === RESULTS.GRANTED);
      logs.info('[permissions] notification permission requested', {
        status,
        platform: Platform.OS,
      });

      if (status === RESULTS.BLOCKED && !silent) promptToOpenSettings();

      return status;
    }

    const status = await requestDevicePermission(type, silent);

    if (status !== RESULTS.GRANTED) await syncPermission(type);

    return status;
  };

  const enableAll = async () => {
    try {
      setIsEnablingAll(true);
      logs.info('[permissions] enable all flow started', {
        platform: Platform.OS,
        flow: permissionFlow,
      });

      // Ask for every permission, even after a denial — these grants are
      // independent, so stopping at the first "Don't allow" meant one refusal
      // silently swallowed all the remaining dialogs.
      let anyBlocked = false;
      for (const type of permissionFlow) {
        const status = await requestPermission(type, true);
        if (status === RESULTS.BLOCKED) anyBlocked = true;
      }

      if (anyBlocked) promptToOpenSettings();

      await checkAllPermissions();
      await offerNotificationAccess();
      logs.info('[permissions] enable all flow completed', Platform.OS);
    } catch (error) {
      logs.error('[permissions] enable all flow failed', String(error));
    } finally {
      setIsEnablingAll(false);
    }
  };

  const nextStep = () => {
    if (!hasAllRequiredPermissions) {
      Alert.alert(
        'Permissions Required',
        'Notification, location, camera, and microphone permissions are required to continue.',
      );
      return;
    }

    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      <ScrollView contentContainerStyle={[styles.container, { minHeight: canvasMinHeight, paddingBottom: contentBottomGap }]}>
        <PermissionsSecureSvg width={104} height={104} />

        <Text style={[styles.heading, { color: palette.heading }]}>App Permissions</Text>

        <Text style={[styles.desc, { color: palette.desc }]}>
          Allow Dwaari to access these features for the best experience
        </Text>

        <View style={styles.list}>
          <PermissionItem
            SvgIcon={isDark ? BellWhiteSvg : BellSvg}
            title="Notifications"
            subtitle="Send you notifications"
            enabled={permissions.notification}
            disabled={!canTogglePermission('notification')}
            onToggle={() => requestPermission('notification')}
            palette={palette}
            dark={isDark}
          />

          <PermissionItem
            SvgIcon={isDark ? LocationWhiteSvg : LocationSvg}
            title="Location"
            subtitle="Access location"
            enabled={permissions.location}
            disabled={!canTogglePermission('location')}
            onToggle={() => requestPermission('location')}
            palette={palette}
            dark={isDark}
          />

          <PermissionItem
            SvgIcon={isDark ? CameraWhiteSvg : CameraSvg}
            title="Camera"
            subtitle="Use camera"
            enabled={permissions.camera}
            disabled={!canTogglePermission('camera')}
            onToggle={() => requestPermission('camera')}
            palette={palette}
            dark={isDark}
          />

          <PermissionItem
            SvgIcon={isDark ? MicWhiteSvg : MicSvg}
            title="Microphone"
            subtitle="Record audio"
            enabled={permissions.mic}
            disabled={!canTogglePermission('mic')}
            onToggle={() => requestPermission('mic')}
            palette={palette}
            dark={isDark}
          />

          {isDeliveryNotificationSupported ? (
            <PermissionItem
              SvgIcon={isDark ? SmsWhiteSvg : SmsSvg}
              title="Delivery updates"
              subtitle="Optional — detect deliveries from your notifications"
              enabled={notificationAccess}
              onToggle={requestNotificationAccess}
              palette={palette}
              dark={isDark}
            />
          ) : null}
        </View>

        <Pressable style={styles.enableBtn} onPress={enableAll}>
          <Text style={styles.enableText}>
            {isEnablingAll ? 'Enabling...' : 'Enable All Permissions'}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.homeBtn,
            !hasAllRequiredPermissions && styles.homeBtnDisabled,
          ]}
          onPress={nextStep}
        >
          <Text style={styles.homeText}>Continue to Home</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// SAME IMPORTS (unchanged)

function useStyles() {
  const scale = useUiScale();
  return useMemo(() => createStyles(scale), [scale]);
}

function createStyles(scale: number) {
  const s = (n: number) => n * scale;

  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: '#F6F7FB',
    },

    container: {
      paddingHorizontal: s(SCREEN_PADDING_H),
      paddingVertical: s(24),
      alignItems: 'center',
    },

    heading: {
      fontSize: s(22),
      fontWeight: '700',
    },

    desc: {
      textAlign: 'center',
      color: '#6B7280',
      marginTop: s(6),
      marginBottom: s(20),
      // Percentage of the padded content box, not a width frozen from a
      // module-scope Dimensions.get — that value never updated on rotation.
      width: '85%',
    },

    list: {
      width: '100%',
      gap: s(14),
    },

    card: {
      backgroundColor: '#fff',
      borderRadius: s(14),
      padding: s(16),
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      elevation: 2,
    },

    left: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(12),
      flex: 1,
      marginRight: s(12),
    },

    textWrap: {
      flex: 1,
    },

    title: {
      fontSize: s(16),
      fontWeight: '600',
    },

    sub: {
      fontSize: s(12),
      color: '#6B7280',
    },

    enableBtn: {
      marginTop: s(24),
      width: '100%',
      borderWidth: 1,
      borderColor: '#2563EB',
      borderRadius: s(12),
      paddingVertical: s(14),
      alignItems: 'center',
    },

    enableText: {
      color: '#2563EB',
      fontWeight: '600',
    },

    homeBtn: {
      marginTop: s(12),
      width: '100%',
      backgroundColor: '#2563EB',
      borderRadius: s(12),
      paddingVertical: s(16),
      alignItems: 'center',
    },

    homeBtnDisabled: {
      opacity: 0.5,
    },

    homeText: {
      color: '#fff',
      fontWeight: '700',
    },
  });
}
