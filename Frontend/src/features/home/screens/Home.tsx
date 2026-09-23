import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ScrollView,
  Image,
  Modal,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { SvgProps } from 'react-native-svg';

import BlueHeader from '../../../components/layout/BlueHeader';
import CancelSvg from '../../../assets/icons/members/cancel.svg';
import CheckmarkCircleSvg from '../../../assets/icons/delivery/checkmark-circle-04.svg';

import type { HomeStackParamList } from '../../../navigation/tabs/stacks/HomeStack';
import ActivityClockSvg from '../../../assets/icons/home/clock-01.svg';
import DeliveryAccessSvg from '../../../assets/icons/home/delivery-box-01.svg';
import ChevronRightSvg from '../../../assets/icons/home/elements.svg';
import NotificationSvg from '../../../assets/icons/home/notification-02.svg';
import SecuritySvg from '../../../assets/icons/home/svg2364.svg';
import BlueBell from '../../../assets/icons/common/blue-bell.svg';
import ManageFamilySvg from '../../../assets/icons/home/user-multiple.svg';
import LiveFeedSvg from '../../../assets/icons/home/video-02.svg';
import ImagesSvg from '../../../assets/icons/home/image.svg';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { useDeliverySchedules } from '../../../hooks/useDeliverySchedules';
import {
  useCreateManualDeliveryScheduleMutation,
  useReceiveDeliverySmsMutation,
} from '../../../services/api/deliveryApi';
import DeliveryNoPreview from '../../delivery/components/DeliveryNoPreview';
import { preferencesActions } from '../../../store/slices/preferencesSlice';
import {
  getUnreadNotificationInboxCount,
  subscribeToNotificationInbox,
} from '../../../services/notifications/notificationInbox';
import { logs } from '../../../services/logs';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

type Activity = {
  id: string;
  title: string;
  meta: string;
  time: string;
  image?: any;
};

type QuickActionItem = {
  id: string;
  title: string;
  icon: React.ComponentType<SvgProps>;
  iconBg: string;
  iconSize?: number;
  onPress: () => void;
};

type ManualDeliveryFieldErrors = Partial<
  Record<'productTitle' | 'orderId' | 'awbNumber' | 'otpCode', string>
>;

type ManualDeliveryDraft = {
  productTitle: string;
  orderId: string;
  awbNumber: string;
  otpCode: string;
};

const PRODUCT_TITLE_MAX_LENGTH = 100;
const ORDER_ID_MIN_LENGTH = 3;
const ORDER_ID_MAX_LENGTH = 40;
const AWB_MIN_LENGTH = 8;
const AWB_MAX_LENGTH = 24;
const OTP_MIN_LENGTH = 4;
const OTP_MAX_LENGTH = 8;
const PASTED_DELIVERY_MESSAGE_MAX_LENGTH = 2000;
const ORDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const AWB_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

