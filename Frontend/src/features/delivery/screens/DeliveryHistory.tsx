import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Modal,
  TouchableWithoutFeedback,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { AppAlert as Alert } from '../../../components/modals/AppAlert';
import BlueHeader from '../../../components/layout/BlueHeader';
import { prefetchRemoteImages } from '../../../services/storage/imagePrefetch';
import { useDeliverySchedules } from '../../../hooks/useDeliverySchedules';
import type { DeliverySchedule } from '../../../services/api/smsDeliveryService';
import DeliveryNoPreview from '../components/DeliveryNoPreview';
import DownSvg from '../../../assets/icons/common/chevron-down.svg'
import { useAppTranslation } from '../../../services/i18n';
import { logs } from '../../../services/logs';
type Props = NativeStackScreenProps<RootStackParamList, 'DeliveryHistory'>;

type FilterOption = 'ALL' | 'Delivered' | 'Rejected';
type DropdownAnchor = { top: number; left: number; width: number };

type HistoryTerminalStatus = 'delivered' | 'rejected';

type DeliveryScheduleWithStatusAliases = DeliverySchedule & {
  status?: string;
  statusLabel?: string;
  decision?: string;
};

const ENGLISH_FILTER_LABELS: Record<FilterOption, string> = {
  ALL: 'All',
  Delivered: 'Delivered',
  Rejected: 'Rejected',
};
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

type DeliveryItem =
  | {
      id: string;
      type: 'delivered';
      productTitle: string;
      orderId: string;
      date: string;
      time: string;
      verificationCode: string;
      courierName: string;
      companyName: string;
      rating: string;
      imageSource:
        | { type: 'local'; value: any }
        | { type: 'remote'; value: string }
        | null;
      avatarSource:
        | { type: 'local'; value: any }
        | { type: 'remote'; value: string }
        | null;
      status: 'Delivered';
    }
  | {
      id: string;
      type: 'rejected';
      productTitle: string;
      orderId: string;
      price: string;
      date: string;
      time: string;
      verificationCode: string;
      reason: string;
      imageSource:
        | { type: 'local'; value: any }
        | { type: 'remote'; value: string }
        | null;
      status: 'Rejected';
    };

function normalizeOrderId(orderId?: string) {
  if (!orderId) return '';
  return orderId.startsWith('#') ? orderId : `#${orderId}`;
}

function getFallbackAvatarImage() {
  return require('../../../assets/images/delivery-history/user-1.png');
}

function formatHistoryDate(value?: string) {
  if (!value) return '--';
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '--';
  }
}

function formatHistoryTime(value?: string) {
  if (!value) return '--';
  try {
    return new Date(value).toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '--';
  }
}

function formatCompanyName(value?: string) {
  if (!value) return 'Delivery';
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function resolveHistoryStatusValue(value?: string | null): HistoryTerminalStatus | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (REJECTED_STATUS_VALUES.has(normalized)) return 'rejected';
  if (DELIVERED_STATUS_VALUES.has(normalized)) return 'delivered';
  return null;
}

function getHistoryTerminalStatus(
  item: DeliverySchedule,
): HistoryTerminalStatus | null {
  const currentStatus = resolveHistoryStatusValue(item.currentStatus);
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
    const status = resolveHistoryStatusValue(value);
    if (status) return status;
  }

  return null;
}

function mapScheduleToUiItem(item: DeliverySchedule): DeliveryItem {
  const verificationCode =
    item.otpCode || item.latestSmsId?.extractedData?.otpCode || '-';
  const dateValue = item.completedAt || item.updatedAt || item.createdAt;
  const date = formatHistoryDate(dateValue);
  const time = formatHistoryTime(dateValue);
  const productTitle =
    item.productSummary || item.sellerName || item.referenceId || 'Delivery';
  const orderId = normalizeOrderId(item.orderHint || item.referenceId || item.awbNumber || '');
  const imageUrl =
    item.imageUrl ||
    item.thumbnailUrl ||
    item.latestSmsId?.extractedData?.imageUrl ||
    item.latestSmsId?.extractedData?.thumbnailUrl ||
    '';

  if (getHistoryTerminalStatus(item) === 'rejected') {
    return {
      id: item._id,
      type: 'rejected',
      productTitle,
      orderId,
      price: '-',
      date,
      time,
      verificationCode,
      reason: 'Rejected from app',
      imageSource: imageUrl
        ? { type: 'remote', value: imageUrl }
        : null,
      status: 'Rejected',
    };
  }

  return {
    id: item._id,
    type: 'delivered',
    productTitle,
    orderId,
    date,
    time,
    verificationCode,
    courierName: item.riderName || 'Delivery Partner',
    companyName: item.sellerName || formatCompanyName(item.deliveryCompany),
    rating: formatRating(item.rating),
    imageSource: imageUrl
      ? { type: 'remote', value: imageUrl }
      : null,
    avatarSource: { type: 'local', value: getFallbackAvatarImage() },
    status: 'Delivered',
  };
}

