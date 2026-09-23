import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  useWindowDimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SvgProps } from 'react-native-svg';

import type { SettingsStackParamList } from '../../../navigation/tabs/stacks/SettingsStack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import BlueHeader from '../../../components/layout/BlueHeader';
import ConfirmModal from '../../../components/modals/ConfirmModal';
import SvgToggle from '../../../components/ui/SvgToggle';
import { useAccountSessionCleanup } from '../../../hooks/useAccountSessionCleanup';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { authActions } from '../../../store/slices/authSlice';
import { preferencesActions } from '../../../store/slices/preferencesSlice';
import {
  useUnregisterPushTokenMutation,
} from '../../../services/api/notificationsApi';
import {
  getCachedProfileImage,
  setCachedProfileImage as persistCachedProfileImage,
} from '../../../services/storage/profileStorage';
import {
  getStoredPushToken,
} from '../../../services/notifications/pushNotifications';
import { prefetchRemoteImages } from '../../../services/storage/imagePrefetch';
import {
  useLazyLinkedDevicesSummaryQuery,
  useLogoutMutation,
  usePatchTabletDeviceMutation,
  useUsersMeQuery,
} from '../../../services/api/authApi';
import { useAppTranslation } from '../../../services/i18n';
import { logs } from '../../../services/logs';
import { setStoredSimpleMode } from '../../../services/storage/simpleModeStorage';
import SettingsChevronSvg from '../../../assets/icons/settings/elements.svg';
import SettingsDeviceSvg from '../../../assets/icons/settings/Container.svg';
import SettingsLinkedSvg from '../../../assets/icons/settings/Icon.svg';
import SettingsNfcSvg from '../../../assets/icons/settings/credit-card.svg';
import SettingsHelpSvg from '../../../assets/icons/settings/help-square.svg';
import SettingsLogoutSvg from '../../../assets/icons/settings/logout-01.svg';
import SettingsNotificationsSvg from '../../../assets/icons/settings/notification-02.svg';
import SettingsToggleActiveSvg from '../../../assets/icons/settings/Toggle.svg';
import SettingsLanguageSvg from '../../../assets/icons/settings/uil_letter-hindi-a.svg';
import SettingsUserSvg from '../../../assets/icons/settings/user.svg';
import ToggleInactiveSvg from '../../../assets/icons/common/Toggle (1).svg';
import LanguageSvg from '../../../assets/icons/settings/language.svg';

type Props = NativeStackScreenProps<SettingsStackParamList, 'SettingsHome'>;

type Row = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<SvgProps>;
  danger?: boolean;
  trailing?: 'chevron' | 'switch';
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  onPress?: () => void;
};

function getInitials(fullName?: string) {
  if (!fullName) return 'U';

  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  const first = parts[0]?.charAt(0) ?? '';
  const second = parts.length > 1 ? parts[1]?.charAt(0) ?? '' : '';

  const value = (first + second).toUpperCase();
  return value || 'U';
}

