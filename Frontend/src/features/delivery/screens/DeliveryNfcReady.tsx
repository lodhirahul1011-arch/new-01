import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {DeliveryStackParamList} from '../../../navigation/tabs/stacks/DeliveryStack';
import {AppAlert as Alert} from '../../../components/modals/AppAlert';
import {useDeliveryDetails} from '../../../hooks/useDeliverySchedules';
import type {DeliverySchedule} from '../../../services/api/smsDeliveryService';
import {useSelectDeliveryVerificationMethodMutation} from '../../../services/api/deliveryApi';
import ArrowLeftSvg from '../../../assets/icons/blue-header/arrow-left.svg';
import YellowStarSvg from '../../../assets/icons/common/yellow-star.svg';
import UserSvg from '../../../assets/icons/common/user.svg';
import EyeSvg from '../../../assets/icons/delivery/eye.svg';
import CheckmarkCircleSvg from '../../../assets/icons/delivery/checkmark-circle-04.svg';
import PackageDetailSvg from '../../../assets/icons/delivery/package-detail.svg';
import NfcCardSvg from '../../../assets/icons/delivery/nfc-card.svg';
import SmartPhoneSvg from '../../../assets/icons/delivery/smart-phone-01.svg';
import DeliveryNoPreview from '../components/DeliveryNoPreview';
import {logs} from '../../../services/logs';

type Props = NativeStackScreenProps<DeliveryStackParamList, 'DeliveryNfcReady'>;

export function DeliveryNfcReadyScreen({navigation, route}: Props) {
  const scheduleId = route.params.scheduleId;
  const {delivery, loading, error, refresh} = useDeliveryDetails(scheduleId);
  const [selectedMethod, setSelectedMethod] = useState<
    'nfc_card' | 'approve_in_app'
  >('nfc_card');
  const [selectVerificationMethod, {isLoading: isSelectingMethod}] =
    useSelectDeliveryVerificationMethodMutation();

  const goToHistory = useCallback(() => {
    navigation.getParent()?.getParent?.()?.navigate?.('DeliveryHistory' as never);
  }, [navigation]);

  const selectApproveViaApp = useCallback(async () => {
    if (isSelectingMethod) {
      logs.info('[delivery-verification] duplicate app approval selection ignored', {
        scheduleId,
      });
      return;
    }

    setSelectedMethod('approve_in_app');
    logs.info('[delivery-verification] switching NFC to app approval', {
      scheduleId,
    });
    try {
      await selectVerificationMethod({
        scheduleId,
        method: 'approve_in_app',
      }).unwrap();
      logs.info('[delivery-verification] switched NFC to app approval', {
        scheduleId,
      });
      navigation.goBack();
    } catch (selectError: any) {
      setSelectedMethod('nfc_card');
      logs.error('[delivery-verification] failed to switch NFC to app approval', {
        scheduleId,
        error: selectError,
      });
      Alert.alert(
        'Could not select app approval',
        selectError?.data?.message ||
          selectError?.message ||
          'Please try again.',
      );
    }
  }, [isSelectingMethod, navigation, scheduleId, selectVerificationMethod]);

  const confirmCancel = useCallback(() => {
    Alert.alert(
      'Cancel NFC Card Scan?',
      'If you cancel the NFC card scan, you will need to approve this delivery from the mobile app.',
      [
        {text: 'Keep NFC', style: 'cancel'},
        {
          text: 'Cancel NFC',
          style: 'destructive',
          onPress: selectApproveViaApp,
        },
      ],
    );
  }, [selectApproveViaApp]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading delivery details...</Text>
      </SafeAreaView>
    );
  }

  if (error || !delivery) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>{error || 'Delivery details not available'}</Text>
        <Pressable style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const companyName = formatCompanyName(getDisplayCompany(delivery));
  const partnerName = getPartnerLabel(delivery, companyName);
  const partnerRating = typeof delivery.rating === 'number' ? String(delivery.rating) : '4.8';
  const paymentLabel = 'Already Paid';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor="#2563EB" />}>
        <View style={styles.hero}>
          {getScheduleImageUrl(delivery) ? (
            <Image source={{uri: getScheduleImageUrl(delivery)}} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroPlaceholder}>
              <DeliveryNoPreview hero />
            </View>
          )}
          <View style={styles.heroOverlay} />
          <View style={styles.heroTop}>
            <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
              <ArrowLeftSvg width={20} height={20} />
            </Pressable>
          </View>
          <View style={styles.livePill}>
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>Your Delivery Has Arrived</Text>
            <Text style={styles.heroSubtitle}>Please confirm receipt of your package</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.card}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconWrap}>
                <PackageDetailSvg width={18} height={18} />
              </View>
              <Text style={styles.sectionTitle}>Package Details</Text>
            </View>
            <DetailRow label="OTP" value={delivery.otpCode || delivery.latestSmsId?.extractedData?.otpCode || '--'} />
            <DetailRow label="Order ID" value={getDetailOrderId(delivery)} />
            <DetailRow label="Payment" value={paymentLabel} valueStyle={styles.paymentGreen} />
            <DetailRow label="Company name" value={companyName} />
          </View>

          <Text style={styles.sectionHeading}>Delivery Partner</Text>
          <View style={styles.partnerCard}>
            <View style={styles.partnerRow}>
              <View style={styles.partnerAvatar}>
                <UserSvg width={28} height={28} />
              </View>
              <View style={styles.partnerBody}>
                <Text style={styles.partnerName}>{partnerName}</Text>
                <View style={styles.partnerMetaRow}>
                  <Text style={styles.partnerCompany}>{companyName}</Text>
                  <Text style={styles.partnerDot}>•</Text>
                  <YellowStarSvg width={12} height={12} />
                  <Text style={styles.partnerRating}>{partnerRating}</Text>
                </View>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.verifiedRow}>
              <CheckmarkCircleSvg width={20} height={20} />
              <Text style={styles.verifiedText}>Verified {companyName} delivery partner</Text>
            </View>
          </View>

          <Text style={styles.sectionHeading}>Choose Verification Method</Text>
          <View style={styles.methodsRow}>
            <View
              style={[
                styles.methodCard,
                selectedMethod === 'nfc_card' && styles.methodCardActive,
              ]}>
              <View style={styles.methodIconWrap}>
                <NfcCardSvg width={22} height={22} />
              </View>
              <View>
                <Text style={styles.methodTitle}>Tap NFC Card</Text>
                <Text style={styles.methodSubtitle}>Quick & secure</Text>
              </View>
            </View>

            <Pressable
              style={[
                styles.methodCard,
                selectedMethod === 'approve_in_app' && styles.methodCardActive,
                isSelectingMethod && styles.disabled,
              ]}
              onPress={selectApproveViaApp}
              disabled={isSelectingMethod}>
              <View style={styles.methodIconWrap}>
                <SmartPhoneSvg width={22} height={22} />
              </View>
              <View>
                <Text style={styles.methodTitle}>Approve via App</Text>
                <Text style={styles.methodSubtitle}>Remote approval</Text>
              </View>
            </Pressable>
          </View>

          {selectedMethod === 'nfc_card' ? (
            <View style={styles.readyCard}>
              <View style={styles.readyIconWrap}>
                <NfcCardSvg width={28} height={28} />
              </View>
              <Text style={styles.readyTitle}>Ready to Scan?</Text>
              <Text style={styles.readySubtitle}>Tap your NFC Card on the dvaari reader</Text>
              <Pressable
                style={[styles.cancelBtn, isSelectingMethod && styles.disabled]}
                onPress={confirmCancel}
                disabled={isSelectingMethod}>
                <Text style={styles.cancelText}>
                  {isSelectingMethod ? 'Switching...' : 'Cancel'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable style={styles.historyBtn} onPress={goToHistory}>
            <EyeSvg width={20} height={20} />
            <Text style={styles.historyText}>View History</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: object;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueStyle]}>{value}</Text>
    </View>
  );
}