function formatRating(value?: number | null) {
  return typeof value === 'number' ? String(value) : '-';
}

function getFilterLabelKey(filter: FilterOption) {
  if (filter === 'Delivered') return 'delivered';
  if (filter === 'Rejected') return 'rejected';
  return 'all';
}

export default function DeliveryHistory({ navigation }: Props) {
  const { t, language } = useAppTranslation();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;

  const [selectedFilter, setSelectedFilter] = useState<FilterOption>('ALL');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterAnchor, setFilterAnchor] = useState<DropdownAnchor>({
    top: 0,
    left: 12,
    width: 160,
  });
  const filterButtonRef = useRef<React.ElementRef<typeof Pressable>>(null);
  const { history, refresh } = useDeliverySchedules();

  const isListLoading = history.loading;
  const isListFetching = false;
  const listError = history.error;

  const isProofLoading = false;
  const isRecordingLoading = false;

  const getLocalizedFilterLabel = (filter: FilterOption) => {
    if (language === 'en') return ENGLISH_FILTER_LABELS[filter];
    return t(getFilterLabelKey(filter));
  };

  const openFilterDropdown = () => {
    const button = filterButtonRef.current;
    if (!button) {
      logs.error('[delivery-history] filter dropdown anchor is unavailable');
      return;
    }

    button.measureInWindow((x, y, buttonWidth, buttonHeight) => {
      const menuWidth = Math.min(Math.max(buttonWidth, 160), width - 24);
      const preferredLeft = x + buttonWidth - menuWidth;
      const left = Math.max(12, Math.min(preferredLeft, width - menuWidth - 12));
      const top = y + buttonHeight + 4;
      setFilterAnchor({ top, left, width: menuWidth });
      setFilterOpen(true);
      logs.info('[delivery-history] filter dropdown aligned to button', {
        top,
        left,
      });
    });
  };

  const summary = useMemo(() => {
    const delivered = history.data.filter(
      item => getHistoryTerminalStatus(item) === 'delivered',
    ).length;
    const rejected = history.data.filter(
      item => getHistoryTerminalStatus(item) === 'rejected',
    ).length;
    return {
      total: history.data.length,
      successful: delivered,
      delivered,
      rejected,
    };
  }, [history.data]);

  const filterOptions = useMemo<FilterOption[]>(
    () => ['ALL', 'Delivered', 'Rejected'],
    [],
  );

  const items = useMemo<DeliveryItem[]>(() => {
    const filtered = history.data.filter(item => {
      const status = getHistoryTerminalStatus(item);
      if (selectedFilter === 'Delivered') return status === 'delivered';
      if (selectedFilter === 'Rejected') return status === 'rejected';
      return true;
    });

    return filtered.map(mapScheduleToUiItem);
  }, [history.data, selectedFilter]);

  useEffect(() => {
    const urls = items.flatMap(item => {
      const imageUrl =
        item.imageSource?.type === 'remote' ? item.imageSource.value : null;
      const avatarUrl =
        item.type === 'delivered' && item.avatarSource?.type === 'remote'
          ? item.avatarSource.value
          : null;

      return [imageUrl, avatarUrl];
    });

    prefetchRemoteImages(urls);
  }, [items]);

  useEffect(() => {
    if (listError) {
      logs.error('[delivery-history] history loading failed', { error: listError });
    }
  }, [listError]);

  const onViewRecording = async (id: string) => {
    void id;
    logs.info('[delivery-history] view recording pressed', { id });
    Alert.alert(t('recording_unavailable'), t('recording_unavailable_sms'));
  };

  const onDownloadProof = async (id: string) => {
    void id;
    logs.info('[delivery-history] download proof pressed', { id });
    Alert.alert(t('proof_unavailable'), t('proof_unavailable_sms'));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title={t('delivery_history')}
        subtitle={t('view_all_post_deliveries')}
        onBackPress={() => navigation.goBack()}
        compact
      />

      {isListLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>{t('loading_delivery_history')}</Text>
        </View>
      ) : listError ? (
        <View style={styles.centerState}>
          <Text style={styles.errorTitle}>{t('could_not_load_delivery_history')}</Text>
          <Text style={styles.stateText}>
            {t('please_try_again_later')}
          </Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              logs.info('[delivery-history] retry pressed');
              refresh(true);
            }}
          >
            <Text style={styles.retryText}>{t('retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            isCompact && styles.contentCompact,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {isListFetching && (
            <Text style={styles.refreshingText}>{t('refreshing_data')}</Text>
          )}

          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.total}</Text>
              <Text style={styles.summaryLabel}>{t('total')}</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.successful}</Text>
              <Text style={styles.summaryLabel}>{t('successful')}</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.rejected}</Text>
              <Text style={styles.summaryLabel}>
                {getLocalizedFilterLabel('Rejected')}
              </Text>
            </View>
          </View>

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>{t('delivery_order_summary')}</Text>

            <Pressable
              ref={filterButtonRef}
              style={styles.filterBtn}
              onPress={openFilterDropdown}
            >
              <Text style={styles.filterBtnText}>
                {getLocalizedFilterLabel(selectedFilter)}
              </Text>
                                               <DownSvg width={18} height={18} />

            </Pressable>
          </View>

          <View style={styles.cardsWrap}>
            {items.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>{t('no_delivery_history_found')}</Text>
                <Text style={styles.emptySub}>
                  {t('no_deliveries_selected_filter')}
                </Text>
              </View>
            ) : (
              items.map(item =>
                item.type === 'delivered' ? (
                  <View key={item.id} style={styles.card}>
                    <View style={styles.topBlock}>
                      {item.imageSource ? (
                        <Image
                          source={
                            item.imageSource.type === 'remote'
                              ? { uri: item.imageSource.value }
                              : item.imageSource.value
                          }
                          style={styles.productImage}
                          resizeMode="cover"
                          fadeDuration={0}
                        />
                      ) : (
                        <DeliveryNoPreview
                          width={72}
                          height={72}
                          borderRadius={10}
                        />
                      )}

                      <View style={styles.topInfo}>
                        <View style={styles.topTitleRow}>
                          <View style={styles.flexOne}>
                            <Text style={styles.productTitle}>
                              {item.productTitle}
                            </Text>
                            <Text style={styles.orderId}>{item.orderId}</Text>
                          </View>

                          <View style={styles.deliveredBadge}>
                            <Text style={styles.deliveredBadgeText}>
                              {getLocalizedFilterLabel('Delivered')}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.metaGrid}>
                          <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>{t('date')}</Text>
                            <Text style={styles.metaValue}>{item.date}</Text>
                          </View>

                          <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>
                              {t('delivery_verification_code')}
                            </Text>
                            <Text style={styles.metaValue}>
                              {item.verificationCode}
                            </Text>
                          </View>

                          <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>{t('time')}</Text>
                            <Text style={styles.metaValue}>{item.time}</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.partnerRow}>
                      <Image
                        source={
                          item.avatarSource?.type === 'remote'
                            ? { uri: item.avatarSource.value }
                            : item.avatarSource?.value
                        }
                        style={styles.partnerAvatar}
                        resizeMode="cover"
                        fadeDuration={0}
                      />

                      <View style={styles.partnerInfo}>
                        <Text style={styles.partnerName}>
                          {item.courierName}
                        </Text>
                        <Text style={styles.partnerSub}>
                          {t('company_rating', { company: item.companyName, rating: item.rating })}
                        </Text>
                        <Text style={styles.partnerDelivery}>{t('delivery_generic')}</Text>
                      </View>
                    </View>

                    <View style={styles.actionRow}>
                      <Pressable
                        style={[styles.actionBtn, styles.neutralBtn]}
                        onPress={() => onViewRecording(item.id)}
                        disabled={isRecordingLoading}
                      >
                        <Text style={styles.neutralBtnText}>
                          {isRecordingLoading ? t('opening') : t('view_recording')}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={[styles.actionBtn, styles.neutralBtn]}
                        onPress={() => onDownloadProof(item.id)}
                        disabled={isProofLoading}
                      >
                        <Text style={styles.neutralBtnText}>
                          {isProofLoading ? t('preparing') : t('download_proof')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View key={item.id} style={[styles.card, styles.rejectedCard]}>
                    <View style={styles.topBlock}>
                      {item.imageSource ? (
                        <Image
                          source={
                            item.imageSource.type === 'remote'
                              ? { uri: item.imageSource.value }
                              : item.imageSource.value
                          }
                          style={styles.productImage}
                          resizeMode="cover"
                          fadeDuration={0}
                        />
                      ) : (
                        <DeliveryNoPreview
                          width={72}
                          height={72}
                          borderRadius={10}
                        />
                      )}

                      <View style={styles.topInfo}>
                        <View style={styles.topTitleRow}>
                          <View style={styles.flexOne}>
                            <Text style={styles.productTitle}>
                              {item.productTitle}
                            </Text>
                            <Text style={styles.orderId}>{item.orderId}</Text>
                          </View>

                          <View style={styles.rejectedBadge}>
                            <Text style={styles.rejectedBadgeText}>
                              {getLocalizedFilterLabel('Rejected')}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.metaGrid}>
                          <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>{t('price')}</Text>
                            <Text style={styles.metaValue}>{item.price}</Text>
                          </View>

                          <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>{t('date')}</Text>
                            <Text style={styles.metaValue}>{item.date}</Text>
                          </View>

                          <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>{t('time')}</Text>
                            <Text style={styles.metaValue}>{item.time}</Text>
                          </View>

                          <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>
                              {t('delivery_verification_code')}
                            </Text>
                            <Text style={styles.metaValue}>
                              {item.verificationCode}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    <View style={styles.reasonBox}>
                      <Text style={styles.reasonText}>
                        <Text style={styles.reasonBold}>{t('reason_dash')} </Text>
                        {item.reason}
                      </Text>
                    </View>

                    <View style={styles.actionRow}>
                      <Pressable
                        style={[styles.actionBtn, styles.neutralBtn]}
                        onPress={() => onViewRecording(item.id)}
                        disabled={isRecordingLoading}
                      >
                        <Text style={styles.neutralBtnText}>
                          {isRecordingLoading ? t('opening') : t('view_recording')}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={[styles.actionBtn, styles.neutralBtn]}
                        onPress={() => onDownloadProof(item.id)}
                        disabled={isProofLoading}
                      >
                        <Text style={styles.neutralBtnText}>
                          {isProofLoading ? t('preparing') : t('download_proof')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ),
              )
            )}
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}

      <FilterDropdownModal
        visible={filterOpen}
        anchor={filterAnchor}
        selectedValue={selectedFilter}
        options={filterOptions}
        getLabel={value => getLocalizedFilterLabel(value as FilterOption)}
        onClose={() => setFilterOpen(false)}
        onSelect={value => {
          logs.info('[delivery-history] filter selected', { value });
          setSelectedFilter(value as FilterOption);
          setFilterOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

type FilterDropdownModalProps = {
  visible: boolean;
  anchor: DropdownAnchor;
  selectedValue: string;
  options: string[];
  getLabel: (value: string) => string;
  onClose: () => void;
  onSelect: (value: string) => void;
};

function FilterDropdownModal({
  visible,
  anchor,
  selectedValue,
  options,
  getLabel,
  onClose,
  onSelect,
}: FilterDropdownModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.dropdownSheet, anchor]}>
              {options.map(option => {
                const isSelected = option === selectedValue;

                return (
                  <Pressable
                    key={option}
                    style={[
                      styles.dropdownItem,
                      isSelected && styles.dropdownItemSelected,
                    ]}
                    onPress={() => onSelect(option)}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        isSelected && styles.dropdownItemTextSelected,
                      ]}
                    >
                      {getLabel(option)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },

  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },

  stateText: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
  },

  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
  },

  retryText: {
    color: '#1D4ED8',
    fontWeight: '800',
  },

  refreshingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    marginHorizontal: 2,
  },

  content: {
    padding: 16,
    gap: 16,
  },

  contentCompact: {
    padding: 12,
  },

  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },

  summaryCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },

  summaryValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },

  summaryLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    textAlign: 'center',
  },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },

  filterBtn: {
    minWidth: 92,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  filterBtnText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
  },

  filterChevron: {
    width: 14,
    height: 14,
  },

  cardsWrap: {
    gap: 14,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
  },

  rejectedCard: {
    borderColor: '#FCA5A5',
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 20,
    alignItems: 'center',
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },

  emptySub: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
  },

  topBlock: {
    flexDirection: 'row',
    gap: 12,
  },

  productImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },

  topInfo: {
    flex: 1,
  },

  topTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },

  flexOne: {
    flex: 1,
  },

  productTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    color: '#111827',
  },

  orderId: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },

  deliveredBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#22C55E',
  },

  deliveredBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  rejectedBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#DC2626',
  },

  rejectedBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  metaGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
  },

  metaCol: {
    width: '50%',
    paddingRight: 10,
  },

  metaLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4B5563',
  },

  metaValue: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: '#111827',
  },

  divider: {
    marginTop: 16,
    marginBottom: 14,
    height: 1,
    backgroundColor: '#E5E7EB',
  },

  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  partnerAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#DBEAFE',
  },

  partnerInfo: {
    flex: 1,
  },

  partnerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },

  partnerSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },

  partnerDelivery: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: '#4B5563',
  },

  reasonBox: {
    marginTop: 16,
    marginLeft: 84,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EF4444',
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  reasonText: {
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
  },

  reasonBold: {
    fontWeight: '800',
    color: '#4B5563',
  },

  actionRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
  },

  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  neutralBtn: {
    backgroundColor: '#F3F4F6',
  },

  neutralBtnText: {
    color: '#4B5563',
    fontSize: 15,
    fontWeight: '700',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },

  dropdownSheet: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  dropdownItem: {
    minHeight: 50,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },

  dropdownItemSelected: {
    backgroundColor: '#F3F4F6',
  },

  dropdownItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },

  dropdownItemTextSelected: {
    fontWeight: '700',
  },

  bottomSpacer: {
    height: 14,
  },
});
