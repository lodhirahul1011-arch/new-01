import { authApi } from './authApi';

export type DeliveryHistoryStatusKey = 'all' | 'delivered' | 'rejected';

export type DeliveryHistorySummary = {
  total: number;
  successful: number;
  delivered: number;
  rejected: number;
};

export type DeliveryHistoryFilterOption = {
  key: string;
  label: string;
};

export type DeliveryHistoryFiltersData = {
  statuses: DeliveryHistoryFilterOption[];
  months: DeliveryHistoryFilterOption[];
  companies: DeliveryHistoryFilterOption[];
};

export type DeliveryHistoryListParams = {
  status?: DeliveryHistoryStatusKey;
  page?: number;
  limit?: number;
  month?: string;
  search?: string;
  memberId?: string;
  company?: string;
};

export type DeliveryHistoryPartner = {
  name: string;
  company: string;
  rating?: number | null;
  roleLabel?: string;
};

export type DeliveryHistoryProof = {
  available: boolean;
  fileName?: string;
  downloadUrl?: string;
  proofUrl?: string;
};

export type DeliveryHistoryRecording = {
  available: boolean;
  type?: 'video' | 'image' | string;
  viewUrl?: string;
  streamUrl?: string;
  recordingUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number | null;
  recordingSaved?: boolean;
};

export type DeliveryHistoryRejection = {
  reason?: string;
} | null;

export type DeliveryHistoryItem = {
  id: string;
  title: string;
  orderId: string;
  company: string;
  partnerName?: string;
  status: 'delivered' | 'rejected' | string;
  statusLabel: string;
  statusColor?: string;
  date: string;
  dateLabel: string;
  timeLabel: string;
  verificationCode?: string;
  proofUrl?: string;
  proof: DeliveryHistoryProof;
  recordingUrl?: string;
  recording: DeliveryHistoryRecording;
  rejection: DeliveryHistoryRejection;
  thumbnailUrl?: string;
  rating?: number | null;
  partner?: DeliveryHistoryPartner;
  detailUrl?: string;
};

export type DeliveryHistoryPagination = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  nextCursor?: string | null;
};

export type DeliveryHistoryListData = {
  summary: DeliveryHistorySummary;
  filters: {
    selectedStatus: string;
    selectedMonth: string;
    selectedSearch: string;
    selectedMemberId: string;
    selectedCompany: string;
  };
  items: DeliveryHistoryItem[];
  pagination: DeliveryHistoryPagination;
  nextCursor?: string | null;
};

export type DeliveryHistoryDetail = {
  id: string;
  title: string;
  orderId: string;
  status: string;
  statusLabel: string;
  statusColor?: string;
  date: string;
  dateLabel: string;
  timeLabel: string;
  verificationCode?: string;
  partner?: DeliveryHistoryPartner;
  proof: DeliveryHistoryProof;
  recording: DeliveryHistoryRecording;
  rejection: DeliveryHistoryRejection;
  timeline?: Array<{
    key: string;
    label: string;
    at: string;
  }>;
};

type ApiEnvelope<T> = {
  ok: boolean;
  message: string;
  data: T;
};

type RawHistoryItem = {
  _id?: string;
  id?: string;
  detailUrl?: string;

  title?: string;
  orderId?: string;
  company?: string;
  partnerName?: string;

  status?: string;
  statusLabel?: string;
  statusColor?: string;

  date?: string;
  dateLabel?: string;
  timeLabel?: string;

  verificationCode?: string;

  proofUrl?: string;
  proof?: DeliveryHistoryProof;

  recordingUrl?: string;
  recording?: DeliveryHistoryRecording;

  rejection?: DeliveryHistoryRejection;
  thumbnailUrl?: string;
  rating?: number | null;
  partner?: DeliveryHistoryPartner;

  // fallback fields from DB/backend real shape
  packageImageUrl?: string;
  recordingThumbnailUrl?: string;
  partnerRating?: number | null;
  rejectionReason?: string;
  deliveredAt?: string;
  createdAt?: string;
};

function formatDateLabel(dateString?: string) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeLabel(dateString?: string) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
function mapHistoryItem(item: RawHistoryItem): DeliveryHistoryItem {
  const id = item.id || item._id || '';
  const effectiveDate = item.date || item.deliveredAt || item.createdAt || '';

  const status = item.status || 'delivered';
  const statusLabel =
    item.statusLabel ||
    (status === 'rejected' ? 'Rejected' : 'Delivered');

  const statusColor =
    item.statusColor ||
    (status === 'rejected' ? 'red' : 'green');

  const thumbnailUrl =
    item.thumbnailUrl ||
    item.packageImageUrl ||
    item.recordingThumbnailUrl;

  const rating =
    item.rating ??
    item.partnerRating ??
    item.partner?.rating ??
    null;

  const rejection =
    item.rejection ??
    (item.rejectionReason
      ? { reason: item.rejectionReason }
      : null);

  return {
    id,
    title: item.title || 'Delivery Item',
    orderId: item.orderId || '',
    company: item.company || '',
    partnerName: item.partnerName || '',
    status,
    statusLabel,
    statusColor,
    date: effectiveDate,
    dateLabel: item.dateLabel || formatDateLabel(effectiveDate),
    timeLabel: item.timeLabel || formatTimeLabel(effectiveDate),
    verificationCode: item.verificationCode,
    proofUrl: item.proofUrl,
    proof: item.proof ?? {
      available: !!item.proofUrl,
      proofUrl: item.proofUrl,
      downloadUrl: item.proofUrl,
    },
    recordingUrl: item.recordingUrl,
    recording: item.recording ?? {
      available: !!item.recordingUrl,
      recordingUrl: item.recordingUrl,
      thumbnailUrl: item.recordingThumbnailUrl,
    },
    rejection,
    thumbnailUrl,
    rating,
    partner: item.partner ?? {
      name: item.partnerName || '',
      company: item.company || '',
      rating,
      roleLabel: 'Delivery',
    },
    detailUrl: item.detailUrl,
  };
}