function getPastedDeliveryMessageId(message: string): string {
  let hash = 2166136261;
  for (let index = 0; index < message.length; index += 1) {
    hash ^= message.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const messageId = `pasted-${(hash >>> 0).toString(16)}-${message.length}`;
  logs.info('[Home] pasted delivery idempotency key generated', {
    messageLength: message.length,
  });
  return messageId;
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function getManualDeliveryIdempotencyKey(draft: ManualDeliveryDraft): string {
  const fingerprint = [
    draft.productTitle.trim().toLowerCase(),
    draft.orderId.trim().toUpperCase(),
    draft.awbNumber.trim().toUpperCase(),
    draft.otpCode.trim(),
  ].join('|');
  const idempotencyKey = `manual-delivery-${hashText(fingerprint)}-${fingerprint.length}`;
  logs.info('[Home] manual delivery idempotency key generated', {
    hasOtpCode: Boolean(draft.otpCode.trim()),
  });
  return idempotencyKey;
}

function firstMatch(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return '';
}

function cleanManualFieldValue(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[#:\-\s]+/, '')
    .replace(/[.,;|]+$/g, '')
    .trim();
}

function cleanManualTitle(value: string): string {
  const withoutNextField = cleanManualFieldValue(value).split(
    /(?:^|\s+)(?:order|awb|tracking|shipment|waybill|otp|code|pin)\b/i,
  )[0];
  return cleanManualFieldValue(withoutNextField).slice(0, PRODUCT_TITLE_MAX_LENGTH);
}

function cleanReferenceValue(value: string): string {
  return cleanManualFieldValue(value).replace(/\s+/g, '').toUpperCase();
}

function cleanManualOtpInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, OTP_MAX_LENGTH);
  if (digits !== value) {
    logs.info('[Home] manual delivery OTP input sanitized', {
      rawLength: value.length,
      digitLength: digits.length,
    });
  }
  return digits;
}

function getFallbackProductTitle(message: string): string {
  const firstUsefulLine =
    message
      .split(/\r?\n/)
      .map(line => cleanManualTitle(line))
      .find(
        line =>
          line.length >= 3 &&
          /[A-Za-z0-9]/.test(line) &&
          !/^(awb|order|tracking|shipment|waybill|otp|code|pin)\b/i.test(line),
      ) || '';

  return firstUsefulLine || 'Manual Delivery';
}

function buildManualDeliveryDraftFromMessage(message: string): ManualDeliveryDraft {
  const text = message.replace(/\r/g, '\n');
  const productTitle =
    cleanManualTitle(
      firstMatch(text, [
        /\b(?:product\s*(?:title|name)?|item|package)\s*(?:is|:|-)?\s*([^\n\r,;|]+)/i,
        /\b(?:for|contains)\s+([A-Za-z0-9][^\n\r,;|]{2,99})/i,
      ]),
    ) || getFallbackProductTitle(text);
  const orderId = cleanReferenceValue(
    firstMatch(text, [
      /\border\s*(?:id|number|no|#)?\s*(?:is|:|#|-)?\s*([A-Za-z0-9][A-Za-z0-9._/-]{2,39})/i,
      /\b(?:order|ord)\s+([A-Za-z0-9][A-Za-z0-9._/-]{2,39})/i,
    ]),
  );
  const awbNumber = cleanReferenceValue(
    firstMatch(text, [
      /\bawb\s*(?:number|no|#)?\s*(?:is|:|#|-)?\s*([A-Za-z0-9][A-Za-z0-9-]{7,23})/i,
      /\b(?:tracking|shipment|waybill|consignment)\s*(?:id|number|no|#)?\s*(?:is|:|#|-)?\s*([A-Za-z0-9][A-Za-z0-9-]{7,23})/i,
    ]),
  );
  const fallbackReference = cleanReferenceValue(
    firstMatch(text, [/\b([A-Za-z0-9][A-Za-z0-9-]{7,23})\b/i]),
  );
  const otpCode = firstMatch(text, [
    /\b(?:otp|code|pin)\s*(?:is|:|#|-)?\s*(\d{4,8})\b/i,
  ]).replace(/\D/g, '');

  const resolvedAwbNumber = awbNumber || fallbackReference || orderId;
  const resolvedOrderId = orderId || resolvedAwbNumber;
  logs.info('[Home] manual delivery draft extracted from textarea', {
    hasProductTitle: Boolean(productTitle),
    hasOrderId: Boolean(resolvedOrderId),
    hasAwbNumber: Boolean(resolvedAwbNumber),
    hasOtpCode: Boolean(otpCode),
  });

  return {
    productTitle,
    orderId: resolvedOrderId,
    awbNumber: resolvedAwbNumber,
    otpCode,
  };
}

function validateManualDeliveryFields({
  productTitle,
  orderId,
  awbNumber,
  otpCode,
}: {
  productTitle: string;
  orderId: string;
  awbNumber: string;
  otpCode: string;
}): ManualDeliveryFieldErrors {
  const errors: ManualDeliveryFieldErrors = {};

  if (!productTitle) {
    errors.productTitle = 'Product title is required.';
  } else if (productTitle.length > PRODUCT_TITLE_MAX_LENGTH) {
    errors.productTitle = `Product title must be ${PRODUCT_TITLE_MAX_LENGTH} characters or fewer.`;
  } else if (!/[A-Za-z0-9]/.test(productTitle)) {
    errors.productTitle = 'Product title must contain a letter or number.';
  }

  if (!orderId) {
    errors.orderId = 'Order ID is required.';
  } else if (
    orderId.length < ORDER_ID_MIN_LENGTH ||
    orderId.length > ORDER_ID_MAX_LENGTH
  ) {
    errors.orderId = `Order ID must be ${ORDER_ID_MIN_LENGTH}-${ORDER_ID_MAX_LENGTH} characters.`;
  } else if (!ORDER_ID_PATTERN.test(orderId) || !/\d/.test(orderId)) {
    errors.orderId =
      'Order ID must contain a number and use only letters, numbers, dot, slash, hyphen, or underscore.';
  }

  if (!awbNumber) {
    errors.awbNumber = 'AWB number is required.';
  } else if (
    awbNumber.length < AWB_MIN_LENGTH ||
    awbNumber.length > AWB_MAX_LENGTH
  ) {
    errors.awbNumber = `AWB number must be ${AWB_MIN_LENGTH}-${AWB_MAX_LENGTH} characters.`;
  } else if (!AWB_PATTERN.test(awbNumber) || !/\d/.test(awbNumber)) {
    errors.awbNumber =
      'AWB number must contain a number and use only letters, numbers, or hyphens.';
  }

  if (otpCode) {
    if (!/^\d+$/.test(otpCode)) {
      errors.otpCode = 'OTP must contain digits only.';
    } else if (
      otpCode.length < OTP_MIN_LENGTH ||
      otpCode.length > OTP_MAX_LENGTH
    ) {
      errors.otpCode = `OTP must be ${OTP_MIN_LENGTH}-${OTP_MAX_LENGTH} digits.`;
    }
  }

  return errors;
}

const HOME_ASSETS = {
  notification: NotificationSvg,
  liveFeed: LiveFeedSvg,
  chevronRight: ChevronRightSvg,
  manageFamily: ManageFamilySvg,
  deliveryAccess: DeliveryAccessSvg,
  security: SecuritySvg,
  recordings: ImagesSvg,
  activityClock: ActivityClockSvg,
} as const;

function getScale(width: number) {
  if (width <= 320) return 0.88;
  if (width <= 360) return 0.95;
  if (width >= 430) return 1.12;
  return 1;
}

function createResponsiveStyles(scale: number) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: '#F8F8F8',
    },

    bellButton: {
      width: Math.round(40 * scale),
      height: Math.round(40 * scale),
      borderRadius: Math.round(12 * scale),
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'visible',
    },
    bellBadge: {
      position: 'absolute',
      top: Math.round(4 * scale),
      right: Math.round(4 * scale),
      minWidth: Math.round(16 * scale),
      height: Math.round(16 * scale),
      borderRadius: Math.round(8 * scale),
      backgroundColor: '#FF3B30',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Math.round(4 * scale),
      borderWidth: 1,
      borderColor: '#2563EB',
    },
    bellBadgeText: {
      color: '#FFFFFF',
      fontSize: Math.round(9 * scale),
      fontWeight: '800',
      textAlign: 'center',
    },

    content: {
      paddingHorizontal: Math.round(20 * scale),
      paddingTop: Math.round(20 * scale),
      paddingBottom: Math.round(36 * scale),
    },

    sectionTitle: {
      fontSize: Math.round(19 * scale),
      lineHeight: Math.round(27 * scale),
      fontWeight: '800',
      color: '#111111',
      marginBottom: Math.round(16 * scale),
    },

    liveCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: Math.round(12 * scale),
      borderWidth: 1,
      borderColor: '#DDDDDD',
      minHeight: Math.round(56 * scale),
      paddingHorizontal: Math.round(16 * scale),
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Math.round(24 * scale),
    },

    liveIconWrap: {
      width: Math.round(24 * scale),
      height: Math.round(24 * scale),
      borderRadius: Math.round(8 * scale),
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Math.round(10 * scale),
    },

    liveText: {
      flex: 1,
      color: '#222222',
      fontSize: Math.round(15 * scale),
      lineHeight: Math.round(22 * scale),
      fontWeight: '500',
    },

    liveChevron: {
      width: Math.round(18 * scale),
      height: Math.round(18 * scale),
      tintColor: '#6F6F6F',
    },

    manualScheduleCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: Math.round(10 * scale),
      borderWidth: 1,
      borderColor: '#DCE6FF',
      minHeight: Math.round(56 * scale),
      paddingHorizontal: Math.round(14 * scale),
      paddingVertical: Math.round(8 * scale),
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Math.round(8 * scale),
    },

    manualScheduleCardOpen: {
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderColor: '#BFD2FF',
      borderBottomColor: '#EEF4FF',
      marginBottom: 0,
    },

    manualScheduleCopy: {
      flex: 1,
      paddingRight: Math.round(8 * scale),
    },

    manualScheduleTitle: {
      color: '#1F2937',
      fontSize: Math.round(14 * scale),
      lineHeight: Math.round(20 * scale),
      fontWeight: '700',
    },

    manualScheduleChevronWrap: {
      width: Math.round(30 * scale),
      height: Math.round(30 * scale),
      borderRadius: Math.round(15 * scale),
      backgroundColor: '#EEF4FF',
      alignItems: 'center',
      justifyContent: 'center',
    },

    manualScheduleChevronWrapOpen: {
      backgroundColor: '#DBE8FF',
      transform: [{ rotate: '90deg' }],
    },

    manualScheduleChevron: {
      width: Math.round(16 * scale),
      height: Math.round(16 * scale),
      tintColor: '#2E63E6',
    },

    pastedDeliveryPanel: {
      backgroundColor: '#FFFFFF',
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderBottomLeftRadius: Math.round(10 * scale),
      borderBottomRightRadius: Math.round(10 * scale),
      borderWidth: 1,
      borderTopWidth: 0,
      borderColor: '#BFD2FF',
      padding: Math.round(10 * scale),
      marginBottom: Math.round(18 * scale),
    },

    pastedDeliveryLabel: {
      color: '#1F2937',
      fontSize: Math.round(13 * scale),
      lineHeight: Math.round(19 * scale),
      fontWeight: '700',
      marginBottom: Math.round(6 * scale),
    },

    pastedDeliveryHint: {
      color: '#6B7280',
      fontSize: Math.round(11 * scale),
      lineHeight: Math.round(15 * scale),
      fontWeight: '500',
      marginBottom: Math.round(8 * scale),
    },

    pastedDeliveryInput: {
      minHeight: Math.round(92 * scale),
      borderRadius: Math.round(8 * scale),
      borderWidth: 1,
      borderColor: '#D1D5DB',
      backgroundColor: '#F9FAFB',
      paddingHorizontal: Math.round(12 * scale),
      paddingVertical: Math.round(10 * scale),
      color: '#111827',
      fontSize: Math.round(14 * scale),
      lineHeight: Math.round(20 * scale),
      textAlignVertical: 'top',
    },

    pastedDeliveryActions: {
      flexDirection: 'row',
      gap: Math.round(8 * scale),
      marginTop: Math.round(10 * scale),
    },

    pastedDeliveryButton: {
      flex: 1,
      minHeight: Math.round(38 * scale),
      borderRadius: Math.round(8 * scale),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Math.round(10 * scale),
    },

    pastedDeliveryManualButton: {
      backgroundColor: '#EEF4FF',
    },

    pastedDeliverySubmitButton: {
      backgroundColor: '#2362EB',
    },

    pastedDeliveryButtonDisabled: {
      opacity: 0.6,
    },

    pastedDeliveryManualText: {
      color: '#2E63E6',
      fontSize: Math.round(12 * scale),
      fontWeight: '700',
      textAlign: 'center',
    },

    pastedDeliverySubmitText: {
      color: '#FFFFFF',
      fontSize: Math.round(12 * scale),
      fontWeight: '700',
      textAlign: 'center',
    },

    visitorCard: {
      backgroundColor: '#EAF9EE',
      borderRadius: Math.round(12 * scale),
      paddingHorizontal: Math.round(12 * scale),
      paddingVertical: Math.round(12 * scale),
      marginBottom: Math.round(30 * scale),
    },

    visitorTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },

    visitorAvatar: {
      width: Math.round(34 * scale),
      height: Math.round(34 * scale),
      borderRadius: Math.round(17 * scale),
      backgroundColor: '#D7D7D7',
      marginRight: Math.round(10 * scale),
    },

    visitorInfo: {
      flex: 1,
      paddingRight: Math.round(8 * scale),
    },

    visitorTitle: {
      fontSize: Math.round(14 * scale),
      fontWeight: '700',
      color: '#111111',
    },

    visitorSub: {
      marginTop: Math.max(2, Math.round(3 * scale)),
      fontSize: Math.round(11 * scale),
      fontWeight: '500',
      color: '#6B7280',
    },

    visitorDetailBtn: {
      alignSelf: 'flex-start',
      marginTop: Math.round(2 * scale),
    },

    visitorDetailText: {
      fontSize: Math.round(11 * scale),
      fontWeight: '600',
      color: '#5F6670',
    },

    visitorHint: {
      marginTop: Math.round(4 * scale),
      fontSize: Math.round(10 * scale),
      fontWeight: '600',
      color: '#2F2F2F',
    },

    pendingPill: {
      minWidth: Math.round(58 * scale),
      height: Math.round(24 * scale),
      paddingHorizontal: Math.round(10 * scale),
      borderRadius: Math.round(12 * scale),
      borderWidth: 1,
      borderColor: '#F59E0B',
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },

    pendingText: {
      color: '#F59E0B',
      fontSize: Math.round(10 * scale),
      fontWeight: '600',
    },

    visitorActions: {
      flexDirection: 'row',
      gap: Math.round(10 * scale),
      marginTop: Math.round(12 * scale),
    },

    actionButton: {
      flex: 1,
      minHeight: Math.round(36 * scale),
      borderRadius: Math.round(4 * scale),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
    },

    approveButton: {
      borderColor: '#19B35C',
    },

    denyButton: {
      borderColor: '#FF3B30',
    },

    approveText: {
      color: '#19B35C',
      fontSize: Math.round(15 * scale),
      fontWeight: '500',
    },

    denyText: {
      color: '#FF1A1A',
      fontSize: Math.round(15 * scale),
      fontWeight: '500',
    },

    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: Math.round(18 * scale),
      marginBottom: Math.round(34 * scale),
    },

    quickCard: {
      width: '47.5%',
      minHeight: Math.round(122 * scale),
      borderRadius: Math.round(12 * scale),
      borderWidth: 1,
      borderColor: '#E0E0E0',
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Math.round(10 * scale),
      paddingVertical: Math.round(16 * scale),
    },

    quickIconWrap: {
      width: Math.round(48 * scale),
      height: Math.round(48 * scale),
      borderRadius: Math.round(24 * scale),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Math.round(14 * scale),
    },

    quickTitle: {
      color: '#1C1C1C',
      fontSize: Math.round(14 * scale),
      fontWeight: '600',
      textAlign: 'center',
      lineHeight: Math.round(21 * scale),
    },

    simpleModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(17, 24, 39, 0.32)',
      justifyContent: 'center',
      paddingHorizontal: Math.round(18 * scale),
    },

    simpleModalCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: Math.round(18 * scale),
      paddingTop: Math.round(22 * scale),
      paddingBottom: Math.round(20 * scale),
      paddingHorizontal: Math.round(18 * scale),
      shadowColor: '#000000',
      shadowOpacity: 0.15,
      shadowRadius: Math.round(16 * scale),
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },

    simpleModalClose: {
      position: 'absolute',
      top: Math.round(14 * scale),
      right: Math.round(14 * scale),
      width: Math.round(28 * scale),
      height: Math.round(28 * scale),
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },

    simpleModalCloseText: {
      fontSize: Math.round(22*   scale),
      lineHeight: Math.round(22 * scale),
      color: '#8A8A8A',
      fontWeight: '300',
    },

    simpleModalIconWrap: {
      width: Math.round(58 * scale),
      height: Math.round(58 * scale),
      borderRadius: Math.round(29 * scale),
      backgroundColor: '#EEF4FF',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: Math.round(18 * scale),
    },

    simpleModalTitle: {
      textAlign: 'center',
      color: '#2B2B2B',
      fontSize: Math.round(24 * scale),
      fontWeight: '700',
      marginBottom: Math.round(14 * scale),
    },

    simpleModalBody: {
      textAlign: 'center',
      color: '#4B5563',
      fontSize: Math.round(15 * scale),
      lineHeight: Math.round(24 * scale),
      fontWeight: '500',
      marginBottom: Math.round(18 * scale),
    },

    simpleModalButton: {
      height: Math.round(48 * scale),
      borderRadius: Math.round(10 * scale),
      backgroundColor: '#F3F4F6',
      alignItems: 'center',
      justifyContent: 'center',
    },

    simpleModalButtonText: {
      color: '#353535',
      fontSize: Math.round(16 * scale),
      fontWeight: '700',
    },

    manualSuccessButton: {
      height: Math.round(48 * scale),
      borderRadius: Math.round(10 * scale),
      backgroundColor: '#2362EB',
      alignItems: 'center',
      justifyContent: 'center',
    },

    manualSuccessButtonText: {
      color: '#FFFFFF',
      fontSize: Math.round(16 * scale),
      fontWeight: '700',
    },

    manualModalCard: {
      maxHeight: '92%',
      backgroundColor: '#FFFFFF',
      borderRadius: Math.round(18 * scale),
      paddingTop: Math.round(24 * scale),
      paddingBottom: Math.round(20 * scale),
      paddingHorizontal: Math.round(18 * scale),
      shadowColor: '#000000',
      shadowOpacity: 0.15,
      shadowRadius: Math.round(16 * scale),
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },

    manualModalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Math.round(12 * scale),
      marginBottom: Math.round(8 * scale),
    },

    manualModalTitle: {
      flex: 1,
      color: '#111827',
      fontSize: Math.round(22 * scale),
      fontWeight: '700',
      lineHeight: Math.round(29 * scale),
    },

    manualModalClose: {
      width: Math.round(32 * scale),
      height: Math.round(32 * scale),
      borderRadius: Math.round(16 * scale),
      backgroundColor: '#F8FAFC',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },

    manualModalBody: {
      color: '#6B7280',
      fontSize: Math.round(14 * scale),
      lineHeight: Math.round(20 * scale),
      fontWeight: '500',
      marginBottom: Math.round(18 * scale),
    },

    formField: {
      marginBottom: Math.round(14 * scale),
    },

    formLabel: {
      color: '#1F2937',
      fontSize: Math.round(13 * scale),
      fontWeight: '700',
      marginBottom: Math.round(6 * scale),
    },

    formInput: {
      minHeight: Math.round(46 * scale),
      borderRadius: Math.round(10 * scale),
      borderWidth: 1,
      borderColor: '#D1D5DB',
      backgroundColor: '#FFFFFF',
      paddingHorizontal: Math.round(14 * scale),
      color: '#111827',
      fontSize: Math.round(14 * scale),
      fontWeight: '500',
    },

    formInputError: {
      borderColor: '#DC2626',
      backgroundColor: '#FEF2F2',
    },

    formFieldError: {
      color: '#DC2626',
      fontSize: Math.round(12 * scale),
      lineHeight: Math.round(18 * scale),
      fontWeight: '600',
      marginTop: Math.round(6 * scale),
    },

    formError: {
      color: '#DC2626',
      fontSize: Math.round(12 * scale),
      fontWeight: '600',
      marginBottom: Math.round(12 * scale),
    },

    formActions: {
      flexDirection: 'row',
      gap: Math.round(10 * scale),
      marginTop: Math.round(4 * scale),
    },

    formActionButton: {
      flex: 1,
      minHeight: Math.round(46 * scale),
      borderRadius: Math.round(10 * scale),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Math.round(12 * scale),
    },

    formCancelButton: {
      backgroundColor: '#F3F4F6',
    },

    formSubmitButton: {
      backgroundColor: '#2E63E6',
    },

    formSubmitButtonDisabled: {
      opacity: 0.7,
    },

    formCancelButtonText: {
      color: '#374151',
      fontSize: Math.round(14 * scale),
      fontWeight: '700',
    },

    formSubmitButtonText: {
      color: '#FFFFFF',
      fontSize: Math.round(14 * scale),
      lineHeight: Math.round(20 * scale),
      fontWeight: '700',
      textAlign: 'center',
    },

    recentHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Math.round(10 * scale),
    },

    viewAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    viewAllText: {
      fontSize: Math.round(14 * scale),
      fontWeight: '700',
      color: '#313131',
      marginRight: Math.round(6 * scale),
    },

    viewAllChevron: {
      width: Math.round(16 * scale),
      height: Math.round(16 * scale),
      tintColor: '#313131',
    },

    activityList: {
      backgroundColor: 'transparent',
    },

    recentEmpty: {
      paddingTop: Math.round(2 * scale),
      paddingBottom: Math.round(6 * scale),
    },

    recentEmptyText: {
      fontSize: Math.round(14 * scale),
      fontWeight: '600',
      color: '#6B7280',
    },

    activityItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: Math.round(14 * scale),
      borderBottomWidth: 1,
      borderBottomColor: '#D9D9D9',
    },

    activityItemLast: {
      borderBottomWidth: 0,
    },

    activityThumb: {
      width: Math.round(74 * scale),
      height: Math.round(74 * scale),
      borderRadius: Math.round(8 * scale),
      backgroundColor: '#D9D9D9',
      marginRight: Math.round(16 * scale),
      overflow: 'hidden',
    },

    activityThumbImage: {
      width: '100%',
      height: '100%',
    },

    activityBody: {
      flex: 1,
      paddingTop: Math.max(2, Math.round(2 * scale)),
    },

    activityTitle: {
      fontSize: Math.round(15 * scale),
      fontWeight: '700',
      color: '#222222',
      lineHeight: Math.round(20 * scale),
    },

    activityMeta: {
      marginTop: Math.round(4 * scale),
      fontSize: Math.round(12 * scale),
      fontWeight: '500',
      color: '#3A3A3A',
      lineHeight: Math.round(18 * scale),
    },

    activityTimeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Math.round(8 * scale),
    },

    activityClock: {
      width: Math.round(14 * scale),
      height: Math.round(14 * scale),
      marginRight: Math.round(6 * scale),
    },

    activityTime: {
      fontSize: Math.round(12 * scale),
      fontWeight: '500',
      color: '#4E4E4E',
    },

    bottomSpacer: {
      height: Math.round(24 * scale),
    },
  });
}

