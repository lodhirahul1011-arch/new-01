import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  Modal,
  TouchableWithoutFeedback,
  useWindowDimensions,
  ActivityIndicator,
  Linking,
  NativeModules,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { AppAlert as Alert } from '../../../components/modals/AppAlert';
import BlueHeader from '../../../components/layout/BlueHeader';
import { API_BASE_URL } from '../../../config/env';
import { useGetDeliveryRecordingsQuery } from '../../../services/api/recordingsApi';
import { useAppSelector } from '../../../store/hooks';
import { logs } from '../../../services/logs';
import { useAppTranslation } from '../../../services/i18n';
import ChevronDownSvg from '../../../assets/icons/recordings/chevron-down.svg';
import CalendarSvg from '../../../assets/icons/recordings/calendar.svg';
import EyeSvg from '../../../assets/icons/delivery-approved/eye.svg';
import Download from '../../../assets/icons/delivery/download.svg';


type Props = NativeStackScreenProps<RootStackParamList, 'DeliveryRecordings'>;

type RecordingStatus = 'Completed' | 'Rejected' | 'Pending';
type TimeFilter = 'All time' | 'Last 7 days' | '15 days' | '30 days';
type DropdownAnchor = { top: number; left: number; width: number };

type RecordingItem = {
  id: string;
  title: string;
  status: RecordingStatus;
  orderId: string;
  dateTime: string;
  companyName: string;
  thumbnail: any;
  duration: string;
  imageUrl: string;
  downloadUrl: string;
};

const { DeliveryImageDownload } = NativeModules as {
  DeliveryImageDownload?: {
    download: (url: string, fileName: string) => Promise<number>;
  };
};

const STATUS_OPTIONS: RecordingStatus[] = ['Completed', 'Rejected', 'Pending'];
const TIME_OPTIONS: TimeFilter[] = ['All time', 'Last 7 days', '15 days', '30 days'];

function getRecordingStatusKey(status: RecordingStatus | 'All Status') {
  if (status === 'All Status') return 'all_status';
  if (status === 'Completed') return 'completed';
  if (status === 'Rejected') return 'rejected';
  return 'pending';
}

function getTimeFilterKey(filter: TimeFilter) {
  if (filter === 'Last 7 days') return 'last_7_days';
  if (filter === '15 days') return 'fifteen_days';
  if (filter === '30 days') return 'thirty_days';
  return 'all_time';
}

