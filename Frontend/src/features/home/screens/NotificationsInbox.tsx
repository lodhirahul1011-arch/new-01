import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import BlueHeader from '../../../components/layout/BlueHeader';
import ConfirmModal from '../../../components/modals/ConfirmModal';
import type { HomeStackParamList } from '../../../navigation/tabs/stacks/HomeStack';
import {
  clearNotificationInbox,
  getNotificationInboxItems,
  markAllNotificationInboxItemsRead,
  removeNotificationInboxItem,
  subscribeToNotificationInbox,
  type NotificationInboxItem,
} from '../../../services/notifications/notificationInbox';
import { useAppTranslation } from '../../../services/i18n';
import { logs } from '../../../services/logs';

type Props = NativeStackScreenProps<HomeStackParamList, 'NotificationsInbox'>;
type ClearConfirmation =
  | { kind: 'one'; notificationId: string }
  | { kind: 'all' };

const TYPE_META: Record<
  string,
  { label: string; accent: string; tone: string }
> = {
  doorbell_at_door: {
    label: 'Doorbell',
    accent: '#2563EB',
    tone: '#EAF2FF',
  },
  delivery_boy_at_door: {
    label: 'Delivery',
    accent: '#F59E0B',
    tone: '#FFF6E5',
  },
  upcoming_delivery_scheduled: {
    label: 'Delivery',
    accent: '#14B8A6',
    tone: '#E8FFFB',
  },
  tablet_offline: {
    label: 'Device',
    accent: '#EF4444',
    tone: '#FEECEC',
  },
  visitor_recognition: {
    label: 'Visitor',
    accent: '#8B5CF6',
    tone: '#F3EEFF',
  },
  security_alert: {
    label: 'Security',
    accent: '#DC2626',
    tone: '#FDEBEC',
  },
  weekly_summary: {
    label: 'Summary',
    accent: '#0F766E',
    tone: '#E8FFFC',
  },
  test_notification: {
    label: 'Test',
    accent: '#6B7280',
    tone: '#F3F4F6',
  },
  general: {
    label: 'Alert',
    accent: '#2563EB',
    tone: '#EEF4FF',
  },
};

