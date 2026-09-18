import React, { useMemo } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { DeliveryStackParamList } from '../../../navigation/tabs/stacks/DeliveryStack';
import ArrowLeftSvg from '../../../assets/icons/blue-header/arrow-left.svg';
import YellowStarSvg from '../../../assets/icons/common/yellow-star.svg';
import UserSvg from '../../../assets/icons/common/user.svg';
import EyeSvg from '../../../assets/icons/delivery/eye.svg';
import PackageDetailSvg from '../../../assets/icons/delivery/package-detail.svg';
import NfcCardSvg from '../../../assets/icons/delivery/nfc-card.svg';
import SmartPhoneSvg from '../../../assets/icons/delivery/smart-phone-01.svg';
import VerifiedSvg from '../../../assets/icons/delivery/verified.svg';
import { getDeliveryRecordById } from '../data/deliveryData';
import DeliveryNoPreview from '../components/DeliveryNoPreview';

type Props = NativeStackScreenProps<DeliveryStackParamList, 'DeliveryDetails'>;

function getScale(width: number) {
  if (width <= 320) return 0.84;
  if (width <= 360) return 0.92;
  if (width >= 430) return 1.08;
  return 1;
}

function createStyles(scale: number) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: '#F7F7F8',
    },

    content: {
      paddingBottom: Math.round(18 * scale),
    },

    hero: {
      height: Math.round(270 * scale),
      justifyContent: 'space-between',
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
      paddingHorizontal: Math.round(24 * scale),
      backgroundColor: '#D6B690',
    },

    heroOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.38)',
    },

    heroTop: {
      paddingTop: Math.round(34 * scale),
      paddingHorizontal: Math.round(20 * scale),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    backBtn: {
      width: Math.round(34 * scale),
      height: Math.round(34 * scale),
      borderRadius: Math.round(17 * scale),
      alignItems: 'center',
      justifyContent: 'center',
    },

    livePill: {
      alignSelf: 'flex-start',
      marginLeft: Math.round(20 * scale),
      paddingHorizontal: Math.round(9 * scale),
      minHeight: Math.round(22 * scale),
      borderRadius: Math.round(999 * scale),
      backgroundColor: '#FF3B30',
      alignItems: 'center',
      justifyContent: 'center',
    },

    liveText: {
      color: '#FFFFFF',
      fontSize: Math.round(9 * scale),
      fontWeight: '800',
    },

    heroBody: {
      paddingHorizontal: Math.round(20 * scale),
      paddingBottom: Math.round(18 * scale),
    },

    heroTitle: {
      color: '#FFFFFF',
      fontSize: Math.round(16 * scale),
      fontWeight: '800',
    },

    heroSubtitle: {
      marginTop: Math.round(6 * scale),
      color: 'rgba(255,255,255,0.92)',
      fontSize: Math.round(10 * scale),
      lineHeight: Math.round(15 * scale),
      fontWeight: '500',
    },

    body: {
      paddingHorizontal: Math.round(20 * scale),
      paddingTop: Math.round(20 * scale),
      gap: Math.round(18 * scale),
    },

    card: {
      backgroundColor: '#FFFFFF',
      borderRadius: Math.round(16 * scale),
      borderWidth: 1,
      borderColor: '#E5E7EB',
      padding: Math.round(16 * scale),
    },

    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Math.round(10 * scale),
      marginBottom: Math.round(14 * scale),
    },

    sectionIconWrap: {
      width: Math.round(28 * scale),
      height: Math.round(28 * scale),
      borderRadius: Math.round(14 * scale),
      backgroundColor: '#EEF4FF',
      alignItems: 'center',
      justifyContent: 'center',
    },

    sectionTitle: {
      color: '#202124',
      fontSize: Math.round(16 * scale),
      fontWeight: '800',
    },

    detailsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: Math.round(12 * scale),
      marginBottom: Math.round(10 * scale),
    },

    detailLabel: {
      color: '#46484D',
      fontSize: Math.round(12 * scale),
      fontWeight: '500',
    },

    detailValue: {
      color: '#202124',
      fontSize: Math.round(12 * scale),
      fontWeight: '600',
      textAlign: 'right',
      flexShrink: 1,
    },

    paymentGreen: {
      color: '#22C55E',
    },

    paymentRed: {
      color: '#EF4444',
    },

    deliveryPartnerTitle: {
      color: '#202124',
      fontSize: Math.round(15 * scale),
      fontWeight: '800',
    },

    partnerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Math.round(12 * scale),
    },

    partnerAvatar: {
      width: Math.round(54 * scale),
      height: Math.round(54 * scale),
      borderRadius: Math.round(27 * scale),
      backgroundColor: '#3167EA',
      alignItems: 'center',
      justifyContent: 'center',
    },

    partnerBody: {
      flex: 1,
    },

    partnerName: {
      color: '#202124',
      fontSize: Math.round(14 * scale),
      fontWeight: '700',
    },

    partnerMeta: {
      marginTop: Math.round(4 * scale),
      flexDirection: 'row',
      alignItems: 'center',
      gap: Math.round(6 * scale),
      flexWrap: 'wrap',
    },

    partnerMetaText: {
      color: '#44474D',
      fontSize: Math.round(11 * scale),
      fontWeight: '500',
    },

    partnerCompanyIcon: {
      width: Math.round(12 * scale),
      height: Math.round(12 * scale),
    },

    divider: {
      marginTop: Math.round(14 * scale),
      marginBottom: Math.round(14 * scale),
      height: 1,
      backgroundColor: '#E5E7EB',
    },

    verifiedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Math.round(8 * scale),
    },

    verifiedIcon: {
      width: Math.round(20 * scale),
      height: Math.round(20 * scale),
    },

    verifiedText: {
      color: '#2563EB',
      fontSize: Math.round(11 * scale),
      fontWeight: '600',
    },

    methodsTitle: {
      color: '#202124',
      fontSize: Math.round(15 * scale),
      fontWeight: '800',
    },

    methodsRow: {
      flexDirection: 'row',
      gap: Math.round(14 * scale),
    },

    methodCard: {
      flex: 1,
      minHeight: Math.round(150 * scale),
      borderRadius: Math.round(16 * scale),
      borderWidth: 1,
      borderColor: '#E5E7EB',
      backgroundColor: '#FFFFFF',
      paddingHorizontal: Math.round(14 * scale),
      paddingVertical: Math.round(18 * scale),
      justifyContent: 'space-between',
    },

    methodCardActive: {
      borderColor: '#2563EB',
      backgroundColor: '#FBFDFF',
    },

    methodIconWrap: {
      width: Math.round(46 * scale),
      height: Math.round(46 * scale),
      borderRadius: Math.round(23 * scale),
      backgroundColor: '#EEF4FF',
      alignItems: 'center',
      justifyContent: 'center',
    },

    methodIcon: {
      width: Math.round(22 * scale),
      height: Math.round(22 * scale),
    },

    methodIconLg: {
      width: Math.round(24 * scale),
      height: Math.round(24 * scale),
    },

    methodTitle: {
      marginTop: Math.round(12 * scale),
      color: '#202124',
      fontSize: Math.round(14 * scale),
      fontWeight: '700',
    },

    methodSubtitle: {
      marginTop: Math.round(6 * scale),
      color: '#71717A',
      fontSize: Math.round(11 * scale),
      lineHeight: Math.round(15 * scale),
      fontWeight: '500',
    },

    historyBtn: {
      height: Math.round(44 * scale),
      borderRadius: Math.round(8 * scale),
      backgroundColor: '#F1F1F1',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Math.round(8 * scale),
    },

    historyIcon: {
      width: Math.round(20 * scale),
      height: Math.round(20 * scale),
    },

    historyIconLg: {
      width: Math.round(18 * scale),
      height: Math.round(18 * scale),
    },

    historyText: {
      color: '#202124',
      fontSize: Math.round(14 * scale),
      fontWeight: '700',
    },

    fallbackWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },

    fallbackTitle: {
      color: '#202124',
      fontSize: 18,
      fontWeight: '800',
      textAlign: 'center',
    },

    fallbackText: {
      marginTop: 8,
      color: '#6B7280',
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
      textAlign: 'center',
    },
  });
}