export default function DeliveryRecordings({ navigation }: Props) {
  const { t } = useAppTranslation();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;

  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<
    RecordingStatus | 'All Status'
  >('All Status');
  const [selectedTime, setSelectedTime] = useState<TimeFilter>('All time');

  const [statusOpen, setStatusOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [statusAnchor, setStatusAnchor] = useState<DropdownAnchor>({
    top: 0,
    left: 12,
    width: 180,
  });
  const [timeAnchor, setTimeAnchor] = useState<DropdownAnchor>({
    top: 0,
    left: 12,
    width: 180,
  });
  const statusButtonRef = useRef<React.ElementRef<typeof Pressable>>(null);
  const timeButtonRef = useRef<React.ElementRef<typeof Pressable>>(null);

  const accessToken = useAppSelector((s) => s.auth.accessToken);

  const statusParam =
    selectedStatus === 'All Status'
      ? 'all'
      : selectedStatus === 'Completed'
        ? 'completed'
        : selectedStatus === 'Rejected'
          ? 'rejected'
          : 'pending';

  const daysParam =
    selectedTime === 'All time'
      ? undefined
      : selectedTime === 'Last 7 days'
        ? 7
        : selectedTime === '15 days'
          ? 15
          : 30;

  const { data, isLoading, isFetching, isError, error } = useGetDeliveryRecordingsQuery({
    status: statusParam as any,
    search: search.trim(),
    days: daysParam as any,
    limit: 50,
    page: 1,
  });

  const openStatusDropdown = () => {
    const button = statusButtonRef.current;
    if (!button) {
      logs.error('[recordings] status dropdown anchor is unavailable');
      return;
    }

    button.measureInWindow((x, y, buttonWidth, buttonHeight) => {
      const menuWidth = Math.min(Math.max(buttonWidth, 180), width - 24);
      const left = Math.max(12, Math.min(x, width - menuWidth - 12));
      const top = y + buttonHeight + 4;
      setStatusAnchor({ top, left, width: menuWidth });
      setStatusOpen(true);
      logs.info('[recordings] status dropdown aligned to button', { top, left });
    });
  };

  const openTimeDropdown = () => {
    const button = timeButtonRef.current;
    if (!button) {
      logs.error('[recordings] time dropdown anchor is unavailable');
      return;
    }

    button.measureInWindow((x, y, buttonWidth, buttonHeight) => {
      const menuWidth = Math.min(180, width - 24);
      const preferredLeft = x + buttonWidth - menuWidth;
      const left = Math.max(12, Math.min(preferredLeft, width - menuWidth - 12));
      const top = y + buttonHeight + 4;
      setTimeAnchor({ top, left, width: menuWidth });
      setTimeOpen(true);
      logs.info('[recordings] time dropdown aligned to button', { top, left });
    });
  };

  useEffect(() => {
    if (isError) {
      logs.error('[recordings] delivery image list failed', String(error));
      return;
    }

    if (data) {
      logs.info('[recordings] delivery image list loaded', {
        count: data.items?.length ?? 0,
        status: statusParam,
        days: daysParam ?? 'all',
      });
    }
  }, [data, daysParam, error, isError, statusParam]);

  const recordings = useMemo<RecordingItem[]>(() => {
    const items = data?.items ?? [];
    const formatDuration = (seconds?: number | null) => {
      const s = Math.max(0, Number(seconds || 0));
      if (!s) return '--';
      const m = Math.floor(s / 60);
      const r = Math.floor(s % 60);
      return `${m}:${String(r).padStart(2, '0')}`;
    };

    const authHeaders = accessToken
      ? { Authorization: `Bearer ${String(accessToken).trim()}` }
      : undefined;

    return items.map((item: any) => {
      const statusRaw = String(item.status || '').toLowerCase();
      const status: RecordingStatus =
        statusRaw === 'completed'
          ? 'Completed'
          : statusRaw === 'rejected'
            ? 'Rejected'
            : 'Pending';

      const dateTime = `${item.dateLabel || ''}${item.timeLabel ? `: ${item.timeLabel}` : ''}`.trim();

      const thumb = String(item.thumbnailUrl || '').trim();
      const downloadUrl = String(item.downloadUrl || item.viewUrl || '').trim();
      const imageUrl = thumb || String(item.recordingUrl || item.streamUrl || '').trim();
      const thumbnail = thumb
        ? {
            uri: thumb.startsWith('http') ? thumb : `${API_BASE_URL}${thumb}`,
            headers: authHeaders,
          }
        : require('../../../assets/images/recording-thumb-1.png');

      return {
        id: String(item.id || ''),
        title: String(item.title || item.orderId || 'Recording'),
        status,
        orderId: String(item.orderId || ''),
        dateTime,
        companyName: String(item.company || ''),
        thumbnail,
        duration: formatDuration(item.durationSeconds ?? null),
        imageUrl: imageUrl.startsWith('http') ? imageUrl : imageUrl ? `${API_BASE_URL}${imageUrl}` : '',
        downloadUrl: downloadUrl.startsWith('http') ? downloadUrl : downloadUrl ? `${API_BASE_URL}${downloadUrl}` : '',
      };
    });
  }, [accessToken, data?.items]);

  const filteredRecordings = recordings;
  const isInitialLoading = isLoading || (isFetching && !data);
  const showEmptyState = !isInitialLoading && !isError && filteredRecordings.length === 0;

  const totalRecordings = Number(data?.summary?.totalRecordings ?? recordings.length);
  const storageUsed = String(data?.summary?.totalStorageLabel ?? '0 GB');
  const thisMonth = String(data?.summary?.thisMonth ?? 0);

  const onView = (id: string) => {
    navigation.navigate('RecordingDetails', { recordingId: id });
  };

  const onDownload = async (id: string) => {
    const item = recordings.find(recording => recording.id === id);
    const url = item?.imageUrl || item?.downloadUrl || '';
    if (!url) {
      logs.error('[recordings] delivery image URL missing', { id });
      Alert.alert(t('image_not_available'), t('delivery_image_not_ready'));
      return;
    }

    try {
      if (Platform.OS === 'android' && DeliveryImageDownload?.download) {
        await DeliveryImageDownload.download(url, `${item?.orderId || id || 'delivery-image'}.jpg`);
        logs.info('[recordings] Android delivery image download started', { id });
        Alert.alert(t('download_started'), t('delivery_image_saving_downloads'));
        return;
      }

      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) throw new Error('Cannot open image URL');
      await Linking.openURL(url);
      logs.info('[recordings] delivery image opened with platform fallback', {
        id,
        platform: Platform.OS,
      });
    } catch (error) {
      logs.error('[recordings] delivery image download/open failed', String(error));
      Alert.alert(t('download_failed'), t('could_not_open_image_download_link'));
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title={t('delivery_images')}
        subtitle={t('complete_image_audit_trail')}
        onBackPress={() => navigation.goBack()}
        compact
        large
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          isCompact && styles.contentCompact,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{totalRecordings}</Text>
            <Text style={styles.summaryTitle}>{t('total_recordings')}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{storageUsed}</Text>
            <Text style={styles.summaryTitle}>{t('storage_used')}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{thisMonth}</Text>
            <Text style={styles.summaryTitle}>{t('this_month')}</Text>
          </View>
        </View>

        {/* Filters row */}
        <View style={styles.filtersRow}>
          <View style={styles.searchBox}>
            <Image
              source={require('../../../assets/icons/recordings/search.png')}
              style={styles.searchIcon}
              resizeMode="contain"
            />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('search_by')}
              placeholderTextColor="#9CA3AF"
              style={styles.searchInput}
            />
          </View>

          <Pressable
            ref={statusButtonRef}
            style={styles.dropdownBtn}
            onPress={openStatusDropdown}
          >
            <Text style={styles.dropdownBtnText}>{t(getRecordingStatusKey(selectedStatus))}</Text>
            <ChevronDownSvg width={16} height={16} />
          </Pressable>

          <Pressable
            ref={timeButtonRef}
            style={styles.iconDropdownBtn}
            onPress={openTimeDropdown}
          >
            <CalendarSvg width={20} height={20} />
          </Pressable>
        </View>

        {/* Cards */}
        <View style={styles.cardsWrap}>
          {isInitialLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color="#2563EB" />
            </View>
          ) : null}

          {isError ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t('could_not_load_delivery_images')}</Text>
              <Text style={styles.emptyText}>
                {t('check_connection_try_again')}
              </Text>
            </View>
          ) : null}

          {showEmptyState ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t('no_delivery_images_found')}</Text>
              <Text style={styles.emptyText}>
                {t('delivery_images_empty_hint')}
              </Text>
            </View>
          ) : null}

          {filteredRecordings.map(item => (
            <View key={item.id} style={styles.recordCard}>
              <View style={styles.cardHeader}>
                <View style={styles.thumbWrap}>
                  <Image
                    source={item.thumbnail}
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                  {item.duration !== '--' ? (
                    <Text style={styles.durationText}>{item.duration}</Text>
                  ) : null}
                </View>

                <View style={styles.cardHeaderInfo}>
                  <Text style={styles.recordTitle}>{item.title}</Text>

                  <View
                    style={[
                      styles.statusBadge,
                      item.status === 'Completed' &&
                        styles.statusBadgeCompleted,
                      item.status === 'Rejected' && styles.statusBadgeRejected,
                      item.status === 'Pending' && styles.statusBadgePending,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        item.status === 'Completed' &&
                          styles.statusTextCompleted,
                        item.status === 'Rejected' && styles.statusTextRejected,
                        item.status === 'Pending' && styles.statusTextPending,
                      ]}
                    >
                      {t(getRecordingStatusKey(item.status))}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.metaList}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t('delivery_order_id')}</Text>
                  <Text style={styles.metaValue}>{item.orderId}</Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t('date_and_time')}</Text>
                  <Text style={styles.metaValue}>{item.dateTime}</Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t('delivery_company_name')}</Text>
                  <Text style={styles.metaValue}>{item.companyName}</Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionBtn, styles.viewBtn]}
                  onPress={() => onView(item.id)}
                >
                            <EyeSvg width={24} height={24} />


                  <Text style={styles.viewBtnText}>{t('view')}</Text>
                </Pressable>

                <Pressable
                  style={[styles.actionBtn, styles.downloadBtn]}
                  onPress={() => onDownload(item.id)}
                >
                                            <Download width={20} height={20} />

                  <Text style={styles.downloadBtnText}>{t('download')}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 14 }} />
      </ScrollView>

      {/* Status dropdown */}
      <DropdownModal
        visible={statusOpen}
        anchor={statusAnchor}
        options={['All Status', ...STATUS_OPTIONS]}
        selectedValue={selectedStatus}
        getLabel={value => t(getRecordingStatusKey(value as RecordingStatus | 'All Status'))}
        onClose={() => setStatusOpen(false)}
        onSelect={value => {
          logs.info('[recordings] status filter selected', { value });
          setSelectedStatus(value as RecordingStatus | 'All Status');
          setStatusOpen(false);
        }}
      />

      {/* Time dropdown */}
      <DropdownModal
        visible={timeOpen}
        anchor={timeAnchor}
        options={TIME_OPTIONS}
        selectedValue={selectedTime}
        getLabel={value => t(getTimeFilterKey(value as TimeFilter))}
        onClose={() => setTimeOpen(false)}
        onSelect={value => {
          logs.info('[recordings] time filter selected', { value });
          setSelectedTime(value as TimeFilter);
          setTimeOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

type DropdownModalProps = {
  visible: boolean;
  anchor: DropdownAnchor;
  options: string[];
  selectedValue: string;
  getLabel: (value: string) => string;
  onSelect: (value: string) => void;
  onClose: () => void;
};

function DropdownModal({
  visible,
  anchor,
  options,
  selectedValue,
  getLabel,
  onSelect,
  onClose,
}: DropdownModalProps) {
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

  content: {
    padding: 16,
    gap: 14,
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
    minHeight: 96,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 14,
    justifyContent: 'center',
  },

  summaryValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
  },

  summaryTitle: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    color: '#6B7280',
  },

  filtersRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },

  searchBox: {
    flex: 1.2,
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  searchIcon: {
    width: 18,
    height: 18,
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    color: '#111827',
    fontSize: 15,
    fontWeight: '500',
  },

  dropdownBtn: {
    flex: 1,
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  dropdownBtnText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '500',
  },

  dropdownIcon: {
    width: 16,
    height: 16,
  },

  iconDropdownBtn: {
    width: 50,
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconDropdownImage: {
    width: 20,
    height: 20,
  },

  cardsWrap: {
    gap: 14,
  },

  loadingCard: {
    paddingVertical: 18,
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },

  emptyTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    color: '#111827',
  },

  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
    color: '#6B7280',
  },

  recordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
  },

  cardHeader: {
    flexDirection: 'row',
    gap: 12,
  },

  thumbWrap: {
    width: 84,
    height: 84,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },

  thumbnail: {
    width: '100%',
    height: '100%',
  },

  durationText: {
    position: 'absolute',
    right: 6,
    bottom: 4,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  cardHeaderInfo: {
    flex: 1,
    justifyContent: 'flex-start',
  },

  recordTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
    color: '#111827',
  },

  statusBadge: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },

  statusBadgeCompleted: {
    backgroundColor: '#ECFDF3',
    borderColor: '#BBF7D0',
  },

  statusBadgeRejected: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },

  statusBadgePending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },

  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },

  statusTextCompleted: {
    color: '#16A34A',
  },

  statusTextRejected: {
    color: '#DC2626',
  },

  statusTextPending: {
    color: '#D97706',
  },

  metaList: {
    marginTop: 16,
    gap: 10,
  },

  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },

  metaLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
  },

  metaValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: '#111827',
  },

  actionRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 12,
  },

  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },

  viewBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
  },

  downloadBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#93C5FD',
  },

  actionIcon: {
    width: 18,
    height: 18,
  },

  viewBtnText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
  },

  downloadBtnText: {
    color: '#2362EB',
    fontSize: 15,
    fontWeight: '700',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },

  dropdownSheet: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  dropdownItem: {
    minHeight: 42,
    borderRadius: 10,
    paddingHorizontal: 12,
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
});