function getTimestampLabel(value: string, t: (key: string, options?: Record<string, unknown>) => string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t('just_now');
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return t('just_now');
  if (diffMinutes < 60) return t('minutes_ago', { count: diffMinutes });

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return t('hours_ago', { count: diffHours });

  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function groupNotifications(items: NotificationInboxItem[]) {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();

  const groups = new Map<string, NotificationInboxItem[]>();
  items.forEach(item => {
    const date = new Date(item.createdAt);
    const dateKey = Number.isNaN(date.getTime())
      ? 'Earlier'
      : date.toDateString() === today
      ? 'Today'
      : date.toDateString() === yesterday
      ? 'Yesterday'
      : 'Earlier';

    const bucket = groups.get(dateKey) || [];
    bucket.push(item);
    groups.set(dateKey, bucket);
  });

  return Array.from(groups.entries());
}

export default function NotificationsInbox({ navigation }: Props) {
  const { t } = useAppTranslation();
  const [items, setItems] = useState<NotificationInboxItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [clearConfirmation, setClearConfirmation] =
    useState<ClearConfirmation | null>(null);

  const loadInbox = useCallback(async () => {
    try {
      logs.info('[notifications] inbox load started');
      const nextItems = await getNotificationInboxItems();
      setItems(nextItems);
      await markAllNotificationInboxItemsRead();
      setItems(prev => prev.map(item => ({ ...item, read: true })));
      logs.info('[notifications] inbox load completed', { count: nextItems.length });
    } catch (error) {
      logs.error('[notifications] inbox load failed', String(error));
      throw error;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadInbox().catch(() => undefined);
      const unsubscribe = subscribeToNotificationInbox(() => {
        loadInbox().catch(() => undefined);
      });

      return unsubscribe;
    }, [loadInbox]),
  );

  const groups = useMemo(() => groupNotifications(items), [items]);
  const unreadCount = useMemo(
    () => items.filter(item => !item.read).length,
    [items],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadInbox();
    } catch (error) {
      logs.error('[notifications] inbox refresh failed', String(error));
    } finally {
      setRefreshing(false);
    }
  }, [loadInbox]);

  const handleClearOne = useCallback((id: string) => {
    logs.info('[notifications] remove inbox item confirmation opened', { id });
    setClearConfirmation({ kind: 'one', notificationId: id });
  }, []);

  const handleClearAll = useCallback(() => {
    logs.info('[notifications] clear inbox confirmation opened', {
      count: items.length,
    });
    setClearConfirmation({ kind: 'all' });
  }, [items.length]);

  const handleCancelClear = useCallback(() => {
    logs.info('[notifications] clear confirmation cancelled', {
      kind: clearConfirmation?.kind,
    });
    setClearConfirmation(null);
  }, [clearConfirmation?.kind]);

  const handleConfirmClear = useCallback(async () => {
    const confirmation = clearConfirmation;
    if (!confirmation) {
      logs.error('[notifications] clear confirmation missing');
      return;
    }

    setClearConfirmation(null);

    if (confirmation.kind === 'one') {
      logs.info('[notifications] removing inbox item', {
        id: confirmation.notificationId,
      });
      setItems(currentItems =>
        currentItems.filter(item => item.id !== confirmation.notificationId),
      );
      try {
        await removeNotificationInboxItem(confirmation.notificationId);
        logs.info('[notifications] inbox item removed', {
          id: confirmation.notificationId,
        });
      } catch (error) {
        logs.error('[notifications] remove inbox item failed', String(error));
        await loadInbox().catch(loadError => {
          logs.error(
            '[notifications] inbox reload after remove failure failed',
            String(loadError),
          );
        });
      }
      return;
    }

    logs.info('[notifications] clearing inbox');
    setItems([]);
    try {
      await clearNotificationInbox();
      logs.info('[notifications] inbox cleared');
    } catch (error) {
      logs.error('[notifications] clear inbox failed', String(error));
      await loadInbox().catch(loadError => {
        logs.error(
          '[notifications] inbox reload after clear failure failed',
          String(loadError),
        );
      });
    }
  }, [clearConfirmation, loadInbox]);

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title={t('notifications')}
        subtitle={
          unreadCount > 0
            ? t('unread_notifications_count', { count: unreadCount })
            : t('all_recent_alerts_one_place')
        }
        onBackPress={() => navigation.goBack()}
        compact
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>{t('notification_center')}</Text>
              <Text style={styles.heroSubtitle}>
                {t('notification_center_hint')}
              </Text>
            </View>

            {items.length > 0 ? (
              <Pressable style={styles.clearAllButton} onPress={handleClearAll}>
                <Text style={styles.clearAllText}>{t('clear_all')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {groups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('no_notifications_yet')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('new_alerts_home_devices_hint')}
            </Text>
          </View>
        ) : (
          groups.map(([label, groupItems]) => (
            <View key={label} style={styles.groupWrap}>
              <Text style={styles.groupTitle}>{t(label.toLowerCase())}</Text>
              {groupItems.map(item => {
                const meta = TYPE_META[item.type] || TYPE_META.general;
                return (
                  <View key={item.id} style={styles.notificationCard}>
                    <View
                      style={[
                        styles.accentDot,
                        { backgroundColor: meta.accent },
                      ]}
                    />

                    <View style={styles.cardBody}>
                      <View style={styles.cardTopRow}>
                        <View
                          style={[
                            styles.categoryPill,
                            { backgroundColor: meta.tone },
                          ]}
                        >
                          <Text
                            style={[
                              styles.categoryText,
                              { color: meta.accent },
                            ]}
                          >
                            {t(meta.label.toLowerCase())}
                          </Text>
                        </View>

                        <View style={styles.cardTopActions}>
                          <Text style={styles.timeText}>
                            {getTimestampLabel(item.createdAt, t)}
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t('clear_notification')}
                            hitSlop={8}
                            style={styles.clearOneButton}
                            onPress={() => handleClearOne(item.id)}
                          >
                            <Text style={styles.clearOneText}>{'\u00D7'}</Text>
                          </Pressable>
                        </View>
                      </View>

                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardBodyText}>{item.body}</Text>

                      {!item.read ? (
                        <View style={styles.unreadPill}>
                          <Text style={styles.unreadText}>{t('new')}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      <ConfirmModal
        visible={clearConfirmation !== null}
        title={
          clearConfirmation?.kind === 'all'
            ? t('clear_all_notifications')
            : t('clear_notification')
        }
        message={
          clearConfirmation?.kind === 'all'
            ? t('remove_all_notifications_confirm')
            : t('remove_notification_confirm')
        }
        confirmText={
          clearConfirmation?.kind === 'all' ? t('clear_all') : t('clear')
        }
        cancelText={t('cancel')}
        onConfirm={handleConfirmClear}
        onCancel={handleCancelClear}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 30,
  },
  heroCard: {
    borderRadius: 20,
    backgroundColor: '#EAF2FF',
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 22,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroCopy: {
    flex: 1,
    paddingRight: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
  },
  clearAllButton: {
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
    textTransform: 'uppercase',
  },
  groupWrap: {
    marginBottom: 24,
  },
  groupTitle: {
    marginBottom: 12,
    fontSize: 15,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 16,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  accentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 8,
    marginRight: 12,
  },
  cardBody: {
    flex: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  categoryPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  cardTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  cardBodyText: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
  },
  unreadPill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: '#EEF4FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563EB',
  },
  clearOneButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearOneText: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '500',
    color: '#64748B',
  },
  emptyCard: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: '#64748B',
    textAlign: 'center',
  },
});
