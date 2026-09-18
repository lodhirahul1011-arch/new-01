import React, { useMemo, useState } from 'react';
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
  Share,
  NativeModules,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { AppAlert as Alert } from '../../../components/modals/AppAlert';
import BlueHeader from '../../../components/layout/BlueHeader';
import { API_BASE_URL } from '../../../config/env';
import {
  useGetDeliveryRecordingDetailQuery,
  useGetDeliveryRecordingsQuery,
  useGetTabletRecordingLinkMutation,
  useLazyGetDeliveryRecordingShareQuery,
} from '../../../services/api/recordingsApi';
import { useAppSelector } from '../../../store/hooks';
import ChevronDownSvg from '../../../assets/icons/recordings/chevron-down.svg';
import CalendarSvg from '../../../assets/icons/recordings/calendar.svg';
import ClockSvg from '../../../assets/icons/away-mode/clock.svg';
import DownloadSvg from '../../../assets/icons/delivery/download-05.svg';
import ShareSvg from '../../../assets/icons/delivery/share.svg';
import { logs } from '../../../services/logs';

type Props = NativeStackScreenProps<RootStackParamList, 'RecordingDetails'>;

type RecordingStatus = 'Completed' | 'Rejected' | 'Pending';
type TimeFilter = 'Last 7 days' | '15 days' | '30 days';

type RecordingItem = {
  id: string;
  title: string;
  status: RecordingStatus;
  orderId: string;
  dateTime: string;
  companyName: string;
  otp: string;
  fileSize: string;
  quality: string;
  cloudBackup: string;
  displayDate: string;
  thumbnail: any;
};

const { DeliveryImageDownload } = NativeModules as {
  DeliveryImageDownload?: {
    download: (url: string, fileName: string) => Promise<number>;
  };
};

const STATUS_OPTIONS: Array<RecordingStatus | 'All Status'> = [
  'All Status',
  'Completed',
  'Rejected',
  'Pending',
];

const TIME_OPTIONS: TimeFilter[] = ['Last 7 days', '15 days', '30 days'];

