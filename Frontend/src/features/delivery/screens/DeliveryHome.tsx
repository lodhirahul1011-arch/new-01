import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import BlueHeader from '../../../components/layout/BlueHeader';
import type {DeliveryStackParamList} from '../../../navigation/tabs/stacks/DeliveryStack';
import {useDeliverySchedules} from '../../../hooks/useDeliverySchedules';
import type {DeliverySchedule} from '../../../services/api/smsDeliveryService';
import DeliveryNoPreview from '../components/DeliveryNoPreview';
import YellowStarSvg from '../../../assets/icons/common/yellow-star.svg';
import UserSvg from '../../../assets/icons/common/user.svg';
import ChevronDownSvg from '../../../assets/icons/common/chevron-down.svg';
import {logs} from '../../../services/logs';

type Props = NativeStackScreenProps<DeliveryStackParamList, 'DeliveryHome'>;
type DeliveryFilter = 'all' | 'upcoming' | 'delivered' | 'failed';
type DeliveryDisplayStatus = 'upcoming' | 'delivered' | 'rejected';

type DeliveryScheduleWithStatusAliases = DeliverySchedule & {
  status?: string;
  statusLabel?: string;
  decision?: string;
};

const UPCOMING_STATUS_VALUES = new Set([
  'initiated',
  'arriving_soon',
  'out_for_delivery',
  'upon_arrival',
  'upcoming',
  'pending',
]);
const DELIVERED_STATUS_VALUES = new Set([
  'delivered',
  'successful',
  'completed',
  'approved',
]);
const REJECTED_STATUS_VALUES = new Set([
  'failed',
  'rejected',
  'declined',
  'cancelled',
  'canceled',
]);

const FILTER_OPTIONS: Array<{key: DeliveryFilter; label: string}> = [
  {key: 'all', label: 'ALL'},
  {key: 'upcoming', label: 'UPCOMING'},
  {key: 'delivered', label: 'SUCCESSFUL'},
  {key: 'failed', label: 'REJECTED'},
];

