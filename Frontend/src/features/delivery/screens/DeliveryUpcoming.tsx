import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {useDeliverySchedules} from '../../../hooks/useDeliverySchedules';
import type {DeliverySchedule} from '../../../services/api/smsDeliveryService';
import type {DeliveryStackParamList} from '../../../navigation/tabs/stacks/DeliveryStack';

type NavigationProp = NativeStackNavigationProp<DeliveryStackParamList>;

export function DeliveryUpcomingScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {upcoming, loadUpcoming, refresh} = useDeliverySchedules();
  const [refreshing, setRefreshing] = useState(false);

  const deliveryCountLabel = useMemo(() => {
    if (upcoming.total === 0) return 'No live schedules yet';
    return `${upcoming.data.length} of ${upcoming.total} upcoming deliveries`;
  }, [upcoming.data.length, upcoming.total]);

  useFocusEffect(
    useCallback(() => {
      loadUpcoming(0, 50);
    }, [loadUpcoming]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleLoadMore = useCallback(() => {
    if (upcoming.data.length < upcoming.total) {
      loadUpcoming(upcoming.skip + upcoming.limit, upcoming.limit);
    }
  }, [loadUpcoming, upcoming]);

  const renderDeliveryItem = ({item}: {item: DeliverySchedule}) => (
    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.card}
      onPress={() =>
        navigation.navigate('DeliveryDetails', {
          scheduleId: item._id,
        })
      }>
      <View style={styles.cardHeaderRow}>
        <View style={styles.companyBadge}>
          <Text style={styles.companyName}>
            {formatCompanyName(item.deliveryCompany)}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {backgroundColor: getStatusColor(item.currentStatus)},
          ]}>
          <Text style={styles.statusText}>{formatStatus(item.currentStatus)}</Text>
        </View>
      </View>

      <View style={styles.referenceBlock}>
        <Text style={styles.referenceLabel}>Reference</Text>
        <Text style={styles.referenceValue} numberOfLines={1}>
          {item.referenceId}
        </Text>
      </View>

      {item.productSummary ? (
        <Text style={styles.productSummary} numberOfLines={2}>
          {item.productSummary}
        </Text>
      ) : null}

      <View style={styles.metaGrid}>
        <MetaTile
          label="Expected"
          value={formatDate(item.expectedDeliveryDate)}
        />
        <MetaTile label="Window" value={item.deliveryTimeWindow || '-'} />
        <MetaTile
          label="OTP"
          value={item.otpCode || '-'}
          accent={Boolean(item.otpCode)}
        />
        <MetaTile label="AWB" value={item.awbNumber || '-'} />
        <MetaTile label="Rider" value={item.riderName || '-'} />
        <MetaTile
          label="Updates"
          value={String(item.notificationEventCount || item.smsCount || 0)}
        />
      </View>

      {item.sellerName || item.customerName ? (
        <View style={styles.footerRow}>
          <Text style={styles.footerText} numberOfLines={1}>
            {item.sellerName || item.customerName}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  if (upcoming.loading && upcoming.data.length === 0) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#0F766E" />
        <Text style={styles.loadingText}>Loading delivery schedules...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={upcoming.data}
        renderItem={renderDeliveryItem}
        keyExtractor={item => item._id}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerEyebrow}>Live Delivery Queue</Text>
            <Text style={styles.headerTitle}>Upcoming Deliveries</Text>
            <Text style={styles.headerSubtitle}>{deliveryCountLabel}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No upcoming deliveries</Text>
            <Text style={styles.emptyStateSubtitle}>
              Delivery notifications with strong schedule details will appear here
              automatically.
            </Text>
          </View>
        }
        ListFooterComponent={
          upcoming.loading ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#0F766E" />
            </View>
          ) : null
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0F766E"
          />
        }
      />
    </SafeAreaView>
  );
}

function MetaTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.metaTile}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, accent && styles.metaValueAccent]} numberOfLines={2}>
        {value || '-'}
      </Text>
    </View>
  );
}

function formatCompanyName(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'delivered':
      return '#15803D';
    case 'out_for_delivery':
      return '#EA580C';
    case 'upon_arrival':
      return '#B45309';
    case 'arriving_soon':
      return '#2563EB';
    case 'initiated':
      return '#7C3AED';
    case 'failed':
      return '#DC2626';
    default:
      return '#475569';
  }
}

function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    initiated: 'Initiated',
    arriving_soon: 'Arriving Soon',
    out_for_delivery: 'Out for Delivery',
    upon_arrival: 'OTP Ready',
    delivered: 'Delivered',
    failed: 'Failed',
  };
  return statusMap[status] || status;
}

function formatDate(dateString: string | undefined): string {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7F5',
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F7F5',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    flexGrow: 1,
  },
  header: {
    marginBottom: 18,
    paddingTop: 8,
  },
  headerEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#0F766E',
  },
  headerTitle: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: '#4B5563',
  },
  card: {
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  companyBadge: {
    backgroundColor: '#E7F7F2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  companyName: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '800',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  referenceBlock: {
    marginTop: 14,
  },
  referenceLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#6B7280',
  },
  referenceValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  productSummary: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: '#374151',
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  metaTile: {
    minWidth: '46%',
    flexGrow: 1,
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5EEEA',
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  metaValue: {
    marginTop: 5,
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  metaValueAccent: {
    color: '#B91C1C',
    letterSpacing: 1.5,
  },
  footerRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  footerText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 72,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  emptyStateSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
    color: '#6B7280',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