export default function RecordingDetails({ navigation, route }: Props) {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;

  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] =
    useState<RecordingStatus | 'All Status'>('All Status');
  const [selectedTime, setSelectedTime] = useState<TimeFilter>('Last 7 days');

  const [statusOpen, setStatusOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const deliveryId = String(route.params.recordingId || '');

  const { data: detail, isLoading: isDetailLoading } =
    useGetDeliveryRecordingDetailQuery({ deliveryId });

  const { data: summaryResp } = useGetDeliveryRecordingsQuery({
    status: 'all',
    days: 7,
    search: '',
    limit: 1,
    page: 1,
  });

  const [getTabletLink] = useGetTabletRecordingLinkMutation();
  const [triggerShare] = useLazyGetDeliveryRecordingShareQuery();

  const totalRecordings = String(summaryResp?.summary?.totalRecordings ?? 0);
  const storageUsed = String(summaryResp?.summary?.totalStorageLabel ?? '0 GB');
  const thisMonth = String(summaryResp?.summary?.thisMonth ?? 0);

  const authHeaders = useMemo(
    () =>
      accessToken
        ? { Authorization: `Bearer ${String(accessToken).trim()}` }
        : undefined,
    [accessToken],
  );

  const extractRecordingId = (url?: string) => {
    const raw = String(url || '');
    const m = raw.match(/\/api\/v1\/tablet\/recordings\/([^/]+)\/link/i);
    return m?.[1] ? String(m[1]) : '';
  };

  const fileSizeLabel = (bytes?: number | null) => {
    const b = Number(bytes || 0);
    if (!b) return '--';
    const mb = b / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(0)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  };

  const detailStatusRaw = String(detail?.status || '').toLowerCase();
  const status: RecordingStatus =
    detailStatusRaw === 'delivered'
      ? 'Completed'
      : detailStatusRaw === 'rejected'
        ? 'Rejected'
        : 'Pending';
  const fileType = String(detail?.recordingDetails?.fileType || '').toLowerCase();
  const proofType = String(detail?.recordingDetails?.type || '').toLowerCase();
  const isImageProof =
    proofType === 'image' ||
    ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(fileType);

  const currentRecording: RecordingItem = useMemo(() => {
    const thumb = String(detail?.recordingDetails?.thumbnailUrl || '').trim();
    const thumbnail = thumb
      ? {
          uri: thumb.startsWith('http') ? thumb : `${API_BASE_URL}${thumb}`,
          headers: authHeaders,
        }
      : require('../../../assets/images/recording-thumb-1.png');

    const dateTime = `${detail?.dateLabel || ''}${detail?.timeLabel ? `: ${detail.timeLabel}` : ''}`.trim();

    const displayDate = `${detail?.dateLabel || ''}${detail?.timeLabel ? ` at ${detail.timeLabel}` : ''}`.trim();

    return {
      id: deliveryId,
      title: String(detail?.title || detail?.orderId || 'Recording'),
      status,
      orderId: String(detail?.orderId || ''),
      dateTime,
      companyName: String(detail?.company || ''),
      otp: String(detail?.otp || detail?.verificationCode || ''),
      fileSize: fileSizeLabel(detail?.recordingDetails?.sizeBytes ?? null),
      quality: isImageProof ? 'ImageKit Image' : String(detail?.recordingDetails?.quality || 'HD'),
      cloudBackup: 'Yes',
      displayDate: displayDate || '--',
      thumbnail,
    };
  }, [authHeaders, deliveryId, detail, isImageProof, status]);

  if (isDetailLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <BlueHeader
          title="Back to Image"
          subtitle="Complete image audit trail"
          onBackPress={() => navigation.goBack()}
          large
        />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  const openStream = async () => {
    const streamUrl = String(detail?.recordingDetails?.streamUrl || '').trim();
    if (isImageProof && streamUrl) {
      logs.info('[recording-details] opening image proof stream', {
        deliveryId,
        platform: Platform.OS,
      });
      await Linking.openURL(streamUrl.startsWith('http') ? streamUrl : `${API_BASE_URL}${streamUrl}`);
      return;
    }

    const recordingId = extractRecordingId(streamUrl);
    if (!recordingId) return;
    const res = await getTabletLink({ recordingId }).unwrap();
    const tempUrl = String(res?.tempUrl || '').trim();
    if (!tempUrl) return;
    const url = tempUrl.startsWith('http') ? tempUrl : `${API_BASE_URL}${tempUrl}`;
    logs.info('[recording-details] opening tablet recording stream', { deliveryId });
    await Linking.openURL(url);
  };

  const onDownload = async () => {
    const streamUrl = String(detail?.recordingDetails?.streamUrl || '').trim();
    if (isImageProof && streamUrl && Platform.OS === 'android' && DeliveryImageDownload?.download) {
      const url = streamUrl.startsWith('http') ? streamUrl : `${API_BASE_URL}${streamUrl}`;
      await DeliveryImageDownload.download(url, `${currentRecording.orderId || deliveryId || 'delivery-image'}.jpg`);
      logs.info('[recording-details] Android image proof download started', { deliveryId });
      Alert.alert('Download started', 'Delivery image is being saved to Downloads/Dvaari.');
      return;
    }

    logs.info('[recording-details] using platform stream fallback for download', {
      deliveryId,
      platform: Platform.OS,
    });
    await openStream();
  };

  const onShare = async () => {
    try {
      const share = await triggerShare({ deliveryId }).unwrap();
      const url = String(share?.url || '').trim();
      const text = String(share?.shareText || '').trim();
      await Share.share({ message: text ? `${text} ${url}`.trim() : url });
      logs.info('[recording-details] recording share sheet opened', { deliveryId });
    } catch (error) {
      logs.error('[recording-details] recording share failed', String(error));
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title="Back to Image"
        subtitle="Complete image audit trail"
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
            <Text style={styles.summaryTitle}>Total Recordings</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{storageUsed}</Text>
            <Text style={styles.summaryTitle}>Storage Used</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{thisMonth}</Text>
            <Text style={styles.summaryTitle}>This month</Text>
          </View>
        </View>

        {/* Filters */}
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
              placeholder="search by"
              placeholderTextColor="#9CA3AF"
              style={styles.searchInput}
            />
          </View>

          <Pressable
            style={styles.dropdownBtn}
            onPress={() => setStatusOpen(true)}
          >
            <Text style={styles.dropdownBtnText}>{selectedStatus}</Text>
            <ChevronDownSvg width={16} height={16} />
          </Pressable>

          <Pressable
            style={styles.iconDropdownBtn}
            onPress={() => setTimeOpen(true)}
          >
            <CalendarSvg width={20} height={20} />
          </Pressable>
        </View>

        {/* Recording detail card */}
        <View style={styles.detailCard}>
          <View style={styles.playerWrap}>
            <Image
              source={currentRecording.thumbnail}
              style={styles.playerImage}
              resizeMode="cover"
            />

            {!isImageProof ? (
              <>
              

                <View style={styles.progressWrap}>
                  <Text style={styles.progressTime}>0:00</Text>
                  <View style={styles.progressBar}>
                    <View style={styles.progressFilled} />
                  </View>
                  <Text style={styles.progressTime}>2:45</Text>
                </View>
              </>
            ) : (
              <View style={styles.imageBadge}>
                <Text style={styles.imageBadgeText}>Image</Text>
              </View>
            )}
          </View>

          <View style={styles.titleRow}>
            <Text style={styles.detailTitle}>{currentRecording.title}</Text>

            <View style={styles.topActionRow}>
              <Pressable style={styles.iconSquareBtn} onPress={onDownload}>
                                                  <DownloadSvg width={18} height={18} />

              </Pressable>

              <Pressable style={styles.iconSquareBtn} onPress={onShare}>
                                                <ShareSvg width={18} height={18} />

              </Pressable>
            </View>
          </View>

          <View style={styles.dateRow}>
                                             <ClockSvg width={18} height={18} />

            <Text style={styles.dateText}>{currentRecording.displayDate}</Text>
          </View>

          <Text style={styles.sectionHeading}>Delivery Information</Text>

          <View style={styles.metaList}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Order ID</Text>
              <Text style={styles.metaValue}>{currentRecording.orderId}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date & Time</Text>
              <Text style={styles.metaValue}>{currentRecording.dateTime}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Company name</Text>
              <Text style={styles.metaValue}>{currentRecording.companyName}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>OTP</Text>
              <Text style={styles.metaValue}>{currentRecording.otp}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Status</Text>
              <Text
                style={[
                  styles.metaValue,
                  currentRecording.status === 'Completed' && styles.statusCompleted,
                  currentRecording.status === 'Rejected' && styles.statusRejected,
                  currentRecording.status === 'Pending' && styles.statusPending,
                ]}
              >
                {currentRecording.status}
              </Text>
            </View>
          </View>

          <Text style={[styles.sectionHeading, { marginTop: 18 }]}>
            {isImageProof ? 'Image Details' : 'Recording Details'}
          </Text>

          <View style={styles.metaList}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>File Size:</Text>
              <Text style={styles.metaValue}>{currentRecording.fileSize}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{isImageProof ? 'File Type:' : 'Quality:'}</Text>
              <Text style={styles.metaValue}>{currentRecording.quality}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Cloud Backup:</Text>
              <Text
                style={[
                  styles.metaValue,
                  currentRecording.cloudBackup === 'Yes' && styles.statusCompleted,
                ]}
              >
                {currentRecording.cloudBackup}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.footerInfoBox}>
          <Text style={styles.footerInfoText}>
            Delivery images are stored on ImageKit for audit trail
          </Text>
        </View>

        <View style={{ height: 14 }} />
      </ScrollView>

      <DropdownModal
        visible={statusOpen}
        options={STATUS_OPTIONS}
        selectedValue={selectedStatus}
        onClose={() => setStatusOpen(false)}
        onSelect={value => {
          setSelectedStatus(value as RecordingStatus | 'All Status');
          setStatusOpen(false);
        }}
      />

      <DropdownModal
        visible={timeOpen}
        options={TIME_OPTIONS}
        selectedValue={selectedTime}
        onClose={() => setTimeOpen(false)}
        onSelect={value => {
          setSelectedTime(value as TimeFilter);
          setTimeOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

type DropdownModalProps = {
  visible: boolean;
  options: string[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
};

function DropdownModal({
  visible,
  options,
  selectedValue,
  onSelect,
  onClose,
}: DropdownModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.dropdownSheet}>
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
                      {option}
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

  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
  },

  playerWrap: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },

  playerImage: {
    width: '100%',
    height: 240,
    borderRadius: 14,
  },

  playBtn: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    marginLeft: -28,
    marginTop: -28,
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  playIcon: {
    width: 26,
    height: 26,
  },

  progressWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  progressTime: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  progressBar: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },

  progressFilled: {
    width: '42%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2362EB',
  },

  imageBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.72)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  imageBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  titleRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },

  detailTitle: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    color: '#111827',
  },

  topActionRow: {
    flexDirection: 'row',
    gap: 10,
  },

  iconSquareBtn: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  squareActionIcon: {
    width: 22,
    height: 22,
  },

  dateRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  clockIcon: {
    width: 20,
    height: 20,
  },

  dateText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },

  sectionHeading: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },

  metaList: {
    marginTop: 14,
    gap: 12,
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

  statusCompleted: {
    color: '#16A34A',
  },

  statusRejected: {
    color: '#DC2626',
  },

  statusPending: {
    color: '#D97706',
  },

  footerInfoBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },

  footerInfoText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: '#6B7280',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  dropdownSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignSelf: 'center',
    width: 260,
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