export default function DeliveryHome({navigation}: Props) {
  const {width: screenWidth} = useWindowDimensions();
  const {upcoming, history, loadUpcoming, loadHistory, refresh} =
    useDeliverySchedules();
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<DeliveryFilter>('upcoming');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [filterMenuPosition, setFilterMenuPosition] = useState({top: 196, right: 12});
  const filterButtonRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);

  const combinedDeliveries = useMemo(() => {
    const unique = new Map<string, DeliverySchedule>();
    for (const item of [...upcoming.data, ...history.data]) {
      unique.set(item._id, item);
    }

    return Array.from(unique.values()).sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
  }, [history.data, upcoming.data]);

  const summary = useMemo(
    () => [
      {
        label: 'Total',
        value: String(combinedDeliveries.length),
        filter: 'all' as const,
      },
      {
        label: 'Successful',
        value: String(
          combinedDeliveries.filter(
            item => getDeliveryDisplayStatus(item) === 'delivered',
          ).length,
        ),
        filter: 'delivered' as const,
      },
      {
        label: 'Rejected',
        value: String(
          combinedDeliveries.filter(
            item => getDeliveryDisplayStatus(item) === 'rejected',
          ).length,
        ),
        filter: 'failed' as const,
      },
    ],
    [combinedDeliveries],
  );

  const filteredDeliveries = useMemo(() => {
    switch (activeFilter) {
      case 'upcoming':
        return combinedDeliveries.filter(
          item => getDeliveryDisplayStatus(item) === 'upcoming',
        );
      case 'delivered':
        return combinedDeliveries.filter(
          item => getDeliveryDisplayStatus(item) === 'delivered',
        );
      case 'failed':
        return combinedDeliveries.filter(
          item => getDeliveryDisplayStatus(item) === 'rejected',
        );
      case 'all':
      default:
        return combinedDeliveries;
    }
  }, [activeFilter, combinedDeliveries]);

  const selectedFilterLabel = useMemo(
    () => FILTER_OPTIONS.find(option => option.key === activeFilter)?.label ?? 'ALL',
    [activeFilter],
  );

  useEffect(() => {
    const unknownStatuses = Array.from(
      new Set(
        combinedDeliveries
          .filter(item => resolveDeliveryDisplayStatus(item) === null)
          .map(item => String(item.currentStatus || 'missing')),
      ),
    );

    if (unknownStatuses.length) {
      logs.error('[delivery-home] unrecognized delivery statuses', {
        statuses: unknownStatuses,
      });
    }
  }, [combinedDeliveries]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleLoadMore = useCallback(() => {
    if (activeFilter === 'upcoming' && upcoming.data.length < upcoming.total) {
      loadUpcoming(upcoming.skip + upcoming.limit, upcoming.limit);
      return;
    }

    if (
      (activeFilter === 'all' || activeFilter === 'delivered' || activeFilter === 'failed') &&
      history.data.length < history.total
    ) {
      loadHistory(history.skip + history.limit, history.limit);
    }
  }, [activeFilter, history, loadHistory, loadUpcoming, upcoming]);

  const selectFilter = useCallback(
    (nextFilter: DeliveryFilter) => {
      const matchingDeliveries =
        nextFilter === 'all'
          ? combinedDeliveries.length
          : combinedDeliveries.filter(item => {
              const status = getDeliveryDisplayStatus(item);
              if (nextFilter === 'failed') return status === 'rejected';
              return status === nextFilter;
            }).length;

      logs.info('[delivery-home] delivery filter selected', {
        filter: nextFilter,
        matchingDeliveries,
      });
      setActiveFilter(nextFilter);
      setIsFilterMenuOpen(false);
    },
    [combinedDeliveries],
  );

  const toggleFilterMenu = useCallback(() => {
    if (isFilterMenuOpen) {
      setIsFilterMenuOpen(false);
      return;
    }

    const button = filterButtonRef.current;
    if (!button) {
      logs.error('[delivery-home] filter button anchor is unavailable');
      return;
    }

    button.measureInWindow((x, y, buttonWidth, buttonHeight) => {
      const right = Math.max(12, screenWidth - (x + buttonWidth));
      const top = y + buttonHeight + 4;
      setFilterMenuPosition({top, right});
      setIsFilterMenuOpen(true);
      logs.info('[delivery-home] filter menu aligned to button', {top, right});
    });
  }, [isFilterMenuOpen, screenWidth]);

  const openDeliveryDetails = useCallback(
    (scheduleId: string) => {
      navigation.navigate('DeliveryDetails', {scheduleId});
    },
    [navigation],
  );

  const renderItem = ({item}: {item: DeliverySchedule}) => {
    const displayCompany = getDisplayCompany(item);
    const companyLabel = formatCompanyName(displayCompany);
    const partnerLabel = getPartnerLabel(item, companyLabel);
    const orderLine = getVisibleOrderLine(item);
    const awbLine = getVisibleAwbLine(item);
    const {dateLabel, timeLabel} = formatDateTimeParts(item);
    const otpCode = getScheduleOtp(item);
    const verificationCode = otpCode || '--';
    const ratingText = formatRating(item.rating);
    const displayStatus = getDeliveryDisplayStatus(item);
    const statusConfig = getStatusPresentation(displayStatus);

    return (
        <TouchableOpacity
          activeOpacity={0.86}
          style={[
            styles.card,
            displayStatus === 'rejected' && styles.cardRejected,
          ]}
          onPress={() => openDeliveryDetails(item._id)}>
        <View style={styles.topRow}>
          {getScheduleImageUrl(item) ? (
            <Image
              source={{uri: getScheduleImageUrl(item)!}}
              style={styles.productThumb}
              resizeMode="cover"
            />
          ) : (
            <DeliveryNoPreview width={56} height={56} borderRadius={8} compact />
          )}

          <View style={styles.topContent}>
            <View style={styles.titleRow}>
              <View style={styles.titleWrap}>
                <Text style={styles.productTitle} numberOfLines={2}>
                    {getProductTitle(item)}
                </Text>
                <Text style={styles.orderId} numberOfLines={1}>
                  {orderLine}
                </Text>
                <Text style={styles.awbText} numberOfLines={1}>
                  {awbLine}
                </Text>
              </View>

              <View style={[styles.upcomingBadge, {backgroundColor: statusConfig.badgeColor}]}>
                <Text style={styles.badgeText}>{statusConfig.label}</Text>
              </View>
            </View>

            <View style={styles.metaGrid}>
              <View style={styles.metaColumn}>
                <Text style={styles.metaLabel}>Date</Text>
                <Text style={styles.metaValue}>{dateLabel}</Text>
              </View>

              <View style={styles.metaColumn}>
                <Text style={styles.metaLabel}>Verification Code</Text>
                <Text style={styles.metaValue}>{verificationCode}</Text>
              </View>

              <View style={styles.metaColumn}>
                <Text style={styles.metaLabel}>Time</Text>
                <Text style={styles.metaValue}>{timeLabel}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.partnerRow}>
          <View style={styles.partnerAvatar}>
            <UserSvg width={24} height={24} />
          </View>

          <View style={styles.partnerInfo}>
            <Text style={styles.partnerName}>{partnerLabel}</Text>

            <View style={styles.partnerMetaRow}>
              <Text style={styles.partnerCompanyText}>{companyLabel}</Text>
              <Text style={styles.partnerDot}>★</Text>
              <YellowStarSvg width={12} height={12} />
              <Text style={styles.partnerRating}>{ratingText}</Text>
            </View>

            <View style={styles.partnerServiceRow}>
              <Text style={styles.partnerService}>{companyLabel}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if ((upcoming.loading || history.loading) && combinedDeliveries.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <BlueHeader
          title="Delivery"
          subtitle="View all your upcoming deliveries"
          leftAligned
          large
        />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#2B63E1" />
          <Text style={styles.loadingText}>Loading upcoming deliveries...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title="Delivery"
        subtitle="View all your upcoming deliveries"
        leftAligned
        large
      />

      <FlatList
        data={filteredDeliveries}
        renderItem={renderItem}
        keyExtractor={item => item._id}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.35}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2B63E1"
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.summaryRow}>
              {summary.map(item => (
                <TouchableOpacity
                  key={item.label}
                  activeOpacity={0.85}
                  style={[
                    styles.summaryCard,
                    activeFilter === item.filter && styles.summaryCardActive,
                  ]}
                  onPress={() => selectFilter(item.filter)}>
                  <Text
                    style={[
                      styles.summaryValue,
                      activeFilter === item.filter && styles.summaryValueActive,
                    ]}>
                    {item.value}
                  </Text>
                  <Text
                    style={[
                      styles.summaryLabel,
                      activeFilter === item.filter && styles.summaryLabelActive,
                    ]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Order Details</Text>
              <View style={styles.filterWrap}>
                <TouchableOpacity
                  ref={filterButtonRef}
                  activeOpacity={0.85}
                  style={styles.filterButton}
                  onPress={toggleFilterMenu}>
                  <Text style={styles.filterButtonText}>{selectedFilterLabel}</Text>
                  <ChevronDownSvg width={10} height={10} />
                </TouchableOpacity>
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {getEmptyTitle(activeFilter)}
            </Text>
            {/* <Text style={styles.emptySubtitle}>
              Delivery schedules will appear here as soon as matching delivery notifications are processed.
            </Text> */}
          </View>
        }
        ListFooterComponent={
          upcoming.loading || history.loading ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#2B63E1" />
            </View>
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />

      <Modal
        visible={isFilterMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsFilterMenuOpen(false)}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.modalBackdrop}
          onPress={() => setIsFilterMenuOpen(false)}>
          <View
            style={[
              styles.filterMenuModal,
              filterMenuPosition,
            ]}>
            {FILTER_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.key}
                activeOpacity={0.85}
                style={[
                  styles.filterMenuItem,
                  activeFilter === option.key && styles.filterMenuItemActive,
                ]}
                onPress={() => selectFilter(option.key)}>
                <Text
                  style={[
                    styles.filterMenuItemText,
                    activeFilter === option.key && styles.filterMenuItemTextActive,
                  ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function extractCompanyFromRawText(rawText?: string): string {
  const text = String(rawText || '');
  const prefixed = text.match(/^([A-Za-z][A-Za-z0-9 &.-]{2,40})\s*:/)?.[1]?.trim();
  if (prefixed) {
    return normalizeCompanyToken(prefixed);
  }
  const partner = text.match(/\bDelivery Partner\s*:\s*([A-Za-z][A-Za-z0-9 &.-]{2,40})\b/i)?.[1]?.trim();
  if (partner) {
    return normalizeCompanyToken(partner);
  }
  return '';
}

function normalizeCompanyToken(value: string): string {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';

  if (/\bekart\b/.test(text)) return 'ekart';
  if (/\bdvaarikart\b/.test(text)) return 'dvaarikart';
  if (/\bxpressbees\b/.test(text)) return 'xpressbees';
  if (/\bshadowfax\b/.test(text)) return 'shadowfax';
  if (/\bblitz\b/.test(text)) return 'blitz';
  if (/\bsavana\b/.test(text)) return 'savana';
  if (/\bamazon\b/.test(text)) return 'amazon';
  if (/\bflipkart\b/.test(text)) return 'flipkart';
  if (/\bmyntra\b/.test(text)) return 'myntra';

  return text.replace(/\s+/g, '_');
}

function getDisplayCompany(item: DeliverySchedule): string {
  return (
    extractCompanyFromRawText(item.latestSmsId?.rawText) ||
    item.deliveryCompany ||
    'unknown'
  );
}

function getPartnerLabel(item: DeliverySchedule, companyLabel: string): string {
  const latestRiderName = item.latestSmsId?.extractedData?.riderName;
  const explicitPartner =
    item.latestSmsId?.rawText?.match(/\bDelivery Partner\s*:\s*([A-Za-z][A-Za-z0-9 &.-]{2,40})\b/i)?.[1]?.trim() ||
    '';
  const candidate = item.riderName || latestRiderName || explicitPartner;
  if (!candidate) {
    return `${companyLabel} Partner`;
  }
  const normalizedCandidate = candidate.trim().toLowerCase();
  const normalizedCompany = companyLabel.trim().toLowerCase();
  const normalizedSeller = (item.sellerName || item.latestSmsId?.extractedData?.sellerName || '').trim().toLowerCase();
  if (
    normalizedCandidate === normalizedCompany ||
    normalizedCandidate === normalizedSeller ||
    normalizedCandidate.includes('delivery partner') ||
    normalizedCandidate.includes('xpressbees') ||
    normalizedCandidate.includes('shadowfax') ||
    normalizedCandidate.includes('ekart') ||
    normalizedCandidate.includes('blitz') ||
    normalizedCandidate.includes('savana') ||
    normalizedCandidate.includes('dvaarikart')
  ) {
    return `${companyLabel} Partner`;
  }
  return candidate;
}

function getProductTitle(item: DeliverySchedule): string {
  const candidate =
    item.productSummary ||
    item.latestSmsId?.extractedData?.productInfo ||
    item.sellerName ||
    item.latestSmsId?.extractedData?.sellerName ||
    '';
  const normalizedCandidate = String(candidate || '').trim();
  if (
    !normalizedCandidate ||
    /^provisional:/i.test(normalizedCandidate) ||
    /^[A-Z0-9-]{6,}$/i.test(normalizedCandidate) ||
    /\b(?:awb|tracking id|track id|otp|delivery code|open box)\b/i.test(normalizedCandidate)
  ) {
    const orderHint = item.orderHint || item.latestSmsId?.extractedData?.orderHint || '';
    if (orderHint && !/^provisional:/i.test(orderHint)) {
      return `Order ${orderHint}`;
    }

    const referenceId = item.referenceId || '';
    if (referenceId && !/^provisional:/i.test(referenceId)) {
      return `Order ${referenceId}`;
    }

    return 'Delivery Order';
  }
  return normalizedCandidate;
}

function getOrderLine(referenceId: string): string {
  if (!referenceId || referenceId.startsWith('provisional:')) {
    return 'Order details pending';
  }

  return `Order ${referenceId}`;
}

function getVisibleOrderLine(item: DeliverySchedule): string {
  const orderHint = item.orderHint || item.latestSmsId?.extractedData?.orderHint;
  if (orderHint) {
    return `Order ${orderHint}`;
  }

  return getOrderLine(item.referenceId);
}

function getVisibleAwbLine(item: DeliverySchedule): string {
  const awb = item.awbNumber || item.latestSmsId?.extractedData?.awbNumber || '';
  if (!awb || /^provisional:/i.test(awb)) {
    return 'AWB --';
  }

  return `AWB ${awb}`;
}

function getScheduleOtp(item: DeliverySchedule): string {
  return item.otpCode || item.latestSmsId?.extractedData?.otpCode || '';
}

function getScheduleImageUrl(item: DeliverySchedule): string {
  return (
    item.imageUrl ||
    item.thumbnailUrl ||
    item.latestSmsId?.extractedData?.imageUrl ||
    item.latestSmsId?.extractedData?.thumbnailUrl ||
    ''
  );
}

function formatCompanyName(value: string): string {
  if (!value || value === 'unknown') {
    return 'Delivery';
  }
  if (value === 'manual' || value === 'info_pending') {
    return 'Info Pending';
  }
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatRating(value?: number | null): string {
  return typeof value === 'number' ? String(value) : '-';
}

function formatDateTimeParts(item: DeliverySchedule) {
  const timeWindow =
    item.deliveryTimeWindow || item.latestSmsId?.extractedData?.deliveryTimeWindow || '';
  const dateString =
    item.expectedDeliveryDate || item.latestSmsId?.extractedData?.expectedDeliveryDate;

  if (!dateString) {
    const scheduledAt = item.scheduledAt || item.createdAt || item.updatedAt;
    if (scheduledAt) {
      try {
        const scheduledDate = new Date(scheduledAt);
        return {
          dateLabel: scheduledDate.toLocaleDateString('en-IN', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          timeLabel:
            timeWindow ||
            scheduledDate.toLocaleTimeString('en-IN', {
              hour: 'numeric',
              minute: '2-digit',
            }),
        };
      } catch {
        return {dateLabel: '--', timeLabel: timeWindow || '--'};
      }
    }
    return {dateLabel: '--', timeLabel: timeWindow || '--'};
  }

  try {
    const date = new Date(dateString);
    return {
      dateLabel: date.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      timeLabel:
        timeWindow ||
        date.toLocaleTimeString('en-IN', {
          hour: 'numeric',
          minute: '2-digit',
        }),
    };
  } catch {
    return {dateLabel: dateString, timeLabel: timeWindow || '--'};
  }
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F6F4F2',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 24,
    flexGrow: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    minHeight: 86,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E7E3DE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCardActive: {
    borderColor: '#2B63E1',
    backgroundColor: '#EEF4FF',
  },
  summaryValue: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '700',
    color: '#2B2D31',
  },
  summaryValueActive: {
    color: '#1E4FC9',
  },
  summaryLabel: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '500',
    color: '#585B61',
  },
  summaryLabelActive: {
    color: '#1E4FC9',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    zIndex: 40,
    elevation: 40,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2B2D31',
  },
  filterButton: {
    minWidth: 56,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D6D5D4',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  filterButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B4E53',
  },
  filterWrap: {
    position: 'relative',
    zIndex: 20,
    elevation: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  filterMenuModal: {
    position: 'absolute',
    right: 12,
    width: 126,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D6D5D4',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#111827',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  filterMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterMenuItemActive: {
    backgroundColor: '#EEF4FF',
  },
  filterMenuItemText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B4E53',
  },
  filterMenuItemTextActive: {
    color: '#1E4FC9',
  },
  card: {
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7E3DE',
    padding: 12,
    zIndex: 1,
    elevation: 1,
  },
  cardRejected: {
    borderColor: '#F4B6B6',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  productThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#E7E5E4',
  },
  topContent: {
    flex: 1,
    marginLeft: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleWrap: {
    flex: 1,
  },
  productTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: '#3A3C40',
  },
  orderId: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '500',
    color: '#4D5055',
  },
  awbText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '500',
    color: '#4D5055',
  },
  upcomingBadge: {
    minWidth: 72,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#3CCF67',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    rowGap: 10,
  },
  metaColumn: {
    width: '50%',
    paddingRight: 8,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '400',
    color: '#585B61',
  },
  metaValue: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: '#2F3135',
  },
  metaValueAccent: {
    color: '#2F3135',
  },
  divider: {
    height: 1,
    backgroundColor: '#ECE8E2',
    marginTop: 12,
    marginBottom: 12,
    marginLeft: 66,
  },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 58,
  },
  partnerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#3167EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerInfo: {
    flex: 1,
    marginLeft: 10,
  },
  partnerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#36383D',
  },
  partnerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  partnerCompanyText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#4B4E53',
  },
  partnerDot: {
    fontSize: 10,
    color: '#4B4E53',
  },
  partnerRating: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2E3034',
  },
  partnerServiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  partnerService: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4B4E53',
  },
  emptyCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7E3DE',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2B2D31',
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: '#6B7280',
    textAlign: 'center',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '600',
  },
});