export const deliveryHistoryApi = authApi.injectEndpoints({
  endpoints: builder => ({
    getDeliveryHistorySummary: builder.query<
      DeliveryHistorySummary,
      { month?: string } | void
    >({
      query: params => ({
        url: '/api/v1/deliveries/history/summary',
        method: 'GET',
        params: params?.month ? { month: params.month } : undefined,
      }),
      transformResponse: (response: ApiEnvelope<DeliveryHistorySummary>) =>
        response.data,
      providesTags: ['Me'],
    }),

    getDeliveryHistoryFilters: builder.query<
      DeliveryHistoryFiltersData,
      { limitMonths?: number } | void
    >({
      query: params => ({
        url: '/api/v1/deliveries/history/filters',
        method: 'GET',
        params: {
          limitMonths: params?.limitMonths ?? 12,
        },
      }),
      transformResponse: (response: ApiEnvelope<DeliveryHistoryFiltersData>) =>
        response.data,
      providesTags: ['Me'],
    }),

    getDeliveryHistoryList: builder.query<
      DeliveryHistoryListData,
      DeliveryHistoryListParams | void
    >({
      query: params => ({
        url: '/api/v1/deliveries/history',
        method: 'GET',
        params: {
          status: params?.status ?? 'all',
          page: params?.page ?? 1,
          limit: params?.limit ?? 10,
          month: params?.month ?? '',
          search: params?.search ?? '',
          memberId: params?.memberId ?? '',
          company: params?.company ?? '',
        },
      }),
      transformResponse: (response: ApiEnvelope<any>) => {
  const data = response?.data ?? {};
  const rawItems =
    data.items ??
    data.deliveries ??
    data.records ??
    [];

  return {
    summary: data.summary ?? {
      total: 0,
      successful: 0,
      delivered: 0,
      rejected: 0,
    },
    filters: data.filters ?? {
      selectedStatus: 'all',
      selectedMonth: '',
      selectedSearch: '',
      selectedMemberId: '',
      selectedCompany: '',
    },
    items: Array.isArray(rawItems) ? rawItems.map(mapHistoryItem) : [],
    pagination: data.pagination ?? {
      page: 1,
      limit: 10,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      nextCursor: null,
    },
    nextCursor: data.nextCursor ?? null,
  };
},
      providesTags: ['Me'],
    }),

    getDeliveryHistoryDetail: builder.query<
      DeliveryHistoryDetail,
      { id: string }
    >({
      query: ({ id }) => ({
        url: `/api/v1/deliveries/history/${id}`,
        method: 'GET',
      }),
      transformResponse: (response: ApiEnvelope<any>) => {
        const data = response.data;
        return {
          id: data.id || data._id || '',
          title: data.title,
          orderId: data.orderId,
          status: data.status,
          statusLabel: data.statusLabel,
          statusColor: data.statusColor,
          date: data.date,
          dateLabel: data.dateLabel,
          timeLabel: data.timeLabel,
          verificationCode: data.verificationCode,
          partner: data.partner,
          proof: data.proof ?? { available: false },
          recording: data.recording ?? { available: false },
          rejection: data.rejection ?? null,
          timeline: data.timeline ?? [],
        };
      },
      providesTags: ['Me'],
    }),

    getDeliveryProofMetadata: builder.query<
      DeliveryHistoryProof & {
        id: string;
        title?: string;
        orderId?: string;
        verificationCode?: string;
        status?: string;
        generatedAt?: string;
        partnerName?: string;
        paymentStatus?: string;
      },
      { id: string }
    >({
      query: ({ id }) => ({
        url: `/api/v1/deliveries/${id}/proof`,
        method: 'GET',
      }),
      transformResponse: (response: ApiEnvelope<any>) => response.data,
      providesTags: ['Me'],
    }),

    getDeliveryRecordingMetadata: builder.query<
      DeliveryHistoryRecording & {
        id: string;
      },
      { id: string }
    >({
      query: ({ id }) => ({
        url: `/api/v1/deliveries/${id}/recording`,
        method: 'GET',
      }),
      transformResponse: (response: ApiEnvelope<any>) => response.data,
      providesTags: ['Me'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetDeliveryHistorySummaryQuery,
  useLazyGetDeliveryHistorySummaryQuery,
  useGetDeliveryHistoryFiltersQuery,
  useLazyGetDeliveryHistoryFiltersQuery,
  useGetDeliveryHistoryListQuery,
  useLazyGetDeliveryHistoryListQuery,
  useGetDeliveryHistoryDetailQuery,
  useLazyGetDeliveryHistoryDetailQuery,
  useGetDeliveryProofMetadataQuery,
  useLazyGetDeliveryProofMetadataQuery,
  useGetDeliveryRecordingMetadataQuery,
  useLazyGetDeliveryRecordingMetadataQuery,
} = deliveryHistoryApi;