export default function Home({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const { width } = useWindowDimensions();
  const scale = getScale(width);
  const styles = useMemo(() => createResponsiveStyles(scale), [scale]);
  const customerName = useAppSelector(state => state.auth.user?.name);
  const { simpleModeEnabled, simpleModePromptPending } = useAppSelector(
    state => state.preferences,
  );
  const { upcoming, history, refresh, loadUpcoming } = useDeliverySchedules();
  const [isSimpleModePopupVisible, setIsSimpleModePopupVisible] =
    useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [isManualDeliveryModalVisible, setIsManualDeliveryModalVisible] =
    useState(false);
  const [isManualDeliverySuccessVisible, setIsManualDeliverySuccessVisible] =
    useState(false);
  const [isScheduleDropdownVisible, setIsScheduleDropdownVisible] =
    useState(false);
  const [pastedDeliveryMessage, setPastedDeliveryMessage] = useState('');
  const [pastedDeliveryError, setPastedDeliveryError] = useState('');
  const [manualProductTitle, setManualProductTitle] = useState('');
  const [manualOrderId, setManualOrderId] = useState('');
  const [manualAwbNumber, setManualAwbNumber] = useState('');
  const [manualOtpCode, setManualOtpCode] = useState('');
  const [manualScheduleError, setManualScheduleError] = useState('');
  const [manualFieldErrors, setManualFieldErrors] =
    useState<ManualDeliveryFieldErrors>({});
  const [
    createManualDeliverySchedule,
    { isLoading: isCreatingManualDeliverySchedule },
  ] = useCreateManualDeliveryScheduleMutation();
  const [receiveDeliverySms, { isLoading: isSchedulingPastedDelivery }] =
    useReceiveDeliverySmsMutation();
  const isSchedulingDeliveryFromText =
    isSchedulingPastedDelivery || isCreatingManualDeliverySchedule;

  useEffect(() => {
    logs.info('[Home] responsive text-safe styles applied; Away Mode entry hidden', {
      width,
      scale,
    });
  }, [width, scale]);

  const syncUnreadNotificationCount = useCallback(async () => {
    try {
      const count = await getUnreadNotificationInboxCount();
      setUnreadNotificationCount(count);
      logs.info('[Home] unread notification count synced', {count});
    } catch (error) {
      logs.error('[Home] unread notification count sync failed', error);
      throw error;
    }
  }, []);

  const resetManualDeliveryForm = useCallback(() => {
    setManualProductTitle('');
    setManualOrderId('');
    setManualAwbNumber('');
    setManualOtpCode('');
    setManualScheduleError('');
    setManualFieldErrors({});
  }, []);

  const clearManualFieldError = useCallback(
    (field: keyof ManualDeliveryFieldErrors) => {
      setManualFieldErrors(current => {
        if (!current[field]) return current;
        const next = { ...current };
        delete next[field];
        return next;
      });
      setManualScheduleError('');
    },
    [],
  );

  const visitorAtDoor = useMemo(() => {
    const candidates = upcoming.data.filter(item => {
      if (item.verificationMethod === 'nfc') return false;
      if (!item.arrivedByTablet) return false;
      if (item.currentStatus !== 'upon_arrival') return false;
      if (!item.activeTabletDeliverySessionId && !item.activeTabletDeliverySessionAt) {
        return false;
      }

      const statusHistory = (item as any)?.statusHistory;
      const responded =
        Array.isArray(statusHistory) &&
        statusHistory.some((h: any) => {
          const msg = String(h?.messageSummary || '').toLowerCase();
          return (
            (msg.includes('approved') && msg.includes('mobile')) ||
            msg.includes('approved from mobile app')
          );
        });

      return !responded;
    });
    if (!candidates.length) {
      logs.info('[Home] no active tablet-arrival delivery card candidate');
      return null;
    }

    const nextDelivery =
      [...candidates].sort((a, b) => {
        const at = a.activeTabletDeliverySessionAt
          ? new Date(a.activeTabletDeliverySessionAt).getTime()
          : 0;
        const bt = b.activeTabletDeliverySessionAt
          ? new Date(b.activeTabletDeliverySessionAt).getTime()
          : 0;
        if (bt !== at) return bt - at;
        return String(b.updatedAt || b.createdAt || '').localeCompare(
          String(a.updatedAt || a.createdAt || ''),
        );
      })[0] || null;
    if (!nextDelivery) return null;

    return {
      id: nextDelivery._id,
      title: 'Visitor at Door',
      subtitle: 'Click to view details',
      hint: nextDelivery.orderHint
        ? `Order ${nextDelivery.orderHint}`
        : nextDelivery.productSummary ||
          nextDelivery.sellerName ||
          (nextDelivery.referenceId ? `Ref ${nextDelivery.referenceId}` : ''),
      status: 'pending' as const,
    };
  }, [upcoming.data]);

  useFocusEffect(
    useCallback(() => {
      syncUnreadNotificationCount().catch(() => undefined);
      refresh(true).catch(() => undefined);

      const interval = setInterval(
        () => {
          if (!visitorAtDoor?.id) {
            loadUpcoming(0, 50).catch(() => undefined);
            return;
          }

          loadUpcoming(0, 50).catch(() => undefined);
        },
        visitorAtDoor?.id ? 30000 : 8000,
      );

      return () => clearInterval(interval);
    }, [loadUpcoming, refresh, syncUnreadNotificationCount, visitorAtDoor?.id]),
  );

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = subscribeToNotificationInbox(() => {
        syncUnreadNotificationCount().catch(() => undefined);
      });

      return unsubscribe;
    }, [syncUnreadNotificationCount]),
  );

  useFocusEffect(
    useCallback(() => {
      if (simpleModeEnabled && simpleModePromptPending) {
        setIsSimpleModePopupVisible(true);
      }
    }, [simpleModeEnabled, simpleModePromptPending]),
  );

  const welcomeTitle = useMemo(() => {
    const trimmed = String(customerName || '').trim();
    const firstName = trimmed.split(/\s+/)[0];
    return firstName ? `Welcome, ${firstName}` : 'Welcome';
  }, [customerName]);

  const rootNavigation = navigation.getParent();
  const tabsNavigation = navigation.getParent() as any;

  const homeActivity = useMemo<Activity[]>(() => {
    return history.data.slice(0, 2).map(item => ({
      id: item._id,
      title:
        item.productSummary ||
        item.sellerName ||
        item.referenceId ||
        'Delivery update',
      meta: `${item.currentStatus === 'failed' ? 'Rejected' : 'Delivered'} • ${
        item.orderHint
          ? `Order ${item.orderHint}`
          : item.referenceId
          ? `Ref ${item.referenceId}`
          : 'Recent activity'
      }`,
      time: formatHomeTime(
        item.completedAt || item.updatedAt || item.createdAt,
      ),
      image:
        item.imageUrl ||
        item.thumbnailUrl ||
        item.latestSmsId?.extractedData?.imageUrl ||
        item.latestSmsId?.extractedData?.thumbnailUrl
          ? {
              uri:
                item.imageUrl ||
                item.thumbnailUrl ||
                item.latestSmsId?.extractedData?.imageUrl ||
                item.latestSmsId?.extractedData?.thumbnailUrl,
            }
          : undefined,
    }));
  }, [history.data]);

  const goDeliveryApproved = () => {
    if (!visitorAtDoor?.id) return;
    tabsNavigation?.navigate?.('DeliveryApproved', {
      scheduleId: visitorAtDoor.id,
    });
  };

  const goDeliveryRejected = () => {
    if (!visitorAtDoor?.id) return;
    tabsNavigation?.navigate?.('DeliveryRejected', {
      scheduleId: visitorAtDoor.id,
    });
  };

  const goVisitorDetails = () => {
    if (!visitorAtDoor?.id) return;
    tabsNavigation?.navigate?.('DeliveryStack', {
      screen: 'DeliveryDetails',
      params: { scheduleId: visitorAtDoor.id },
    });
  };

  const goManageFamily = () => {
    tabsNavigation?.navigate?.('MembersStack');
  };

  const goDeliveryAccess = () => {
    tabsNavigation?.navigate?.('DeliveryStack');
  };

  const goSecurity = () => {
    rootNavigation?.navigate('SecurityAccessControl' as never);
  };

  const goRecordings = () => {
    rootNavigation?.navigate('DeliveryRecordings' as never);
  };

  const goLiveFeed = () => {
    rootNavigation?.navigate('LiveFeed' as never);
  };

  const goDeliveryHistory = () => {
    navigation.getParent()?.navigate?.('DeliveryHistory' as never);
  };

  const openManualDeliveryModal = () => {
    setIsScheduleDropdownVisible(false);
    setManualScheduleError('');
    setManualFieldErrors({});
    setIsManualDeliveryModalVisible(true);
    logs.info('[Home] manual delivery form opened');
  };

  const toggleScheduleDropdown = useCallback(() => {
    setIsScheduleDropdownVisible(current => {
      const next = !current;
      logs.info('[Home] upcoming delivery paste dropdown toggled', {
        visible: next,
      });
      return next;
    });
    setPastedDeliveryError('');
  }, []);

  const submitManualDeliveryDraftFromText = useCallback(
    async (smsText: string) => {
      const draft = buildManualDeliveryDraftFromMessage(smsText);
      const validationErrors = validateManualDeliveryFields(draft);

      if (Object.keys(validationErrors).length) {
        setManualProductTitle(draft.productTitle);
        setManualOrderId(draft.orderId);
        setManualAwbNumber(draft.awbNumber);
        setManualOtpCode(draft.otpCode);
        setManualFieldErrors(validationErrors);
        setManualScheduleError('Please complete the highlighted fields.');
        setIsManualDeliveryModalVisible(true);
        logs.error('[Home] textarea manual delivery extraction incomplete', {
          fields: Object.keys(validationErrors),
        });
        return false;
      }

      logs.info('[Home] creating manual delivery schedule from textarea', {
        hasOtpCode: Boolean(draft.otpCode),
      });
      await createManualDeliverySchedule({
        productTitle: draft.productTitle,
        orderId: draft.orderId,
        awbNumber: draft.awbNumber,
        otpCode: draft.otpCode || undefined,
        idempotencyKey: getManualDeliveryIdempotencyKey(draft),
      }).unwrap();
      setPastedDeliveryMessage('');
      setIsScheduleDropdownVisible(false);
      await refresh(true);
      setIsManualDeliverySuccessVisible(true);
      logs.info('[Home] textarea manual delivery scheduled successfully');
      return true;
    },
    [createManualDeliverySchedule, refresh],
  );

  const submitPastedDeliveryMessage = useCallback(async () => {
    const smsText = pastedDeliveryMessage.trim();
    if (!smsText) {
      setPastedDeliveryError('Paste a delivery message before scheduling.');
      logs.error('[Home] pasted delivery validation failed', {
        reason: 'empty_message',
      });
      return;
    }

    try {
      setPastedDeliveryError('');
      logs.info('[Home] scheduling delivery from pasted message', {
        messageLength: smsText.length,
      });
      const response = await receiveDeliverySms({
        smsText,
        messageId: getPastedDeliveryMessageId(smsText),
      }).unwrap();
      if (response.data?.ignored || !response.data?.scheduleUpdated) {
        logs.info('[Home] pasted delivery parser did not create schedule', {
          ignored: Boolean(response.data?.ignored),
          confidence: response.data?.confidence,
        });
        const scheduledManually = await submitManualDeliveryDraftFromText(smsText);
        if (!scheduledManually) {
          setPastedDeliveryError(
            'Add the missing order or AWB details to finish scheduling.',
          );
        }
        return;
      }

      setPastedDeliveryMessage('');
      setIsScheduleDropdownVisible(false);
      await refresh(true);
      setIsManualDeliverySuccessVisible(true);
      logs.info('[Home] pasted delivery scheduled successfully', {
        scheduleId: response.data?.scheduleId || null,
      });
    } catch (error: any) {
      const message =
        typeof error?.data?.message === 'string'
          ? error.data.message
          : 'Failed to schedule delivery from the pasted message.';
      setPastedDeliveryError(message);
      logs.error('[Home] failed to schedule pasted delivery message', {
        error,
      });
    }
  }, [
    pastedDeliveryMessage,
    receiveDeliverySms,
    refresh,
    submitManualDeliveryDraftFromText,
  ]);

  const closeManualDeliveryModal = useCallback(() => {
    if (isCreatingManualDeliverySchedule) {
      logs.info('[Home] manual delivery close ignored while submitting');
      return;
    }
    setIsManualDeliveryModalVisible(false);
    resetManualDeliveryForm();
    logs.info('[Home] manual delivery form closed');
  }, [isCreatingManualDeliverySchedule, resetManualDeliveryForm]);

  const closeManualDeliverySuccess = useCallback(() => {
    setIsManualDeliverySuccessVisible(false);
    logs.info('[Home] manual delivery confirmation dismissed');
  }, []);

  const submitManualDeliverySchedule = useCallback(async () => {
    const productTitle = manualProductTitle.replace(/\s+/g, ' ').trim();
    const orderId = manualOrderId.trim();
    const awbNumber = manualAwbNumber.trim().toUpperCase();
    const otpCode = cleanManualOtpInput(manualOtpCode);
    const validationErrors = validateManualDeliveryFields({
      productTitle,
      orderId,
      awbNumber,
      otpCode,
    });

    if (Object.keys(validationErrors).length) {
      setManualFieldErrors(validationErrors);
      setManualScheduleError('Please correct the highlighted fields.');
      logs.error('[Home] manual delivery validation failed', {
        fields: Object.keys(validationErrors),
      });
      return;
    }

    try {
      setManualFieldErrors({});
      setManualScheduleError('');
      logs.info('[Home] manual delivery validation passed', {
        hasOtpCode: Boolean(otpCode),
      });
      logs.info('[Home] creating manual delivery schedule', {
        hasOtpCode: Boolean(otpCode),
      });
      await createManualDeliverySchedule({
        productTitle,
        orderId,
        awbNumber,
        otpCode: otpCode || undefined,
        idempotencyKey: getManualDeliveryIdempotencyKey({
          productTitle,
          orderId,
          awbNumber,
          otpCode,
        }),
      }).unwrap();
      setIsManualDeliveryModalVisible(false);
      resetManualDeliveryForm();
      await refresh(true);
      setIsManualDeliverySuccessVisible(true);
      logs.info('[Home] branded manual delivery confirmation displayed');
    } catch (error: any) {
      logs.error('[Home] failed to create manual delivery schedule', { error });
      const message =
        typeof error?.data?.message === 'string'
          ? error.data.message
          : 'Failed to create manual delivery schedule.';
      setManualScheduleError(message);
    }
  }, [
    createManualDeliverySchedule,
    manualAwbNumber,
    manualOtpCode,
    manualOrderId,
    manualProductTitle,
    refresh,
    resetManualDeliveryForm,
  ]);

  const quickActions: QuickActionItem[] = [
    {
      id: 'manage-family',
      title: 'Manage Family',
      icon: HOME_ASSETS.manageFamily,
      iconBg: '#EEF2FF',
      iconSize: 24,
      onPress: goManageFamily,
    },
    {
      id: 'delivery-access',
      title: 'Delivery Access',
      icon: HOME_ASSETS.deliveryAccess,
      iconBg: '#EEF2FF',
      iconSize: 24,
      onPress: goDeliveryAccess,
    },
    {
      id: 'security',
      title: 'Security',
      icon: HOME_ASSETS.security,
      iconBg: '#EAFBF0',
      iconSize: 20,
      onPress: goSecurity,
    },
    {
      id: 'recordings',
      title: 'View History    ',
      icon: HOME_ASSETS.recordings,
      iconBg: '#F4F4F5',
      iconSize: 22,
      onPress: goRecordings,
    },
  ];

  const simpleModeCopy = useMemo(
    () => ({
      title: 'आगामी डिलिवरी',
      message:
        'आपकी डिलिवरी जल्द आने वाली है\nकृपया उस समय पर घर पर उपलब्ध रहें\nडिलिवरी आने पर पुष्टि के लिए अपना NFC कार्ड दरवाजे के पैनल पर टैप करें',
      close: 'Close',
    }),
    [],
  );

  const closeSimpleModePopup = () => {
    setIsSimpleModePopupVisible(false);
    if (simpleModePromptPending) {
      dispatch(preferencesActions.simpleModePromptDismissed());
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title={welcomeTitle}
        subtitle="Your home is secured"
        leftAligned
        right={
          <Pressable
            style={styles.bellButton}
            onPress={() => navigation.navigate('NotificationsInbox')}
          >
            <HOME_ASSETS.notification width={20} height={20} />
            {unreadNotificationCount > 0 ? (
              <View style={styles.bellBadge}>
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  numberOfLines={1}
                  style={styles.bellBadgeText}
                >
                  {unreadNotificationCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Live Feed</Text>

        <Pressable style={styles.liveCard} onPress={goLiveFeed}>
          <View style={styles.liveIconWrap}>
            <HOME_ASSETS.liveFeed width="100%" height="100%" />
          </View>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.84}
            style={styles.liveText}
          >
            Live Feed
          </Text>
          <HOME_ASSETS.chevronRight
            width={styles.liveChevron.width}
            height={styles.liveChevron.height}
          />
        </Pressable>

        <Pressable
          style={[
            styles.manualScheduleCard,
            isScheduleDropdownVisible && styles.manualScheduleCardOpen,
          ]}
          onPress={toggleScheduleDropdown}
          accessibilityRole="button"
          accessibilityState={{ expanded: isScheduleDropdownVisible }}
        >
          <View style={styles.liveIconWrap}>
            <HOME_ASSETS.deliveryAccess width="100%" height="100%" />
          </View>
          <View style={styles.manualScheduleCopy}>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.84}
              style={styles.manualScheduleTitle}
            >
              Schedule Delivery
            </Text>
          </View>
          <View
            style={[
              styles.manualScheduleChevronWrap,
              isScheduleDropdownVisible &&
                styles.manualScheduleChevronWrapOpen,
            ]}
          >
            <HOME_ASSETS.chevronRight
              width={styles.manualScheduleChevron.width}
              height={styles.manualScheduleChevron.height}
            />
          </View>
        </Pressable>

        {isScheduleDropdownVisible ? (
          <View style={styles.pastedDeliveryPanel}>
            <Text style={styles.pastedDeliveryLabel}>Delivery message</Text>
            <Text style={styles.pastedDeliveryHint}>
              Paste SMS. We will schedule it in Upcoming Deliveries.
            </Text>
            <TextInput
              style={styles.pastedDeliveryInput}
              value={pastedDeliveryMessage}
              onChangeText={text => {
                setPastedDeliveryMessage(text);
                setPastedDeliveryError('');
              }}
              placeholder="Paste your delivery message here..."
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={PASTED_DELIVERY_MESSAGE_MAX_LENGTH}
              editable={!isSchedulingDeliveryFromText}
            />
            {pastedDeliveryError ? (
              <Text style={styles.formFieldError}>{pastedDeliveryError}</Text>
            ) : null}
            <View style={styles.pastedDeliveryActions}>
              <Pressable
                onPress={openManualDeliveryModal}
                style={[
                  styles.pastedDeliveryButton,
                  styles.pastedDeliveryManualButton,
                ]}
                disabled={isSchedulingDeliveryFromText}
              >
                <Text style={styles.pastedDeliveryManualText}>
                  Fill form manually
                </Text>
              </Pressable>
              <Pressable
                onPress={submitPastedDeliveryMessage}
                style={[
                  styles.pastedDeliveryButton,
                  styles.pastedDeliverySubmitButton,
                  isSchedulingDeliveryFromText &&
                    styles.pastedDeliveryButtonDisabled,
                ]}
                disabled={isSchedulingDeliveryFromText}
              >
                {isSchedulingDeliveryFromText ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.pastedDeliverySubmitText}>
                    Schedule delivery
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        {visitorAtDoor ? (
          <View style={styles.visitorCard}>
            <View style={styles.visitorTop}>
              <View style={styles.visitorAvatar} />
              <View style={styles.visitorInfo}>
                <Text style={styles.visitorTitle}>{visitorAtDoor.title}</Text>
                <Pressable
                  onPress={goVisitorDetails}
                  style={styles.visitorDetailBtn}
                >
                  <Text style={styles.visitorDetailText}>
                    {visitorAtDoor.subtitle}
                  </Text>
                </Pressable>
                {visitorAtDoor.hint ? (
                  <Text numberOfLines={1} style={styles.visitorHint}>
                    {visitorAtDoor.hint}
                  </Text>
                ) : null}
              </View>

              <View style={styles.pendingPill}>
                <Text style={styles.pendingText}>Pending</Text>
              </View>
            </View>

            <View style={styles.visitorActions}>
              <Pressable
                onPress={goDeliveryApproved}
                style={[styles.actionButton, styles.approveButton]}
              >
                <Text style={styles.approveText}>Approve</Text>
              </Pressable>

              <Pressable
                onPress={goDeliveryRejected}
                style={[styles.actionButton, styles.denyButton]}
              >
                <Text style={styles.denyText}>Deny</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <View style={styles.quickGrid}>
          {quickActions.map(item => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.id}
                style={styles.quickCard}
                onPress={item.onPress}
              >
                <View
                  style={[
                    styles.quickIconWrap,
                    { backgroundColor: item.iconBg },
                  ]}
                >
                  <Icon
                    width={item.iconSize ?? 24}
                    height={item.iconSize ?? 24}
                  />
                </View>
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                  style={styles.quickTitle}
                >
                  {item.title}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.recentHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {homeActivity.length > 0 ? (
            <Pressable style={styles.viewAllBtn} onPress={goDeliveryHistory}>
              <Text style={styles.viewAllText}>View All</Text>
              <HOME_ASSETS.chevronRight
                width={styles.viewAllChevron.width}
                height={styles.viewAllChevron.height}
              />
            </Pressable>
          ) : null}
        </View>

        {homeActivity.length > 0 ? (
          <View style={styles.activityList}>
            {homeActivity.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.activityItem,
                  index === homeActivity.length - 1 && styles.activityItemLast,
                ]}
              >
                <View style={styles.activityThumb}>
                  {item.image ? (
                    <Image
                      source={item.image}
                      style={styles.activityThumbImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <DeliveryNoPreview
                      width="100%"
                      height="100%"
                      borderRadius={styles.activityThumb.borderRadius as number}
                      compact
                    />
                  )}
                </View>

                <View style={styles.activityBody}>
                  <Text style={styles.activityTitle}>{item.title}</Text>
                  <Text style={styles.activityMeta}>{item.meta}</Text>
                  <View style={styles.activityTimeRow}>
                    <HOME_ASSETS.activityClock
                      width={styles.activityClock.width}
                      height={styles.activityClock.height}
                    />
                    <Text style={styles.activityTime}>{item.time}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.recentEmpty}>
            <Text style={styles.recentEmptyText}>No recent activity</Text>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <Modal
        animationType="slide"
        transparent
        visible={isManualDeliveryModalVisible}
        onRequestClose={closeManualDeliveryModal}
      >
        <View style={styles.simpleModalOverlay}>
          <View style={styles.manualModalCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            <View style={styles.manualModalHeader}>
              <Text style={styles.manualModalTitle}>
                Manual Delivery Schedule
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close manual delivery form"
                onPress={closeManualDeliveryModal}
                style={styles.manualModalClose}
                hitSlop={8}
                disabled={isCreatingManualDeliverySchedule}
              >
                <CancelSvg width={16} height={16} />
              </Pressable>
            </View>
            <Text style={styles.manualModalBody}>
              Add the basic delivery details now. If related SMS arrives later,
              the current flow can still continue normally.
            </Text>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Product Title</Text>
              <TextInput
                style={[
                  styles.formInput,
                  manualFieldErrors.productTitle && styles.formInputError,
                ]}
                value={manualProductTitle}
                onChangeText={text => {
                  setManualProductTitle(text);
                  clearManualFieldError('productTitle');
                }}
                placeholder="Enter product title"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="words"
                maxLength={PRODUCT_TITLE_MAX_LENGTH + 1}
              />
              {manualFieldErrors.productTitle ? (
                <Text style={styles.formFieldError}>
                  {manualFieldErrors.productTitle}
                </Text>
              ) : null}
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Order ID</Text>
              <TextInput
                style={[
                  styles.formInput,
                  manualFieldErrors.orderId && styles.formInputError,
                ]}
                value={manualOrderId}
                onChangeText={text => {
                  setManualOrderId(text);
                  clearManualFieldError('orderId');
                }}
                placeholder="Enter order ID"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={ORDER_ID_MAX_LENGTH + 1}
              />
              {manualFieldErrors.orderId ? (
                <Text style={styles.formFieldError}>
                  {manualFieldErrors.orderId}
                </Text>
              ) : null}
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>AWB Number</Text>
              <TextInput
                style={[
                  styles.formInput,
                  manualFieldErrors.awbNumber && styles.formInputError,
                ]}
                value={manualAwbNumber}
                onChangeText={text => {
                  setManualAwbNumber(text);
                  clearManualFieldError('awbNumber');
                }}
                placeholder="Enter AWB number"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={AWB_MAX_LENGTH + 1}
              />
              {manualFieldErrors.awbNumber ? (
                <Text style={styles.formFieldError}>
                  {manualFieldErrors.awbNumber}
                </Text>
              ) : null}
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>OTP Code</Text>
              <TextInput
                style={[
                  styles.formInput,
                  manualFieldErrors.otpCode && styles.formInputError,
                ]}
                value={manualOtpCode}
                onChangeText={text => {
                  setManualOtpCode(cleanManualOtpInput(text));
                  clearManualFieldError('otpCode');
                }}
                placeholder="Enter OTP code"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                autoCorrect={false}
                maxLength={OTP_MAX_LENGTH}
              />
              {manualFieldErrors.otpCode ? (
                <Text style={styles.formFieldError}>
                  {manualFieldErrors.otpCode}
                </Text>
              ) : null}
            </View>

            {manualScheduleError ? (
              <Text style={styles.formError}>{manualScheduleError}</Text>
            ) : null}

            <View style={styles.formActions}>
              <Pressable
                onPress={closeManualDeliveryModal}
                style={[styles.formActionButton, styles.formCancelButton]}
                disabled={isCreatingManualDeliverySchedule}
              >
                <Text style={styles.formCancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={submitManualDeliverySchedule}
                style={[
                  styles.formActionButton,
                  styles.formSubmitButton,
                  isCreatingManualDeliverySchedule &&
                    styles.formSubmitButtonDisabled,
                ]}
                disabled={isCreatingManualDeliverySchedule}
              >
                {isCreatingManualDeliverySchedule ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.formSubmitButtonText}>Create</Text>
                )}
              </Pressable>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={isManualDeliverySuccessVisible}
        onRequestClose={closeManualDeliverySuccess}
      >
        <View style={styles.simpleModalOverlay}>
          <View style={styles.simpleModalCard}>
            <View style={styles.simpleModalIconWrap}>
              <CheckmarkCircleSvg width={32} height={32} />
            </View>

            <Text style={styles.simpleModalTitle}>Delivery Scheduled</Text>
            <Text style={styles.simpleModalBody}>
              Your manual delivery has been added to Upcoming Deliveries.
            </Text>

            <Pressable
              onPress={closeManualDeliverySuccess}
              style={styles.manualSuccessButton}
            >
              <Text style={styles.manualSuccessButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={isSimpleModePopupVisible}
        onRequestClose={closeSimpleModePopup}
      >
        <View style={styles.simpleModalOverlay}>
          <View style={styles.simpleModalCard}>
            <Pressable
              onPress={closeSimpleModePopup}
              style={styles.simpleModalClose}
              hitSlop={8}
            >
              <Text style={styles.simpleModalCloseText}>×</Text>
            </Pressable>

            <View style={styles.simpleModalIconWrap}>
              <BlueBell width={28} height={28} />
            </View>

            <Text style={styles.simpleModalTitle}>{simpleModeCopy.title}</Text>
            <Text style={styles.simpleModalBody}>{simpleModeCopy.message}</Text>

            <Pressable
              onPress={closeSimpleModePopup}
              style={styles.simpleModalButton}
            >
              <Text style={styles.simpleModalButtonText}>
                {simpleModeCopy.close}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function formatHomeTime(value?: string) {
  if (!value) return 'Recently';

  try {
    const date = new Date(value);
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Recently';
  }
}