export default function DeliveryDetails({ navigation, route }: Props) {
  const { width } = useWindowDimensions();
  const scale = getScale(width);
  const styles = useMemo(() => createStyles(scale), [scale]);

  const deliveryId = route.params?.deliveryId ?? '';
  const delivery = getDeliveryRecordById(deliveryId);

  const companyIcon = delivery?.partnerCompany === 'Amazon'
    ? require('../../../assets/icons/common/amazon.png')
    : require('../../../assets/icons/common/flipkart.png');

  const goToHistory = () => {
    navigation.getParent()?.getParent?.()?.navigate?.('DeliveryHistory' as never);
  };

  if (!delivery) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.fallbackWrap}>
          <Text style={styles.fallbackTitle}>Delivery details not found</Text>
          <Text style={styles.fallbackText}>
            This delivery is no longer available. Please go back and try another item.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroPlaceholder}>
            <DeliveryNoPreview hero />
          </View>
          <View style={styles.heroOverlay} />

          <View style={styles.heroTop}>
            <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
              <ArrowLeftSvg width={22} height={22} />
            </Pressable>
            <View />
          </View>

          <View>
            {delivery.isLive ? (
              <View style={styles.livePill}>
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            ) : null}

            <View style={styles.heroBody}>
              <Text style={styles.heroTitle}>{delivery.historyLabel}</Text>
              <Text style={styles.heroSubtitle}>Please check details of your package</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.card}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconWrap}>
                <PackageDetailSvg width={styles.methodIcon.width} height={styles.methodIcon.height} />
              </View>
              <Text style={styles.sectionTitle}>Package Details</Text>
            </View>

            <View style={styles.detailsRow}>
              <Text style={styles.detailLabel}>OTP</Text>
              <Text style={styles.detailValue}>{delivery.otp}</Text>
            </View>

            <View style={styles.detailsRow}>
              <Text style={styles.detailLabel}>Order ID</Text>
              <Text style={styles.detailValue}>{delivery.orderId.replace('Order ', '')}</Text>
            </View>

            <View style={styles.detailsRow}>
              <Text style={styles.detailLabel}>Payment</Text>
              <Text
                style={[
                  styles.detailValue,
                  delivery.paymentAccent === 'green' && styles.paymentGreen,
                  delivery.paymentAccent === 'red' && styles.paymentRed,
                ]}
              >
                {delivery.payment}
              </Text>
            </View>

            <View style={styles.detailsRow}>
              <Text style={styles.detailLabel}>Company name</Text>
              <Text style={styles.detailValue}>{delivery.companyName}</Text>
            </View>
          </View>

          <Text style={styles.deliveryPartnerTitle}>Delivery Partner</Text>

          <View style={styles.card}>
            <View style={styles.partnerRow}>
              <View style={styles.partnerAvatar}>
                <UserSvg width={28} height={28} />
              </View>

              <View style={styles.partnerBody}>
                <Text style={styles.partnerName}>{delivery.partnerName}</Text>

                <View style={styles.partnerMeta}>
                  <Text style={styles.partnerMetaText}>{delivery.partnerCompany}</Text>
                  <Text style={styles.partnerMetaText}>|</Text>
                  <Image
                    source={companyIcon}
                    style={styles.partnerCompanyIcon}
                    resizeMode="contain"
                  />
                  <YellowStarSvg width={13} height={13} />
                  <Text style={styles.partnerMetaText}>{delivery.partnerRating}</Text>
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.verifiedRow}>
              <VerifiedSvg width={styles.verifiedIcon.width} height={styles.verifiedIcon.height} />
              <Text style={styles.verifiedText}>
                Verified {delivery.partnerCompany} delivery partner
              </Text>
            </View>
          </View>

          <Text style={styles.methodsTitle}>Choose Verification Method</Text>

          <View style={styles.methodsRow}>
            <View style={[styles.methodCard, styles.methodCardActive]}>
              <View style={styles.methodIconWrap}>
                <NfcCardSvg width={styles.methodIconLg.width} height={styles.methodIconLg.height} />
              </View>
              <View>
                <Text style={styles.methodTitle}>Tap NFC Card</Text>
                <Text style={styles.methodSubtitle}>Quick & secure</Text>
              </View>
            </View>

            <View style={styles.methodCard}>
              <View style={styles.methodIconWrap}>
                <SmartPhoneSvg width={styles.methodIconLg.width} height={styles.methodIconLg.height} />
              </View>
              <View>
                <Text style={styles.methodTitle}>Approve via App</Text>
                <Text style={styles.methodSubtitle}>Remote approval</Text>
              </View>
            </View>
          </View>

          <Pressable style={styles.historyBtn} onPress={goToHistory}>
            <EyeSvg width={styles.historyIconLg.width} height={styles.historyIconLg.height} />
            <Text style={styles.historyText}>View History</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
