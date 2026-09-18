import { authApi } from './authApi';

type ApiEnvelope<T> = {
  ok: boolean;
  message?: string;
  data: T;
};

export type DeliveryRecordingCard = {
  id: string;
  title: string;
  orderId?: string;
  company?: string;
  dateLabel?: string;
  timeLabel?: string;
  status?: 'completed' | 'rejected' | 'pending' | string;
  thumbnailUrl?: string;
  viewUrl?: string;
  downloadUrl?: string;
  shareUrl?: string;
  fileType?: string;
  durationSeconds?: number | null;
  sizeBytes?: number | null;
};

export type DeliveryRecordingsListData = {
  summary: {
    totalRecordings: number;
    totalStorageBytes: number;
    totalStorageLabel: string;
    thisMonth: number;
  };
  filters: {
    status: string;
    search: string;
    days: number | null;
    quickRanges: number[];
  };
  items: DeliveryRecordingCard[];
};

export type DeliveryRecordingDetailData = {
  id: string;
  orderId?: string;
  title?: string;
  company?: string;
  dateLabel?: string;
  timeLabel?: string;
  status?: string;
  verificationCode?: string | null;
  otp?: string | null;
  recordingDetails?: {
    quality?: string;
    durationSeconds?: number | null;
    sizeBytes?: number | null;
    fileType?: string;
    type?: string;
    mimeType?: string;
    recordingSaved?: boolean;
    thumbnailUrl?: string;
    streamUrl?: string;
  };
  actions?: {
    downloadUrl?: string;
    shareUrl?: string;
    backUrl?: string;
  };
};

export type TabletRecordingLinkData = {
  id: string;
  tempUrl?: string;
  mimeType?: string;
  fileName?: string;
  sizeBytes?: number | null;
  durationSeconds?: number | null;
};

export const recordingsApi = authApi.injectEndpoints({
  endpoints: (builder) => ({
    getDeliveryRecordings: builder.query<
      DeliveryRecordingsListData,
      { status?: 'all' | 'completed' | 'rejected' | 'pending'; search?: string; days?: 7 | 15 | 30; page?: number; limit?: number } | void
    >({
      query: (params) => ({
        url: '/api/v1/deliveries/recordings',
        method: 'GET',
        params: {
          status: params?.status ?? 'all',
          search: params?.search ?? '',
          days: params?.days ?? '',
          page: params?.page ?? 1,
          limit: params?.limit ?? 50,
        },
      }),
      transformResponse: (resp: ApiEnvelope<any>) => resp.data,
      providesTags: ['Me'],
    }),

    getDeliveryRecordingDetail: builder.query<DeliveryRecordingDetailData, { deliveryId: string }>({
      query: ({ deliveryId }) => ({
        url: `/api/v1/deliveries/${encodeURIComponent(deliveryId)}/recording/detail`,
        method: 'GET',
      }),
      transformResponse: (resp: ApiEnvelope<any>) => resp.data,
      providesTags: ['Me'],
    }),

    getDeliveryRecordingShare: builder.query<
      { url: string; shareText?: string; whatsappDeepLink?: string; fileType?: string; orderId?: string },
      { deliveryId: string }
    >({
      query: ({ deliveryId }) => ({
        url: `/api/v1/deliveries/${encodeURIComponent(deliveryId)}/recording/share`,
        method: 'GET',
      }),
      transformResponse: (resp: ApiEnvelope<any>) => resp.data,
      providesTags: ['Me'],
    }),

    getTabletRecordingLink: builder.mutation<TabletRecordingLinkData, { recordingId: string; expiresIn?: number }>({
      query: ({ recordingId, expiresIn = 900 }) => ({
        url: `/api/v1/tablet/recordings/${encodeURIComponent(recordingId)}/link`,
        method: 'GET',
        params: { expiresIn },
      }),
      transformResponse: (resp: ApiEnvelope<any>) => resp.data,
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetDeliveryRecordingsQuery,
  useLazyGetDeliveryRecordingsQuery,
  useGetDeliveryRecordingDetailQuery,
  useLazyGetDeliveryRecordingDetailQuery,
  useGetDeliveryRecordingShareQuery,
  useLazyGetDeliveryRecordingShareQuery,
  useGetTabletRecordingLinkMutation,
} = recordingsApi;
