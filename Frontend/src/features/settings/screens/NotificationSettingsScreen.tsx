import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { AppAlert as Alert } from '../../../components/modals/AppAlert';
import BlueHeader from '../../../components/layout/BlueHeader';
import SvgToggle from '../../../components/ui/SvgToggle';
import NotificationToggleActiveSvg from '../../../assets/icons/notification/Button.svg';
import NotificationToggleInactiveSvg from '../../../assets/icons/notification/Toggle (1).svg';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  notificationsApi,
  type NotificationPreferences,
  useGetNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
} from '../../../services/api/notificationsApi';
import { useAppTranslation } from '../../../services/i18n';
import { logs } from '../../../services/logs';
import { openNotificationSoundSettings } from '../../../services/notifications/pushNotifications';
import RightArrowSvg from '../../../assets/icons/settings/help-supprot/right-arrow.svg';
import { useAppDispatch } from '../../../store/hooks';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationSettingsScreen'>;

export default function NotificationSettingsScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const { t } = useAppTranslation();
  const { data, isLoading, isFetching } = useGetNotificationPreferencesQuery();
  const [updateNotificationPreferences] = useUpdateNotificationPreferencesMutation();
  const [settings, setSettings] = useState<NotificationPreferences>({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  });
  const [isOpeningSoundSettings, setIsOpeningSoundSettings] = useState(false);
  const pendingPreferencesRef = useRef<Partial<NotificationPreferences>>({});

  useEffect(() => {
    if (data) {
      logs.info('[notification-settings] preferences loaded');
      setSettings({ ...data, ...pendingPreferencesRef.current });
    }
  }, [data]);

  const handleToggle = async (key: keyof typeof settings, value: boolean) => {
    Object.assign(pendingPreferencesRef.current, { [key]: value });
    setSettings(prev => ({ ...prev, [key]: value }));
    dispatch(
      notificationsApi.util.updateQueryData(
        'getNotificationPreferences',
        undefined,
        cachedSettings => {
          Object.assign(cachedSettings, { [key]: value });
        },
      ),
    );

    try {
      logs.info('[notification-settings] preference update started', { key, value });
      const persistedSettings = await updateNotificationPreferences({
        [key]: value,
      }).unwrap();

      if (pendingPreferencesRef.current[key] !== value) {
        logs.info('[notification-settings] superseded preference response ignored', {
          key,
          value,
        });
        return;
      }

      delete pendingPreferencesRef.current[key];
      const persistedValue = persistedSettings[key];
      const nextValue =
        typeof persistedValue === 'boolean' ? persistedValue : value;

      setSettings(prev => ({ ...prev, [key]: nextValue }));
      dispatch(
        notificationsApi.util.updateQueryData(
          'getNotificationPreferences',
          undefined,
          cachedSettings => {
            Object.assign(cachedSettings, { [key]: nextValue });
          },
        ),
      );
      logs.info('[notification-settings] preference update completed', {
        key,
        value: nextValue,
      });
    } catch (error) {
      logs.error('Failed to update notification setting', { key, error });
      if (pendingPreferencesRef.current[key] === value) {
        delete pendingPreferencesRef.current[key];
        setSettings(prev => ({ ...prev, [key]: !value }));
        dispatch(
          notificationsApi.util.updateQueryData(
            'getNotificationPreferences',
            undefined,
            cachedSettings => {
              Object.assign(cachedSettings, { [key]: !value });
            },
          ),
        );
      }
    }
  };

  const handleSoundPress = async () => {
    if (isOpeningSoundSettings) {
      logs.info('[notification-settings] duplicate sound settings press ignored');
      return;
    }

    setIsOpeningSoundSettings(true);
    logs.info('[notification-settings] sound settings requested');
    try {
      await openNotificationSoundSettings();
      logs.info('[notification-settings] sound settings request completed');
    } catch (error) {
      logs.error('[notification-settings] sound settings request failed', {
        error,
      });
      Alert.alert(t('unable_to_open_link'), t('please_try_again_later'));
    } finally {
      setIsOpeningSoundSettings(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title={t('notifications')}
        onBackPress={() => navigation.goBack()}
        compact
      />
      {isLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="small" color="#111827" />
          <Text style={styles.loaderText}>{t('loading_notification_preferences')}</Text>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionDescription}>
          {t('manage_notification_preferences')}
          {isFetching ? ` ${t('syncing_parenthetical')}` : ''}
        </Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t('doorbell_alerts')}</Text>
              <Text style={styles.rowSubtitle}>
                {t('doorbell_alerts_hint')}
              </Text>
            </View>
            <SvgToggle
              value={settings.doorbellAlerts}
              onValueChange={val => handleToggle('doorbellAlerts', val)}
              activeIcon={NotificationToggleActiveSvg}
              inactiveIcon={NotificationToggleInactiveSvg}
            />
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t('delivery_notifications')}</Text>
              <Text style={styles.rowSubtitle}>
                {t('delivery_notifications_hint')}
              </Text>
            </View>
            <SvgToggle
              value={settings.deliveryNotifications}
              onValueChange={val => handleToggle('deliveryNotifications', val)}
              activeIcon={NotificationToggleActiveSvg}
              inactiveIcon={NotificationToggleInactiveSvg}
            />
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t('visitor_recognition')}</Text>
              <Text style={styles.rowSubtitle}>
                {t('visitor_recognition_hint')}
              </Text>
            </View>
            <SvgToggle
              value={settings.visitorRecognition}
              onValueChange={val => handleToggle('visitorRecognition', val)}
              activeIcon={NotificationToggleActiveSvg}
              inactiveIcon={NotificationToggleInactiveSvg}
            />
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t('security_alerts')}</Text>
              <Text style={styles.rowSubtitle}>
                {t('security_alerts_hint')}
              </Text>
            </View>
            <SvgToggle
              value={settings.securityAlerts}
              onValueChange={val => handleToggle('securityAlerts', val)}
              activeIcon={NotificationToggleActiveSvg}
              inactiveIcon={NotificationToggleInactiveSvg}
            />
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t('device_status')}</Text>
              <Text style={styles.rowSubtitle}>
                {t('device_status_hint')}
              </Text>
            </View>
            <SvgToggle
              value={settings.deviceStatus}
              onValueChange={val => handleToggle('deviceStatus', val)}
              activeIcon={NotificationToggleActiveSvg}
              inactiveIcon={NotificationToggleInactiveSvg}
            />
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t('weekly_summary')}</Text>
              <Text style={styles.rowSubtitle}>
                {t('weekly_summary_hint')}
              </Text>
            </View>
            <SvgToggle
              value={settings.weeklySummary}
              onValueChange={val => handleToggle('weeklySummary', val)}
              activeIcon={NotificationToggleActiveSvg}
              inactiveIcon={NotificationToggleInactiveSvg}
            />
          </View>
        </View>

        {/* Sound & Vibration */}

        <Text style={styles.sectionTitle}>{t('sound_and_vibration')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('sound')}
          accessibilityHint={t('choose_notification_sound_hint')}
          disabled={isOpeningSoundSettings}
          onPress={handleSoundPress}
          style={({ pressed }) => [
            styles.card,
            pressed && styles.cardPressed,
          ]}>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>{t('sound')}</Text>
            <View style={styles.rowAction}>
              {isOpeningSoundSettings ? (
                <ActivityIndicator size="small" color="#6B7280" />
              ) : (
                <>
                  <Text style={styles.rowValue}>{t('choose_sound')}</Text>
                  <RightArrowSvg width={7} height={12} />
                </>
              )}
            </View>
          </View>
        </Pressable>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t('vibration')}</Text>
            </View>
            <SvgToggle
              value={settings.vibration}
              onValueChange={val => handleToggle('vibration', val)}
              activeIcon={NotificationToggleActiveSvg}
              inactiveIcon={NotificationToggleInactiveSvg}
            />
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
  },
  loaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  loaderText: {
    fontSize: 13,
    color: '#6B7280',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 24,
    marginBottom: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginBottom: 18,
  },
  cardPressed: {
    backgroundColor: '#F9FAFB',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowText: {
    flex: 1,
    paddingRight: 10,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  rowSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  rowValue: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '600',
  },
  rowAction: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bottomSpacer: {
    height: 20,
  },
});
