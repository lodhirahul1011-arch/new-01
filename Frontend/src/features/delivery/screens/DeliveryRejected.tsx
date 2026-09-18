import React, {useMemo, useState} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Svg, {Path} from 'react-native-svg';

import type {RootStackParamList} from '../../../navigation/RootNavigator';
import {useDeliveryDetails, useDeliverySchedules} from '../../../hooks/useDeliverySchedules';
import {useRespondDeliveryRequestMutation} from '../../../services/api/deliveryApi';
import type {DeliverySchedule} from '../../../services/api/smsDeliveryService';
import DeliveryNoPreview from '../components/DeliveryNoPreview';
import CancelCircleSvg from '../../../assets/icons/delivery-approved/cancel-circle.svg';
import ArrowLeftSvg from '../../../assets/icons/common/arrow-left-black.svg';
import {useAppTranslation} from '../../../services/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'DeliveryRejected'>;

const REASON_KEYS = [
  'delivery_reason_wrong_item',
  'delivery_reason_damaged_package',
  'delivery_reason_suspicious_person',
  'delivery_reason_not_expected',
  'delivery_reason_opened_package',
  'delivery_reason_other',
] as const;

export default function DeliveryRejected({navigation, route}: Props) {
  const {t} = useAppTranslation();
  const {width} = useWindowDimensions();
  const isCompact = width < 360;
  const scheduleId = route.params?.scheduleId ?? null;
  const {delivery, loading, error} = useDeliveryDetails(scheduleId);
  const {refresh} = useDeliverySchedules();
  const [respond, {isLoading: isSubmitting}] = useRespondDeliveryRequestMutation();
  const [selectedReason, setSelectedReason] = useState<string | null>(
    null,
  );
  const [isRejectedConfirmed, setIsRejectedConfirmed] = useState(false);

  const orderData = useMemo(() => mapRejectedOrderData(delivery, t), [delivery, t]);
  const canSubmit = !!selectedReason && !!scheduleId && !isSubmitting;

  const onConfirmRejection = async () => {
    if (!selectedReason || !scheduleId) return;

    try {
      await respond({scheduleId, decision: 'rejected', reason: selectedReason}).unwrap();
      await refresh(true);
      setIsRejectedConfirmed(true);
    } catch {}
  };

  const onGoBack = () => {
    navigation.goBack();
  };

  if (loading && !delivery) {
    return (
      <SafeAreaView style={styles.safeCentered}>
        <ActivityIndicator size="large" color="#ED1C24" />
        <Text style={styles.stateText}>{t('delivery_loading')}</Text>
      </SafeAreaView>
    );
  }

  if (error && !delivery) {
    return (
      <SafeAreaView style={styles.safeCentered}>
        <Text style={styles.stateText}>{error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.content, isCompact && styles.contentCompact]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topSection}>
          <View style={styles.topIconWrap}>
            <CancelCircleSvg width={styles.topIcon.width} height={styles.topIcon.height} />
          </View>

          <Text style={styles.topTitle}>
            {isRejectedConfirmed ? t('delivery_rejected_title') : t('delivery_reject_title')}
          </Text>

          <Text style={styles.topSubtitle}>
            {isRejectedConfirmed
              ? t('delivery_rejected_subtitle')
              : t('delivery_reject_reason_prompt')}
          </Text>
        </View>

        <View style={styles.body}>
          <View style={styles.orderCard}>
            {orderData.productImageUri ? (
              <Image
                source={{uri: orderData.productImageUri}}
                style={styles.productImage}
                resizeMode="cover"
              />
            ) : (
              <DeliveryNoPreview
                width={84}
                height={84}
                borderRadius={12}
              />
            )}

            <View style={styles.orderInfo}>
              <Text style={styles.orderTitle}>{orderData.title}</Text>
              <Text style={styles.orderId}>{orderData.orderId}</Text>
              <Text style={styles.paymentText}>{orderData.paymentStatus}</Text>
            </View>
          </View>

          {isRejectedConfirmed ? (
            <>
              <View style={styles.importantCard}>
                <Text style={styles.importantTitle}>{t('delivery_reason_saved')}</Text>
                <Text style={styles.importantText}>
                  {selectedReason || t('delivery_rejected_by_resident')}
                </Text>
              </View>

              <Pressable style={styles.confirmBtn} onPress={() => navigation.reset({
                index: 0,
                routes: [{name: 'MainTabs'}],
              })}>
                <Text style={styles.confirmBtnText}>{t('back_to_dashboard')}</Text>
              </Pressable>

              <Pressable style={styles.goBackBtn} onPress={() => navigation.navigate('DeliveryHistory')}>
                <Text style={styles.goBackBtnText}>{t('view_history')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.importantCard}>
                <Text style={styles.importantTitle}>{t('important')}</Text>
                <Text style={styles.importantText}>
                  {t('delivery_reject_warning')}
                </Text>
              </View>

              <Text style={styles.sectionTitle}>{t('delivery_select_rejection_reason')}</Text>

              <View style={styles.reasonList}>
                {REASON_KEYS.map(reasonKey => {
                  const reasonText = t(reasonKey);
                  const selected = selectedReason === reasonText;

                  return (
                    <Pressable
                      key={reasonKey}
                      style={[
                        styles.reasonItem,
                        selected && styles.reasonItemSelected,
                      ]}
                      onPress={() => setSelectedReason(reasonText)}>
                      <Text
                        style={[
                          styles.reasonText,
                          selected && styles.reasonTextSelected,
                        ]}>
                        {reasonText}
                      </Text>

                      <View
                        style={[
                          styles.radioOuter,
                          selected && styles.radioOuterSelected,
                        ]}>
                        {selected && <View style={styles.radioInner} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={[
                  styles.confirmBtn,
                  !canSubmit && styles.confirmBtnDisabled,
                ]}
                onPress={onConfirmRejection}
                disabled={!canSubmit}>
                <ConfirmCancelIcon />
                <Text style={styles.confirmBtnText}>
                  {isSubmitting ? t('delivery_rejecting') : t('delivery_confirm_rejection')}
                </Text>
              </Pressable>

              <Pressable style={styles.goBackBtn} onPress={onGoBack}>
                <ArrowLeftSvg width={16} height={16} />
                <Text style={styles.goBackBtnText}>{t('go_back')}</Text>
              </Pressable>
            </>
          )}

          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function mapRejectedOrderData(
  delivery: DeliverySchedule | null,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return {
    title:
      delivery?.productSummary ||
      delivery?.sellerName ||
      delivery?.referenceId ||
      t('delivery_order'),
    orderId: getOrderIdLabel(delivery, t),
    paymentStatus: t('delivery_paid_online'),
    productImageUri: getScheduleImageUrl(delivery),
  };
}

function getOrderIdLabel(
  delivery: DeliverySchedule | null,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const value =
    delivery?.orderHint ||
    delivery?.referenceId ||
    delivery?.awbNumber ||
    '';
  return value
    ? t('delivery_order_number', {value})
    : t('delivery_order_details_pending');
}

function getScheduleImageUrl(delivery: DeliverySchedule | null): string {
  return (
    delivery?.imageUrl ||
    delivery?.thumbnailUrl ||
    delivery?.latestSmsId?.extractedData?.imageUrl ||
    delivery?.latestSmsId?.extractedData?.thumbnailUrl ||
    ''
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  safeCentered: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stateText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  content: {
    flexGrow: 1,
  },
  contentCompact: {},
  topSection: {
    backgroundColor: '#ED1C24',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 22,
  },
  topIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  topIcon: {
    width: 26,
    height: 26,
  },
  topTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  topSubtitle: {
    marginTop: 8,
    color: '#FEE2E2',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  productImage: {
    width: 70,
    height: 70,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },
  orderInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  orderTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: '#111827',
  },
  orderId: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  paymentText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#16A34A',
  },
  importantCard: {
    marginTop: 18,
    backgroundColor: '#FFF8EA',
    borderWidth: 1,
    borderColor: '#E8C96F',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  importantTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  importantText: {
    fontSize: 13,
    lineHeight: 21,
    fontWeight: '500',
    color: '#4B5563',
  },
  sectionTitle: {
    marginTop: 22,
    marginBottom: 12,
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  reasonList: {
    gap: 12,
  },
  reasonItem: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  reasonItemSelected: {
    borderColor: '#ED1C24',
    backgroundColor: '#FFF5F5',
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#111827',
  },
  reasonTextSelected: {
    color: '#111827',
  },
  radioOuter: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#A3A3A3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: '#ED1C24',
  },
  radioInner: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: '#ED1C24',
  },
  confirmBtn: {
    marginTop: 18,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#ED1C24',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnIcon: {
    width: 18,
    height: 18,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  goBackBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#E5E5E5',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  goBackBtnText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomSpacer: {
    height: 16,
  },
});

function ConfirmCancelIcon() {
  return (
    <View style={styles.confirmBtnIcon}>
      <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
        <Path
          d="M16 2L2 16M2 2L16 16"
          stroke="#FFFFFF"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
