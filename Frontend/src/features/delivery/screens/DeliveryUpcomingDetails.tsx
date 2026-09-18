import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';

import {useDeliveryDetails} from '../../../hooks/useDeliverySchedules';
import {AppAlert as Alert} from '../../../components/modals/AppAlert';
import type {DeliveryStackParamList} from '../../../navigation/tabs/stacks/DeliveryStack';
import type {DeliverySchedule} from '../../../services/api/smsDeliveryService';
import DeliveryNoPreview from '../components/DeliveryNoPreview';
import ArrowLeftSvg from '../../../assets/icons/blue-header/arrow-left.svg';
import YellowStarSvg from '../../../assets/icons/common/yellow-star.svg';
import UserSvg from '../../../assets/icons/common/user.svg';
import EyeSvg from '../../../assets/icons/delivery/eye.svg';
import CheckmarkCircleSvg from '../../../assets/icons/delivery/checkmark-circle-04.svg';
import PackageDetailSvg from '../../../assets/icons/delivery/package-detail.svg';
import NfcCardSvg from '../../../assets/icons/delivery/nfc-card.svg';
import SmartPhoneSvg from '../../../assets/icons/delivery/smart-phone-01.svg';
import {useAppTranslation} from '../../../services/i18n';
import {useSelectDeliveryVerificationMethodMutation} from '../../../services/api/deliveryApi';
import {logs} from '../../../services/logs';

type Props = NativeStackScreenProps<DeliveryStackParamList, 'DeliveryDetails'>;
type SelectedMethod = 'nfc_card' | 'approve_in_app' | null;