function formatCompanyName(value: string): string {
  if (!value || value === 'unknown') return 'Delivery';
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function extractCompanyFromRawText(rawText?: string): string {
  const text = String(rawText || '');
  return text.match(/^([A-Za-z][A-Za-z0-9 &.-]{2,40})\s*:/)?.[1]?.trim() || '';
}

function getDisplayCompany(delivery: DeliverySchedule): string {
  return extractCompanyFromRawText(delivery.latestSmsId?.rawText) || delivery.deliveryCompany || 'unknown';
}

function getPartnerLabel(delivery: DeliverySchedule, companyName: string): string {
  const candidate = delivery.riderName || delivery.latestSmsId?.extractedData?.riderName || '';
  return candidate.trim() || `${companyName} Partner`;
}

function getDetailOrderId(delivery: DeliverySchedule): string {
  const hintedOrderId = delivery.orderHint || delivery.latestSmsId?.extractedData?.orderHint;
  if (hintedOrderId && !/\b(?:awb|tracking id|track id)\b/i.test(hintedOrderId)) return `#${hintedOrderId}`;
  if (!delivery.referenceId || delivery.referenceId.startsWith('provisional:')) return '--';
  return `#${delivery.referenceId}`;
}

function getScheduleImageUrl(delivery: DeliverySchedule): string {
  return (
    delivery.imageUrl ||
    delivery.thumbnailUrl ||
    delivery.latestSmsId?.extractedData?.imageUrl ||
    delivery.latestSmsId?.extractedData?.thumbnailUrl ||
    ''
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#FFFFFF'},
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
  },
  loadingText: {marginTop: 12, fontSize: 14, fontWeight: '600', color: '#5B616B'},
  errorText: {fontSize: 16, fontWeight: '700', color: '#D32F2F', textAlign: 'center'},
  retryButton: {marginTop: 14, backgroundColor: '#2563EB', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10},
  retryButtonText: {color: '#FFFFFF', fontWeight: '700', fontSize: 14},
  hero: {height: 269, justifyContent: 'space-between', backgroundColor: '#D9C5A6'},
  heroImage: {...StyleSheet.absoluteFillObject, width: undefined, height: undefined},
  heroPlaceholder: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#C7A77B'},
  heroOverlay: {...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.40)'},
  heroTop: {paddingTop: 34, paddingHorizontal: 16},
  backBtn: {width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
  livePill: {
    alignSelf: 'flex-start',
    marginLeft: 20,
    marginTop: 42,
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#FF2D36',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveText: {fontSize: 10, fontWeight: '800', color: '#FFFFFF'},
  heroBody: {paddingHorizontal: 20, paddingBottom: 18},
  heroTitle: {fontSize: 18, fontWeight: '800', color: '#FFFFFF'},
  heroSubtitle: {marginTop: 8, fontSize: 17, lineHeight: 22, fontWeight: '500', color: '#FFFFFF'},
  body: {paddingHorizontal: 20, paddingTop: 40, paddingBottom: 24, backgroundColor: '#FFFFFF'},
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E6E6E6',
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 6},
    elevation: 4,
  },
  sectionTitleRow: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16},
  sectionIconWrap: {width: 22, height: 22, alignItems: 'center', justifyContent: 'center'},
  sectionTitle: {fontSize: 20, fontWeight: '800', color: '#1F1F1F'},
  detailRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10},
  detailLabel: {fontSize: 15, fontWeight: '500', color: '#3E3E3E'},
  detailValue: {flexShrink: 1, textAlign: 'right', fontSize: 15, fontWeight: '500', color: '#202124'},
  paymentGreen: {color: '#14C956'},
  sectionHeading: {marginTop: 19, marginBottom: 12, fontSize: 16, fontWeight: '800', color: '#171717'},
  partnerCard: {borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0', paddingHorizontal: 16, paddingVertical: 20, backgroundColor: '#FFFFFF'},
  partnerRow: {flexDirection: 'row', alignItems: 'center'},
  partnerAvatar: {width: 48, height: 48, borderRadius: 24, backgroundColor: '#3167EA', alignItems: 'center', justifyContent: 'center'},
  partnerBody: {flex: 1, marginLeft: 16},
  partnerName: {fontSize: 16, fontWeight: '800', color: '#242424'},
  partnerMetaRow: {marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4},
  partnerCompany: {fontSize: 14, fontWeight: '500', color: '#4A4A4A'},
  partnerDot: {fontSize: 12, color: '#4A4A4A'},
  partnerRating: {fontSize: 14, fontWeight: '600', color: '#202124'},
  divider: {marginTop: 17, marginBottom: 15, height: 1, backgroundColor: '#D6D6D6'},
  verifiedRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  verifiedText: {fontSize: 15, fontWeight: '500', color: '#2563EB'},
  methodsRow: {flexDirection: 'row', gap: 16},
  methodCard: {
    flex: 1,
    minHeight: 150,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 20,
    justifyContent: 'space-between',
  },
  methodCardActive: {borderColor: '#2563EB'},
  methodIconWrap: {width: 48, height: 48, borderRadius: 24, backgroundColor: '#EEF3FF', alignItems: 'center', justifyContent: 'center'},
  methodTitle: {marginTop: 14, fontSize: 18, fontWeight: '800', color: '#242424'},
  methodSubtitle: {marginTop: 4, fontSize: 14, lineHeight: 18, fontWeight: '500', color: '#707070'},
  readyCard: {
    marginTop: 17,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#2563EB',
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  readyIconWrap: {width: 56, height: 56, borderRadius: 28, backgroundColor: '#EEF3FF', alignItems: 'center', justifyContent: 'center'},
  readyTitle: {marginTop: 34, fontSize: 16, fontWeight: '800', color: '#222222'},
  readySubtitle: {marginTop: 6, fontSize: 14, fontWeight: '500', color: '#777777', textAlign: 'center'},
  cancelBtn: {
    marginTop: 17,
    minWidth: 91,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  cancelText: {fontSize: 14, fontWeight: '800', color: '#2563EB'},
  disabled: {opacity: 0.6},
  historyBtn: {marginTop: 24, height: 44, borderRadius: 8, backgroundColor: '#F1F1F1', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8},
  historyText: {fontSize: 16, fontWeight: '800', color: '#202124'},
});