function getUserProfileImage(
  user?: {
    profileImage?: string;
    photoUrl?: string;
    avatarUrl?: string;
    avatar?: {
      url?: string;
    };
  } | null,
) {
  const value =
    user?.profileImage || user?.photoUrl || user?.avatarUrl || user?.avatar?.url || '';

  if (typeof value !== 'string') return '';

  const normalizedValue = value.trim();

  if (!normalizedValue) return '';
  if (/^https?:\/\/ik\.imagekit\.io\//i.test(normalizedValue)) return normalizedValue;
  return '';
}

export default function SettingsHome({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const { width } = useWindowDimensions();
  const { t } = useAppTranslation();
  const clearLocalSession = useAccountSessionCleanup();

  const isCompact = width < 360;

  const authUser = useAppSelector(state => state.auth.user);
  const accessToken = useAppSelector(state => state.auth.accessToken);
  const simpleMode = useAppSelector(
    state => state.preferences.simpleModeEnabled,
  );

  const [logoutVisible, setLogoutVisible] = useState(false);
  const [logoutInFlight, setLogoutInFlight] = useState(false);
  const [cachedProfileImage, setCachedProfileImage] = useState('');

  const shouldFetchMe = !!accessToken;

  const { data: meData } = useUsersMeQuery(undefined, {
    skip: !shouldFetchMe,
  });

  const [logoutUser, { isLoading: isLoggingOut }] = useLogoutMutation();
  const [unregisterPushToken] = useUnregisterPushTokenMutation();
  const [getLinkedDevicesSummary] = useLazyLinkedDevicesSummaryQuery();
  const [patchTabletDevice] = usePatchTabletDeviceMutation();
  const lastSyncedUserSignature = useRef<string>('');
  const logoutInFlightRef = useRef(false);

  useEffect(() => {
    if (!meData?.user) {
      return;
    }

    const nextProfileImage = getUserProfileImage(meData.user);
    const signature = JSON.stringify({
      _id: meData.user._id,
      name: meData.user.name ?? '',
      email: meData.user.email ?? '',
      phone: meData.user.phone ?? '',
      address: meData.user.address ?? '',
      profileImage: nextProfileImage,
    });

    if (signature === lastSyncedUserSignature.current) {
      return;
    }
    lastSyncedUserSignature.current = signature;

    dispatch(
      authActions.userUpdated({
        ...meData.user,
        profileImage: nextProfileImage,
      } as typeof meData.user),
    );
  }, [meData, dispatch]);

  useEffect(() => {
    const loadCachedPhoto = async () => {
      const userId = authUser?._id ?? meData?.user?._id;

      if (!userId) {
        setCachedProfileImage('');
        return;
      }

      const cachedPhoto = await getCachedProfileImage(userId);
      setCachedProfileImage(cachedPhoto ?? '');
    };

    loadCachedPhoto();
  }, [authUser, meData]);

  useEffect(() => {
    const syncProfileImageCache = async () => {
      const mergedUser = {
        ...(authUser ?? {}),
        ...(meData?.user ?? {}),
      };

      const userId = mergedUser?._id;
      const nextProfileImage = getUserProfileImage(mergedUser);

      if (!userId || !nextProfileImage) {
        return;
      }

      setCachedProfileImage(current =>
        current === nextProfileImage ? current : nextProfileImage,
      );

      await persistCachedProfileImage(userId, nextProfileImage);
    };

    syncProfileImageCache();
  }, [authUser, meData]);

  const resolvedUser = useMemo(
    () =>
      authUser || meData?.user
        ? {
            ...(authUser ?? {}),
            ...(meData?.user ?? {}),
          }
        : null,
    [authUser, meData],
  );

  const serverProfileImage = getUserProfileImage(resolvedUser);

  const user = {
    fullName: resolvedUser?.name ?? t('user'),
    email: resolvedUser?.email ?? resolvedUser?.phone ?? t('no_contact_info'),
    role: t('owner'),
    profileImage: serverProfileImage || cachedProfileImage,
  };

  useEffect(() => {
    prefetchRemoteImages([user.profileImage]);
  }, [user.profileImage]);

  const goToRootLogin = () => {
    const rootNavigation = navigation.getParent()?.getParent?.() as
      | {
          reset: (state: {
            index: number;
            routes: Array<{ name: keyof RootStackParamList }>;
          }) => void;
        }
      | undefined;

    rootNavigation?.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  const handleLogout = async () => {
    if (logoutInFlightRef.current || isLoggingOut) {
      logs.error('[settings] duplicate logout action ignored', {
        mutationLoading: isLoggingOut,
        localInFlight: logoutInFlightRef.current,
      });
      return;
    }

    try {
      logoutInFlightRef.current = true;
      setLogoutInFlight(true);
      logs.info('[settings] logout requested');
      const pushToken = await getStoredPushToken();
      if (pushToken) {
        try {
          await unregisterPushToken({ token: pushToken }).unwrap();
          logs.info('[settings] push token unregistered before logout');
        } catch {
          logs.error('[settings] push token unregister failed before logout');
        }
      }

      await logoutUser({ fcmToken: pushToken }).unwrap();
      logs.info('[settings] backend logout completed');
    } catch (error) {
      logs.error('[settings] backend logout failed; clearing local session', String(error));
    } finally {
      logs.info('[settings] logout local session cleanup started');
      await clearLocalSession();
      setLogoutVisible(false);
      setLogoutInFlight(false);
      logoutInFlightRef.current = false;
      goToRootLogin();
    }
  };
  const rootNavigation = navigation.getParent()?.getParent?.();
  const logoutBusy = logoutInFlight || isLoggingOut;

  const handleSimpleModeChange = useCallback(
    async (value: boolean) => {
      dispatch(preferencesActions.simpleModeUpdated(value));

      try {
        await setStoredSimpleMode(value);

        const linkedResp = await getLinkedDevicesSummary().unwrap();
        const linkedTablets = (linkedResp?.data?.items || []).filter(
          item => String(item?.type || '').toLowerCase() === 'tablet',
        );

        if (linkedTablets.length) {
          await Promise.all(
            linkedTablets.map(item =>
              patchTabletDevice({
                deviceId: item.deviceId,
                simpleModeEnabled: value,
              }).unwrap(),
            ),
          );
        }
      } catch {
        dispatch(preferencesActions.simpleModeUpdated(!value));
        try {
          await setStoredSimpleMode(!value);
        } catch {
          // ignore rollback persistence failure
        }
        return;
      }

      if (value) {
        navigation.getParent()?.navigate?.('HomeStack' as never);
      }
    },
    [
      dispatch,
      getLinkedDevicesSummary,
      navigation,
      patchTabletDevice,
    ],
  );

  const rows = useMemo<Row[]>(
    () => ([
      {
        id: 'edit',
        title: t('edit_profile'),
        subtitle: t('update_personal_information'),
        icon: SettingsUserSvg,
        trailing: 'chevron',
        onPress: () => navigation.navigate('EditProfile'),
      },
      {
        id: 'linked',
        title: t('linked_devices'),
        subtitle: t('manage_connected_devices'),
        icon: SettingsLinkedSvg,
        trailing: 'chevron',
        onPress: () => navigation.navigate('LinkedDevices'),
      },
      {
        id: 'device',
        title: t('device_management'),
        subtitle: t('customize_wallpaper_connect_apps'),
        icon: SettingsDeviceSvg,
        trailing: 'chevron',
        onPress: () =>  rootNavigation?.navigate?.('DeviceManagement' as never),
      },
      {
        id: 'notif',
        title: t('notifications'),
        subtitle: t('manage_notifications_performances'),
        icon: SettingsNotificationsSvg,
        trailing: 'chevron',
        onPress: () =>  rootNavigation?.navigate?.('NotificationSettingsScreen' as never),
      },
      {
        id: 'nfc',
        title: t('nfc_cards'),
        subtitle: t('manage_your_access_cards'),
        icon: SettingsNfcSvg,
        trailing: 'chevron',
        onPress: () =>  rootNavigation?.navigate?.('NfcCard' as never),
      },
      {
        id: 'lang',
        title: t('language'),
        subtitle: t('change_app_language'),
        icon: LanguageSvg,
        trailing: 'chevron',
        onPress: () =>  rootNavigation?.navigate?.('ChangeLanguage' as never),
      },
      {
        id: 'help',
        title: t('help_support'),
        subtitle: t('faqs_contact_support'),
        icon: SettingsHelpSvg,
        trailing: 'chevron',
        onPress: () =>  rootNavigation?.navigate?.('HelpSupport' as never),
      },
      {
        id: 'simple-mode',
        title: t('simple_mode'),
        subtitle: t('activate_simple_mode'),
        icon: SettingsLanguageSvg,
        trailing: 'switch',
        switchValue: simpleMode,
        onSwitchChange: handleSimpleModeChange,
      },
      {
        id: 'account-settings',
        title: t('account_settings'),
        subtitle: t('account_settings_subtitle'),
        icon: SettingsUserSvg,
        trailing: 'chevron',
        onPress: () => navigation.navigate('AccountSettings'),
      },
      {
        id: 'signout',
        title: t('sign_out'),
        subtitle: t('logout_of_your_account'),
        icon: SettingsLogoutSvg,
        danger: true,
        onPress: () => {
          if (logoutBusy) {
            logs.error('[settings] logout modal open ignored while logout is running');
            return;
          }
          logs.info('[settings] logout confirmation opened');
          setLogoutVisible(true);
        },
      },
    ] satisfies Row[]).filter(row => row.id !== 'simple-mode'),
    [handleSimpleModeChange, logoutBusy, navigation, rootNavigation, simpleMode, t],
  );

  const renderAvatar = () => {
    const hasProfileImage =
      typeof user.profileImage === 'string' &&
      user.profileImage.trim().length > 0;

    if (hasProfileImage) {
      return (
        <Image
          source={{ uri: user.profileImage }}
          style={styles.avatarImage}
          resizeMode="cover"
          fadeDuration={0}
        />
      );
    }

    return (
      <View style={styles.avatarFallback}>
        <Text style={styles.avatarText}>{getInitials(user.fullName)}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader title={t('profile')} large leftAligned />

      <View
        style={[styles.profileStrip, isCompact && styles.profileStripCompact]}
      >
        {renderAvatar()}

        <View style={styles.profileInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {user.fullName}
          </Text>
          <Text style={styles.userEmail} numberOfLines={1}>
            {user.email}
          </Text>
        </View>

        <View style={styles.rolePill}>
          <Text style={styles.roleText}>{user.role}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          isCompact && styles.contentCompact,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {rows.map(row => {
          const isDanger = !!row.danger;
          const isSwitch = row.trailing === 'switch';
          const RowIcon = row.icon;

          return (
            <Pressable
              key={row.id}
              onPress={row.onPress}
              disabled={isSwitch || (row.id === 'signout' && logoutBusy)}
              style={[
                styles.card,
                isDanger && styles.cardDanger,
                row.id === 'signout' && logoutBusy && styles.cardDisabled,
              ]}
            >
              <View style={[styles.iconBox, isDanger && styles.iconBoxDanger]}>
                <RowIcon width={24} height={24} />
              </View>

              <View style={styles.cardBody}>
                <Text
                  style={[styles.cardTitle, isDanger && styles.cardTitleDanger]}
                >
                  {row.title}
                </Text>
                <Text style={styles.cardSub}>{row.subtitle}</Text>
              </View>

              {row.trailing === 'chevron' ? (
                <SettingsChevronSvg
                  width={8}
                  height={14}
                  style={isDanger ? styles.chevronDanger : undefined}
                />
              ) : row.trailing === 'switch' ? (
                <SvgToggle
                  value={!!row.switchValue}
                  onValueChange={row.onSwitchChange ?? (() => {})}
                  activeIcon={SettingsToggleActiveSvg}
                  inactiveIcon={ToggleInactiveSvg}
                />
              ) : null}
            </Pressable>
          );
        })}

        <Text style={styles.footer}>
          {t('app_version_and_tagline')}
        </Text>
        <View style={styles.footerSpacer} />
      </ScrollView>

      <ConfirmModal
        visible={logoutVisible}
        title={t('sign_out')}
        message={t('sign_out_message')}
        confirmText={logoutBusy ? t('signing_out') : t('sign_out')}
        cancelText={t('cancel')}
        confirmDisabled={logoutBusy}
        confirmVariant="primary"
        onCancel={() => {
          if (logoutBusy) {
            logs.error('[settings] logout confirmation cancel ignored while logout is running');
            return;
          }
          logs.info('[settings] logout confirmation cancelled');
          setLogoutVisible(false);
        }}
        onConfirm={handleLogout}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },

  profileStrip: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -20,
    gap: 12,
  },

  profileStripCompact: {
    paddingHorizontal: 14,
  },

  avatarFallback: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: '#5283EF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarImage: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
  },

  avatarText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 22,
  },

  profileInfo: {
    flex: 1,
  },

  userName: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 18,
  },

  userEmail: {
    marginTop: 4,
    color: '#DBEAFE',
    fontWeight: '700',
    fontSize: 12,
  },

  rolePill: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  roleText: {
    color: '#2563EB',
    fontWeight: '900',
    fontSize: 12,
  },

  content: {
    padding: 16,
    gap: 14,
  },

  contentCompact: {
    padding: 12,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  cardDanger: {
    backgroundColor: '#FFF5F5',
    borderColor: '#EF4444',
  },
  cardDisabled: {
    opacity: 0.55,
  },

  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconBoxDanger: {
    backgroundColor: '#FEE2E2',
  },

  cardBody: {
    flex: 1,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },

  cardTitleDanger: {
    color: '#111827',
  },

  cardSub: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    lineHeight: 16,
  },

  chevronIcon: {
    width: 8,
    height: 14,
  },

  chevronDanger: {
    opacity: 0.7,
  },

  footer: {
    marginTop: 8,
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },

  footerSpacer: {
    height: 10,
  },
});
