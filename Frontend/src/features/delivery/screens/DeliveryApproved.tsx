import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Svg, {Path} from 'react-native-svg';

import type {RootStackParamList} from '../../../navigation/RootNavigator';
import {useDeliveryDetails, useDeliverySchedules} from '../../../hooks/useDeliverySchedules';
import {
  useRateDeliveryScheduleMutation,
  useRespondDeliveryRequestMutation,
} from '../../../services/api/deliveryApi';
import type {DeliverySchedule} from '../../../services/api/smsDeliveryService';
import DeliveryNoPreview from '../components/DeliveryNoPreview';
import DeliveryApprovedEyeSvg from '../../../assets/icons/delivery-approved/eye.svg';
import DeliveryApprovedStarSvg from '../../../assets/icons/delivery-approved/star.svg';
import DeliveryApprovedSuccessCircleAsset from '../../../assets/icons/delivery-approved/success-circle-04.svg';
import DeliveryApprovedUserSvg from '../../../assets/icons/delivery-approved/user.svg';
import {useAppTranslation} from '../../../services/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'DeliveryApproved'>;

export default function DeliveryApproved({navigation, route}: Props) {
  const {t} = useAppTranslation();
  const {width} = useWindowDimensions();
  const isCompact = width < 360;
  const scheduleId = route.params?.scheduleId ?? null;
  const {delivery, loading, error} = useDeliveryDetails(scheduleId);
  const {refresh} = useDeliverySchedules();
  const [respond, {isLoading: isSubmitting}] = useRespondDeliveryRequestMutation();
  const [saveRating, {isLoading: isRatingSaving}] = useRateDeliveryScheduleMutation();
  const [rating, setRating] = useState(0);
  const [isRatingSubmitted, setIsRatingSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!scheduleId) return;

      try {
        await respond({scheduleId, decision: 'approved'}).unwrap();
        if (!cancelled) {
          await refresh(true);
        }
      } catch {
        // Keep the screen usable even if backend update fails once.
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [refresh, respond, scheduleId]);

  useEffect(() => {
    const existingRating = getDeliveryRating(delivery);
    if (existingRating != null) {
      setRating(existingRating);
      setIsRatingSubmitted(true);
    }
  }, [delivery]);

  const orderData = useMemo(
    () => mapApprovedOrderData(delivery, rating || null, t),
    [delivery, rating, t],
  );

  const goBackToDashboard = () => {
    navigation.reset({
      index: 0,
      routes: [{name: 'MainTabs'}],
    });
  };

  const goViewHistory = async () => {
    await refresh(true);
    navigation.navigate('DeliveryHistory');
  };

  const onRate = (value: number) => {
    setRating(value);
    setIsRatingSubmitted(false);
  };

  const onSubmitRating = async () => {
    if (!rating || !scheduleId || isRatingSaving) return;
    try {
      await saveRating({scheduleId, score: rating}).unwrap();
      setIsRatingSubmitted(true);
      await refresh(true);
    } catch {
      setIsRatingSubmitted(false);
    }
  };

  if (loading && !delivery) {
    return (
      <SafeAreaView style={styles.safeCentered}>
        <ActivityIndicator size="large" color="#2362EB" />
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
        <View style={styles.successSection}>
          <View style={styles.backBtn}>
            <BackArrowIcon />
          </View>

          <View style={styles.successIconWrap}>
            <DeliveryApprovedSuccessCircleAsset width={34} height={34} />
          </View>

          <Text style={styles.successTitle}>{t('delivery_approved_title')}</Text>
          <Text style={styles.successSubtitle}>
            {t('delivery_approved_subtitle')}
          </Text>
        </View>

        <View style={styles.body}>
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>{t('delivery_verification_code')}</Text>
            <Text style={styles.codeValue}>{orderData.verificationCode}</Text>
            <Text style={styles.codeHelp}>{t('delivery_show_code_help')}</Text>
          </View>

          <Text style={styles.sectionTitle}>{t('delivery_order_summary')}</Text>

          <View style={styles.orderCard}>
            {orderData.productImageUri ? (
              <Image
                source={{uri: orderData.productImageUri}}
                style={styles.productImage}
                resizeMode="cover"
              />
            ) : (
              <DeliveryNoPreview width={84} height={84} borderRadius={12} />
            )}

            <View style={styles.orderInfo}>
              <Text style={styles.orderTitle}>{orderData.title}</Text>
              <Text style={styles.orderId}>{orderData.orderId}</Text>
              <Text style={styles.paymentText}>{orderData.paymentStatus}</Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, styles.partnerSectionTitle]}>
            {t('delivery_partner')}
          </Text>

          <View style={styles.partnerCard}>
            <View style={styles.partnerAvatar}>
              <DeliveryApprovedUserSvg width={28} height={28} />
            </View>

            <View style={styles.partnerInfo}>
              <Text style={styles.partnerName}>{orderData.partnerName}</Text>
              <Text style={styles.partnerMeta}>
                {orderData.partnerCompany} | <DeliveryApprovedStarSvg width={12} height={12} /> {orderData.partnerRating}
              </Text>
              <Text style={styles.partnerService}>{orderData.partnerService}</Text>
            </View>
          </View>

          <Pressable style={styles.primaryBtn} onPress={goBackToDashboard}>
            <Text style={styles.primaryBtnText}>{t('back_to_dashboard')}</Text>
          </Pressable>

          <Pressable style={styles.secondaryBtn} onPress={goViewHistory}>
            <DeliveryApprovedEyeSvg width={styles.secondaryBtnIcon.width} height={styles.secondaryBtnIcon.height} />
            <Text style={styles.secondaryBtnText}>{t('view_history')}</Text>
          </Pressable>

          {isSubmitting ? (
            <Text style={styles.syncText}>{t('delivery_updating_status')}</Text>
          ) : null}

          <Text style={styles.ratingTitle}>{t('delivery_rate_experience')}</Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(item => {
              const filled = item <= rating;

              return (
                <Pressable
                  key={item}
                  onPress={() => onRate(item)}
                  style={styles.starBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('delivery_rate_star_accessibility', {count: item})}>
                  <StarIcon filled={filled} />
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.ratingBtn, !rating && styles.ratingBtnDisabled]}
            onPress={onSubmitRating}
            disabled={!rating || isRatingSaving}>
            <Text style={styles.ratingBtnText}>
              {isRatingSaving
                ? t('saving')
                : isRatingSubmitted
                  ? t('delivery_rated_value', {rating})
                  : t('delivery_submit_rating')}
            </Text>
          </Pressable>

          {isRatingSubmitted ? (
            <Text style={styles.ratingSuccessText}>
              {t('delivery_rating_saved')}
            </Text>
          ) : (
            <Text style={styles.ratingHintText}>{t('delivery_rating_hint')}</Text>
          )}

          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function mapApprovedOrderData(
  delivery: DeliverySchedule | null,
  selectedRating: number | null,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return {
    verificationCode:
      delivery?.otpCode || delivery?.latestSmsId?.extractedData?.otpCode || '--',
    title:
      delivery?.productSummary ||
      delivery?.sellerName ||
      delivery?.referenceId ||
      t('delivery_status_delivered'),
    orderId: getOrderIdLabel(delivery, t),
    paymentStatus: t('delivery_paid_online'),
    productImageUri: getScheduleImageUrl(delivery),
    partnerName: delivery?.riderName || t('delivery_partner'),
    partnerCompany: formatDeliveryCompany(delivery?.deliveryCompany),
    partnerRating: formatRating(selectedRating ?? getDeliveryRating(delivery)),
    partnerService:
      delivery?.sellerName ||
      formatDeliveryCompany(delivery?.deliveryCompany) ||
      t('delivery_generic'),
  };
}

function getDeliveryRating(delivery: DeliverySchedule | null): number | null {
  return typeof delivery?.rating === 'number' ? delivery.rating : null;
}

function formatRating(value: number | null) {
  return value == null ? '-' : String(value);
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

function getOrderIdLabel(
  delivery: DeliverySchedule | null,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const value = delivery?.orderHint || delivery?.referenceId || delivery?.awbNumber || '';
  return value
    ? t('delivery_order_number', {value})
    : t('delivery_order_details_pending');
}

function formatDeliveryCompany(value?: string) {
  if (!value) return 'Delivery';
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
  successSection: {
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 22,
  },
  backBtn: {
    position: 'absolute',
    top: 14,
    left: 16,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 26,
    marginBottom: 16,
  },
  successTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  successSubtitle: {
    marginTop: 8,
    color: '#EFFFF3',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  codeCard: {
    backgroundColor: '#FFF8EA',
    borderWidth: 1,
    borderColor: '#E8C96F',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 18,
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  codeValue: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
  },
  codeHelp: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#4B5563',
    textAlign: 'center',
  },
  sectionTitle: {
    marginTop: 22,
    marginBottom: 12,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  partnerSectionTitle: {
    marginTop: 20,
  },
  orderCard: {
    backgroundColor: '#F4F4F5',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  productImage: {
    width: 84,
    height: 84,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  orderInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  orderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  orderId: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  paymentText: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '700',
    color: '#16A34A',
  },
  partnerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  partnerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#3167EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerInfo: {
    flex: 1,
  },
  partnerName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  partnerMeta: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  partnerService: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  primaryBtn: {
    marginTop: 22,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#2362EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryBtn: {
    marginTop: 14,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtnIcon: {
    width: 22,
    height: 22,
  },
  secondaryBtnText: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
  },
  syncText: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  ratingTitle: {
    marginTop: 30,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    color: '#374151',
  },
  starsRow: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  starBtn: {
    padding: 4,
  },
  ratingBtn: {
    marginTop: 18,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingBtnDisabled: {
    opacity: 0.45,
  },
  ratingBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  ratingHintText: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
  },
  ratingSuccessText: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: '#166534',
    textAlign: 'center',
  },
  bottomSpacer: {
    height: 18,
  },
});

function StarIcon({filled}: {filled: boolean}) {
  return (
    <Svg width={42} height={42} viewBox="0 0 44 44" fill="none">
      <Path
        d="M25.1677 6.31465L28.394 12.8206C28.8339 13.7263 30.0071 14.5949 30.997 14.7613L36.8447 15.7409C40.5843 16.3693 41.4642 19.1047 38.7695 21.8032L34.2233 26.387C33.4534 27.1632 33.0318 28.6603 33.2701 29.7324L34.5716 35.4066C35.5982 39.8979 33.2334 41.6353 29.2922 39.288L23.8111 36.0165C22.8213 35.4251 21.1898 35.4251 20.1815 36.0165L14.7005 39.288C10.7776 41.6353 8.39451 39.8794 9.42107 35.4066L10.7226 29.7324C10.9609 28.6603 10.5393 27.1632 9.76936 26.387L5.2232 21.8032C2.54683 19.1047 3.4084 16.3693 7.14798 15.7409L12.9957 14.7613C13.9672 14.5949 15.1404 13.7263 15.5804 12.8206L18.8067 6.31465C20.5665 2.78444 23.4262 2.78444 25.1677 6.31465Z"
        fill={filled ? '#FACC15' : 'none'}
        stroke={filled ? '#FACC15' : '#666666'}
        strokeWidth={2.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function BackArrowIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 19L8 12L15 5"
        stroke="#FFFFFF"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
