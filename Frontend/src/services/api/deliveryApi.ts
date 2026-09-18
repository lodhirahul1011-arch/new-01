import {authApi} from './authApi';
import type {ApiResponse, DeliverySchedule, SmsMessage} from './smsDeliveryService';

export const deliveryApi = authApi.injectEndpoints({
  endpoints: builder => ({
    receiveDeliverySms: builder.mutation<
      ApiResponse<{
        smsId: string | null;
        company: string;
        status: string;
        scheduleUpdated: boolean;
        scheduleId?: string | null;
        confidence: number;
        duplicate?: boolean;
        ignored?: boolean;
      }>,
      {smsText: string; senderPhone?: string; messageId?: string}
    >({
      query: body => ({
        url: '/api/v1/sms/receive',
        method: 'POST',
        body,
      }),
    }),

    receiveDeliveryNotification: builder.mutation<
      ApiResponse<{
        eventId: string | null;
        scheduleId: string | null;
        ignored?: boolean;
        duplicate?: boolean;
        confirmationRequired?: boolean;
        delivery?: DeliverySchedule;
      }>,
      {
        hashedNotificationId: string;
        sourcePackage: string;
        notificationPostedAt: string;
        rawTitle?: string;
        rawBody?: string;
        appName?: string;
        category?: string;
        isGroupSummary?: boolean;
        merchantName?: string;
        productTitle?: string;
        courierName?: string;
        orderTrackingId?: string;
        deliveryDate?: string;
        deliveryTimeWindow?: string;
        deliveryStatus?: string;
        needsConfirmation?: boolean;
        confidence?: number;
        timezone?: string;
        keywordMatches?: string[];
        reminderLeadMinutes?: number;
      }
    >({
      query: body => ({
        url: '/api/v1/sms/delivery-notifications',
        method: 'POST',
        body,
      }),
    }),

    getUpcomingSchedules: builder.query<
      ApiResponse<DeliverySchedule[]>,
      {skip?: number; limit?: number} | void
    >({
      query: params => ({
        url: '/api/v1/sms/deliveries/upcoming',
        method: 'GET',
        params: {
          skip: params?.skip ?? 0,
          limit: params?.limit ?? 50,
        },
      }),
    }),

    getDeliveryNotificationConfirmations: builder.query<
      ApiResponse<DeliverySchedule[]>,
      void
    >({
      query: () => ({
        url: '/api/v1/sms/deliveries/needs-confirmation',
        method: 'GET',
      }),
    }),

    getDeliveryScheduleHistory: builder.query<
      ApiResponse<DeliverySchedule[]>,
      {skip?: number; limit?: number} | void
    >({
      query: params => ({
        url: '/api/v1/sms/deliveries/history',
        method: 'GET',
        params: {
          skip: params?.skip ?? 0,
          limit: params?.limit ?? 50,
        },
      }),
    }),

    getDeliveryScheduleDetails: builder.query<
      ApiResponse<DeliverySchedule>,
      {scheduleId: string}
    >({
      query: ({scheduleId}) => ({
        url: `/api/v1/sms/deliveries/${scheduleId}`,
        method: 'GET',
      }),
    }),

    getDeliveryScheduleMessages: builder.query<
      ApiResponse<SmsMessage[]>,
      {scheduleId: string; skip?: number; limit?: number}
    >({
      query: ({scheduleId, skip = 0, limit = 50}) => ({
        url: `/api/v1/sms/deliveries/${scheduleId}/messages`,
        method: 'GET',
        params: {skip, limit},
      }),
    }),

    searchDeliverySchedules: builder.query<
      ApiResponse<DeliverySchedule[]>,
      {referenceId?: string; company?: string; skip?: number; limit?: number}
    >({
      query: ({referenceId, company, skip = 0, limit = 50}) => ({
        url: '/api/v1/sms/deliveries/search',
        method: 'GET',
        params: {referenceId, company, skip, limit},
      }),
    }),

    getDeliveryStats: builder.query<
      ApiResponse<{
        totalSms: number;
        statistics: {
          upcoming: number;
          delivered: number;
          failed: number;
        };
        byCompany: Record<string, number>;
      }>,
      void
    >({
      query: () => ({
        url: '/api/v1/sms/stats',
        method: 'GET',
      }),
    }),

    createManualDeliverySchedule: builder.mutation<
      ApiResponse<DeliverySchedule>,
      {productTitle: string; orderId: string; awbNumber: string; otpCode?: string; idempotencyKey?: string}
    >({
      query: body => ({
        url: '/api/v1/sms/deliveries/manual',
        method: 'POST',
        body,
      }),
    }),

    markDeliveryScheduleDelivered: builder.mutation<
      ApiResponse<DeliverySchedule>,
      {scheduleId: string}
    >({
      query: ({scheduleId}) => ({
        url: `/api/v1/sms/deliveries/${scheduleId}/mark-delivered`,
        method: 'PATCH',
      }),
    }),

    markDeliveryScheduleFailed: builder.mutation<
      ApiResponse<DeliverySchedule>,
      {scheduleId: string; reason?: string}
    >({
      query: ({scheduleId, reason}) => ({
        url: `/api/v1/sms/deliveries/${scheduleId}/mark-failed`,
        method: 'PATCH',
        body: reason ? {reason} : undefined,
      }),
    }),

    updateDeliverySchedule: builder.mutation<
      ApiResponse<DeliverySchedule>,
      {
        scheduleId: string;
        deliveryCompany?: string;
        referenceId?: string;
        orderHint?: string;
        awbNumber?: string;
        expectedDeliveryDate?: string;
        deliveryTimeWindow?: string;
        productSummary?: string;
        sellerName?: string;
        riderName?: string;
        riderPhone?: string;
        reminderLeadMinutes?: number;
      }
    >({
      query: ({scheduleId, ...body}) => ({
        url: `/api/v1/sms/deliveries/${scheduleId}`,
        method: 'PATCH',
        body,
      }),
    }),

    confirmDeliverySchedule: builder.mutation<
      ApiResponse<DeliverySchedule>,
      {
        scheduleId: string;
        expectedDeliveryDate: string;
        deliveryTimeWindow: string;
        reminderLeadMinutes?: number;
      }
    >({
      query: ({scheduleId, ...body}) => ({
        url: `/api/v1/sms/deliveries/${scheduleId}/confirm`,
        method: 'PATCH',
        body,
      }),
    }),

    deleteDeliverySchedule: builder.mutation<
      ApiResponse<{scheduleId: string}>,
      {scheduleId: string}
    >({
      query: ({scheduleId}) => ({
        url: `/api/v1/sms/deliveries/${scheduleId}`,
        method: 'DELETE',
      }),
    }),

    respondDeliveryRequest: builder.mutation<
      ApiResponse<{
        schedule: DeliverySchedule;
        tablet?: { sessionId?: string | null; state?: string | null; otpPreview?: string | null };
      }>,
      {scheduleId: string; decision: 'approved' | 'rejected'; reason?: string}
    >({
      query: ({scheduleId, decision, reason}) => ({
        url: `/api/v1/sms/deliveries/${scheduleId}/respond`,
        method: 'PATCH',
        body: { decision, ...(reason ? { reason } : {}) },
      }),
    }),

    selectDeliveryVerificationMethod: builder.mutation<
      ApiResponse<DeliverySchedule>,
      {scheduleId: string; method: 'nfc_card' | 'approve_in_app' | 'none'}
    >({
      query: ({scheduleId, method}) => ({
        url: `/api/v1/sms/deliveries/${scheduleId}/verification-method`,
        method: 'PATCH',
        body: {method},
      }),
    }),

    rateDeliverySchedule: builder.mutation<
      ApiResponse<DeliverySchedule>,
      {scheduleId: string; score: number; comment?: string}
    >({
      query: ({scheduleId, score, comment}) => ({
        url: `/api/v1/sms/deliveries/${scheduleId}/rating`,
        method: 'PATCH',
        body: {score, ...(comment ? {comment} : {})},
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useLazyGetUpcomingSchedulesQuery,
  useLazyGetDeliveryNotificationConfirmationsQuery,
  useLazyGetDeliveryScheduleHistoryQuery,
  useLazyGetDeliveryScheduleDetailsQuery,
  useLazyGetDeliveryScheduleMessagesQuery,
  useLazySearchDeliverySchedulesQuery,
  useLazyGetDeliveryStatsQuery,
  useReceiveDeliverySmsMutation,
  useReceiveDeliveryNotificationMutation,
  useCreateManualDeliveryScheduleMutation,
  useMarkDeliveryScheduleDeliveredMutation,
  useMarkDeliveryScheduleFailedMutation,
  useUpdateDeliveryScheduleMutation,
  useConfirmDeliveryScheduleMutation,
  useDeleteDeliveryScheduleMutation,
  useRespondDeliveryRequestMutation,
  useSelectDeliveryVerificationMethodMutation,
  useRateDeliveryScheduleMutation,
} = deliveryApi;