export function DeliveryUpcomingDetailsScreen({navigation, route}: Props) {
  const {t} = useAppTranslation();
  const scheduleId = route.params?.scheduleId ?? '';
  const [selectedMethod, setSelectedMethod] = useState<SelectedMethod>(null);
  const {delivery, loading, error, refresh} = useDeliveryDetails(scheduleId);
  const [selectVerificationMethod, {isLoading: isSelectingMethod}] =
    useSelectDeliveryVerificationMethodMutation();

  useEffect(() => {
    if (delivery?.verificationMethod === 'nfc') {
      setSelectedMethod('nfc_card');
    } else if (delivery?.verificationMethod === 'app') {
      setSelectedMethod('approve_in_app');
    }
  }, [delivery?.verificationMethod]);

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      logs.info('[delivery-verification] details screen focused', {scheduleId});
      refresh().catch(focusError => {
        logs.error('[delivery-verification] focus refresh failed', {
          scheduleId,
          error: focusError,
        });
      });
    }, [refresh, scheduleId]),
  );

  const openDialer = useCallback(async (phone: string) => {
    try {
      logs.info('[delivery-verification] opening delivery partner dialer');
      await Linking.openURL(`tel:${phone}`);
      logs.info('[delivery-verification] delivery partner dialer opened');
    } catch (linkError) {
      logs.error('[delivery-verification] failed to open delivery partner dialer', {
        error: linkError,
      });
    }
  }, []);

  const goToHistory = useCallback(() => {
    navigation.getParent()?.getParent?.()?.navigate?.('DeliveryHistory' as never);
  }, [navigation]);

  const selectNfcCard = useCallback(async () => {
    if (!scheduleId || isSelectingMethod) {
      logs.info('[delivery-verification] NFC selection ignored', {
        hasScheduleId: !!scheduleId,
        isSelectingMethod,
      });
      return;
    }

    if (delivery?.verificationMethod === 'nfc') {
      logs.info('[delivery-verification] opening active NFC verification', {
        scheduleId,
      });
      navigation.navigate('DeliveryNfcReady', {scheduleId});
      return;
    }

    setSelectedMethod('nfc_card');
    try {
      logs.info('[delivery-verification] NFC selection started', {scheduleId});
      await selectVerificationMethod({scheduleId, method: 'nfc_card'}).unwrap();
      logs.info('[delivery-verification] NFC selection completed', {scheduleId});
      navigation.navigate('DeliveryNfcReady', {scheduleId});
    } catch (selectError: any) {
      logs.error('[delivery-verification] NFC selection failed', {
        scheduleId,
        error: selectError,
      });
      setSelectedMethod(null);
      Alert.alert(
        'Could not select NFC',
        selectError?.data?.message || selectError?.message || 'Please try again.',
      );
    }
  }, [delivery?.verificationMethod, isSelectingMethod, navigation, scheduleId, selectVerificationMethod]);

  const selectApproveViaApp = useCallback(async () => {
    if (!scheduleId || isSelectingMethod) {
      logs.info('[delivery-verification] app approval selection ignored', {
        hasScheduleId: !!scheduleId,
        isSelectingMethod,
      });
      return;
    }

    setSelectedMethod('approve_in_app');
    try {
      logs.info('[delivery-verification] app approval selection started', {
        scheduleId,
      });
      await selectVerificationMethod({
        scheduleId,
        method: 'approve_in_app',
      }).unwrap();
      logs.info('[delivery-verification] app approval selection completed', {
        scheduleId,
      });
      await refresh();
    } catch (selectError: any) {
      logs.error('[delivery-verification] app approval selection failed', {
        scheduleId,
        error: selectError,
      });
      setSelectedMethod(
        delivery?.verificationMethod === 'nfc' ? 'nfc_card' : null,
      );
      Alert.alert(
        'Could not select app approval',
        selectError?.data?.message ||
          selectError?.message ||
          'Please try again.',
      );
    }
  }, [
    delivery?.verificationMethod,
    isSelectingMethod,
    refresh,
    scheduleId,
    selectVerificationMethod,
  ]);

  const confirmCancelNfc = useCallback(() => {
    if (!scheduleId || isSelectingMethod) {
      return;
    }

    Alert.alert(
      'Cancel NFC Card Scan?',
      'If you cancel the NFC card scan, you will need to approve this delivery from the mobile app.',
      [
        {text: 'Keep NFC', style: 'cancel'},
        {
          text: 'Cancel NFC',
          style: 'destructive',
          onPress: async () => {
            try {
              logs.info('[delivery-verification] NFC cancellation started', {
                scheduleId,
              });
              await selectVerificationMethod({scheduleId, method: 'approve_in_app'}).unwrap();
              setSelectedMethod('approve_in_app');
              await refresh();
              logs.info('[delivery-verification] NFC cancellation completed', {
                scheduleId,
              });
            } catch (cancelError: any) {
              logs.error('[delivery-verification] NFC cancellation failed', {
                scheduleId,
                error: cancelError,
              });
              Alert.alert(
                'Could not cancel NFC',
                cancelError?.data?.message || cancelError?.message || 'Please try again.',
              );
            }
          },
        },
      ],
    );
  }, [isSelectingMethod, refresh, scheduleId, selectVerificationMethod]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>{t('delivery_loading_details')}</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryButtonText}>{t('try_again')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!scheduleId || !delivery) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>{t('delivery_details_not_available')}</Text>
      </SafeAreaView>
    );
  }

  const companyName = formatCompanyName(getDisplayCompany(delivery));
  const partnerName = getPartnerLabel(delivery, companyName);
  const partnerRating = formatRating(delivery.rating);
  const statusLabel = getHeroTitle(delivery.currentStatus, t);
  const paymentLabel = getPaymentLabel(delivery.currentStatus, t);
  const paymentStyle = paymentLabel === t('delivery_already_paid') ? styles.paymentGreen : styles.paymentDefault;
  const effectiveSelectedMethod: SelectedMethod =
    selectedMethod ??
    (delivery.verificationMethod === 'nfc'
      ? 'nfc_card'
      : delivery.verificationMethod === 'app'
      ? 'approve_in_app'
      : null);
  const showReadyToScan = effectiveSelectedMethod === 'nfc_card' && delivery.verificationMethod === 'nfc';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor="#2563EB" />
        }>
        <View style={styles.hero}>
          {getScheduleImageUrl(delivery) ? (
            <Image
              source={{uri: getScheduleImageUrl(delivery)!}}
              style={styles.heroImage}
              resizeMode="cover"
            />
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
            <View />
          </View>

          {isLiveStatus(delivery.currentStatus) ? (
            <View style={styles.livePill}>
              <Text style={styles.liveText}>{t('delivery_live')}</Text>
            </View>
          ) : null}

          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>{statusLabel}</Text>
            <Text style={styles.heroSubtitle}>{t('delivery_check_package_details')}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.card}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconWrap}>
                <PackageDetailSvg width={styles.sectionIcon.width} height={styles.sectionIcon.height} />
              </View>
              <Text style={styles.sectionTitle}>{t('delivery_package_details')}</Text>
            </View>

            <DetailRow
              label={t('delivery_otp')}
              value={delivery.otpCode || delivery.latestSmsId?.extractedData?.otpCode || '--'}
            />
            <DetailRow label={t('delivery_order_id')} value={getDetailOrderId(delivery)} />
            <DetailRow label={t('delivery_awb')} value={getDetailAwb(delivery)} />
            <DetailRow label={t('delivery_payment')} value={paymentLabel} valueStyle={paymentStyle} />
            <DetailRow label={t('delivery_company_name')} value={companyName} />
          </View>

          <Text style={styles.sectionHeading}>{t('delivery_partner')}</Text>

          <View style={styles.card}>
            <View style={styles.partnerRow}>
              <View style={styles.partnerAvatar}>
                <UserSvg width={28} height={28} />
              </View>

              <View style={styles.partnerBody}>
                <Text style={styles.partnerName}>{partnerName}</Text>

                <View style={styles.partnerMetaRow}>
                  <Text style={styles.partnerCompany}>{companyName}</Text>
                  <Text style={styles.partnerBullet}>•</Text>
                  <YellowStarSvg width={12} height={12} />
                  <Text style={styles.partnerRating}>{partnerRating}</Text>
                </View>

                <Text style={styles.partnerService}>{delivery.sellerName || companyName}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Pressable
              onPress={() => {
                if (delivery.riderPhone) {
                  openDialer(delivery.riderPhone);
                }
              }}
              disabled={!delivery.riderPhone}
              style={styles.verifiedRow}>
              <CheckmarkCircleSvg width={styles.verifiedIcon.width} height={styles.verifiedIcon.height} />
              <Text style={styles.verifiedText}>{t('delivery_verified_partner', {company: companyName})}</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionHeading}>{t('delivery_choose_verification_method')}</Text>

          <View style={styles.methodsRow}>
            <Pressable
              style={[
                styles.methodCard,
                effectiveSelectedMethod === 'nfc_card' && styles.methodCardActive,
                isSelectingMethod && styles.methodCardDisabled,
              ]}
              onPress={selectNfcCard}
              disabled={isSelectingMethod}>
              <View style={styles.methodIconWrap}>
                <NfcCardSvg width={styles.methodIcon.width} height={styles.methodIcon.height} />
              </View>
              <View>
                <Text style={styles.methodTitle}>{t('delivery_tap_nfc_card')}</Text>
                <Text style={styles.methodSubtitle}>{t('delivery_quick_secure')}</Text>
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.methodCard,
                effectiveSelectedMethod === 'approve_in_app' && styles.methodCardActive,
              ]}
              onPress={selectApproveViaApp}
              disabled={isSelectingMethod}>
              <View style={styles.methodIconWrap}>
                <SmartPhoneSvg width={styles.methodIcon.width} height={styles.methodIcon.height} />
              </View>
              <View>
                <Text style={styles.methodTitle}>{t('delivery_approve_via_app')}</Text>
                <Text style={styles.methodSubtitle}>{t('delivery_remote_approval')}</Text>
              </View>
            </Pressable>
          </View>

          {showReadyToScan ? (
            <View style={styles.readyCard}>
              <View style={styles.readyIconWrap}>
                <NfcCardSvg width={styles.readyIcon.width} height={styles.readyIcon.height} />
              </View>
              <Text style={styles.readyTitle}>Ready to Scan?</Text>
              <Text style={styles.readySubtitle}>Tap your NFC Card on the dvaari reader</Text>
              <Pressable
                style={[styles.cancelBtn, isSelectingMethod && styles.methodCardDisabled]}
                onPress={confirmCancelNfc}
                disabled={isSelectingMethod}>
                <Text style={styles.cancelText}>
                  {isSelectingMethod ? 'Cancelling...' : 'Cancel'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable style={styles.historyBtn} onPress={goToHistory}>
            <EyeSvg width={styles.historyIcon.width} height={styles.historyIcon.height} />
            <Text style={styles.historyText}>{t('view_history')}</Text>
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

function getDisplayCompany(delivery: DeliverySchedule): string {
  return extractCompanyFromRawText(delivery.latestSmsId?.rawText) || delivery.deliveryCompany || 'unknown';
}

function getPartnerLabel(delivery: DeliverySchedule, companyName: string): string {
  const explicitPartner =
    delivery.latestSmsId?.rawText?.match(/\bDelivery Partner\s*:\s*([A-Za-z][A-Za-z0-9 &.-]{2,40})\b/i)?.[1]?.trim() || '';
  const candidate = delivery.riderName || delivery.latestSmsId?.extractedData?.riderName || explicitPartner;
  if (!candidate) {
    return `${companyName} Partner`;
  }
  const normalizedCandidate = candidate.trim().toLowerCase();
  const normalizedCompany = companyName.trim().toLowerCase();
  const normalizedSeller = (delivery.sellerName || delivery.latestSmsId?.extractedData?.sellerName || '').trim().toLowerCase();
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
    return `${companyName} Partner`;
  }
  return candidate;
}

function getHeroTitle(status: string, t: (key: string) => string): string {
  const statusMap: Record<string, string> = {
    initiated: t('delivery_status_initiated'),
    arriving_soon: t('delivery_status_arriving_soon'),
    out_for_delivery: t('delivery_status_upcoming'),
    upon_arrival: t('delivery_status_upcoming'),
    delivered: t('delivery_status_delivered'),
    failed: t('delivery_status_update'),
  };
  return statusMap[status] || t('delivery_status_update');
}

function getPaymentLabel(status: string, t: (key: string) => string): string {
  if (status === 'failed') return t('delivery_status_changed');
  return t('delivery_already_paid');
}

function getDetailOrderId(delivery: DeliverySchedule): string {
  const hintedOrderId = delivery.orderHint || delivery.latestSmsId?.extractedData?.orderHint;
  if (hintedOrderId && !/\b(?:awb|tracking id|track id)\b/i.test(hintedOrderId)) {
    return `#${hintedOrderId}`;
  }

  if (!delivery.referenceId || delivery.referenceId.startsWith('provisional:')) {
    return '--';
  }

  return `#${delivery.referenceId}`;
}

function getDetailAwb(delivery: DeliverySchedule): string {
  const awb = delivery.awbNumber || delivery.latestSmsId?.extractedData?.awbNumber || '';
  if (!awb || /^provisional:/i.test(awb)) {
    return '--';
  }
  return awb;
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

function isLiveStatus(status: string): boolean {
  return ['initiated', 'arriving_soon', 'out_for_delivery', 'upon_arrival'].includes(status);
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F7F7F8',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#F7F7F8',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#5B616B',
  },
  errorText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#D32F2F',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 14,
    backgroundColor: '#2563EB',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  hero: {
    height: 244,
    justifyContent: 'space-between',
    backgroundColor: '#D9C5A6',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#C7A77B',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  heroTop: {
    paddingTop: 34,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  livePill: {
    alignSelf: 'flex-start',
    marginLeft: 16,
    marginTop: 4,
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroBody: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIcon: {
    width: 18,
    height: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#202124',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4B4E53',
  },
  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: '#202124',
  },
  paymentGreen: {
    color: '#22C55E',
  },
  paymentDefault: {
    color: '#202124',
  },
  sectionHeading: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 15,
    fontWeight: '800',
    color: '#202124',
  },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  partnerAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#3167EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerBody: {
    flex: 1,
    marginLeft: 12,
  },
  partnerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#202124',
  },
  partnerMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  partnerCompany: {
    fontSize: 11,
    fontWeight: '500',
    color: '#44474D',
  },
  partnerBullet: {
    fontSize: 10,
    color: '#44474D',
  },
  partnerRating: {
    fontSize: 11,
    fontWeight: '600',
    color: '#202124',
  },
  partnerService: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
    color: '#44474D',
  },
  divider: {
    marginTop: 14,
    marginBottom: 14,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verifiedIcon: {
    width: 20,
    height: 20,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
  },
  methodsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  methodCard: {
    flex: 1,
    minHeight: 150,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 18,
    justifyContent: 'space-between',
  },
  methodCardActive: {
    borderColor: '#2563EB',
    backgroundColor: '#FBFDFF',
  },
  methodCardDisabled: {
    opacity: 0.65,
  },
  methodIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodIcon: {
    width: 22,
    height: 22,
  },
  methodTitle: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#202124',
  },
  methodSubtitle: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    color: '#71717A',
  },
  readyCard: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2563EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: 'center',
  },
  readyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyIcon: {
    width: 28,
    height: 28,
  },
  readyTitle: {
    marginTop: 22,
    fontSize: 15,
    fontWeight: '800',
    color: '#202124',
  },
  readySubtitle: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: '#71717A',
    textAlign: 'center',
  },
  cancelBtn: {
    marginTop: 16,
    minWidth: 90,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2563EB',
  },
  historyBtn: {
    marginTop: 16,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F1F1F1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  historyIcon: {
    width: 20,
    height: 20,
  },
  historyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#202124',
  },
});