function resolveStatusValue(value?: string | null): DeliveryDisplayStatus | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (REJECTED_STATUS_VALUES.has(normalized)) return 'rejected';
  if (DELIVERED_STATUS_VALUES.has(normalized)) return 'delivered';
  if (UPCOMING_STATUS_VALUES.has(normalized)) return 'upcoming';
  return null;
}

function resolveDeliveryDisplayStatus(
  item: DeliverySchedule,
): DeliveryDisplayStatus | null {
  const currentStatus = resolveStatusValue(item.currentStatus);
  if (currentStatus) return currentStatus;

  const itemWithAliases = item as DeliveryScheduleWithStatusAliases;
  const latestHistoryStatus =
    item.statusHistory?.[item.statusHistory.length - 1]?.status;
  const fallbackValues = [
    itemWithAliases.status,
    itemWithAliases.decision,
    latestHistoryStatus,
    item.latestSmsId?.status,
    itemWithAliases.statusLabel,
  ];

  for (const value of fallbackValues) {
    const status = resolveStatusValue(value);
    if (status) return status;
  }

  return null;
}

function getDeliveryDisplayStatus(item: DeliverySchedule): DeliveryDisplayStatus {
  return resolveDeliveryDisplayStatus(item) ?? 'upcoming';
}

function getStatusPresentation(status: DeliveryDisplayStatus) {
  switch (status) {
    case 'delivered':
      return {label: 'Successful', badgeColor: '#3CCF67'};
    case 'rejected':
      return {label: 'Rejected', badgeColor: '#EF4444'};
    case 'upcoming':
    default:
      return {label: 'Upcoming', badgeColor: '#3B82F6'};
  }
}

function getEmptyTitle(filter: DeliveryFilter) {
  switch (filter) {
    case 'delivered':
      return 'No successful deliveries';
    case 'failed':
      return 'No rejected deliveries';
    case 'upcoming':
      return 'No upcoming deliveries';
    case 'all':
    default:
      return 'No deliveries found';
  }
}
