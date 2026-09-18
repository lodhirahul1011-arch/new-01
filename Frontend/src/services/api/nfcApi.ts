import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

export type NfcCardStatus = 'active' | 'inactive' | 'blocked' | 'removed';
export type NfcCardType = 'access' | 'delivery' | 'member';

export type NfcOverviewCard = {
  _id: string;
  label: string;
  serialMasked: string;
  uidPreview: string;
  status: NfcCardStatus;
  statusLabel: string;
  addedOn?: string;
  addedOnLabel: string;
  lastUsedAt?: string | null;
  lastUsedLabel: string;
  totalAccessCount: number;
  canRemove: boolean;
};

export type NfcCardsOverview = {
  singleCardLimit: boolean;
  canAddNew: boolean;
  warning: {
    title: string;
    message: string;
  };
  registeredCard: NfcOverviewCard | null;
};

export type NfcCardsListResponse = {
  items: NfcOverviewCard[];
  summary: {
    total: number;
    active: number;
    inactive: number;
    blocked: number;
    removed: number;
  };
};

export type CreateNfcCardPayload = {
  label: string;
  uid: string;
  assignedToMemberId?: string | null;
  cardType?: NfcCardType;
  meta?: {
    source?: string;
    registrationMethod?: string;
    deviceId?: string | null;
    notes?: string;
  };
};

export type UpdateNfcCardPayload = {
  cardId: string;
  label?: string;
  assignedToMemberId?: string | null;
  cardType?: NfcCardType;
  status?: Extract<NfcCardStatus, 'active' | 'inactive' | 'blocked'>;
  meta?: {
    notes?: string;
  };
};

export type VerifyNfcAccessPayload = {
  uid: string;
  flow?: 'delivery_access' | 'member_access' | 'settings_test';
  deliveryId?: string | null;
  deviceId?: string | null;
  authorizationId?: string | null;
};

export type NfcAccessLogItem = {
  _id: string;
  result: string;
  flow: string;
  scannedAt: string;
  scannedAtLabel: string;
  deviceId?: string | null;
  reasonCode?: string;
};

export type NfcAccessLogsResponse = {
  items: NfcAccessLogItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
  };
};

type ApiEnvelope<T> = {
  ok: boolean;
  message?: string;
  data: T;
};

export const nfcApi = createApi({
  reducerPath: 'nfcApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['NfcCards'],
  endpoints: builder => ({
    nfcCardsOverview: builder.query<ApiEnvelope<NfcCardsOverview>, void>({
      query: () => ({ url: '/api/v1/nfc/cards/overview', method: 'GET' }),
      providesTags: ['NfcCards'],
    }),

    nfcCards: builder.query<ApiEnvelope<NfcCardsListResponse>, void>({
      query: () => ({ url: '/api/v1/nfc/cards', method: 'GET' }),
      providesTags: ['NfcCards'],
    }),

    registerNfcCard: builder.mutation<ApiEnvelope<NfcOverviewCard>, CreateNfcCardPayload>({
      query: body => ({
        url: '/api/v1/nfc/cards',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['NfcCards'],
    }),

    updateNfcCard: builder.mutation<ApiEnvelope<NfcOverviewCard>, UpdateNfcCardPayload>({
      query: ({ cardId, ...body }) => ({
        url: `/api/v1/nfc/cards/${cardId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['NfcCards'],
    }),

    removeNfcCard: builder.mutation<
      ApiEnvelope<{ _id: string; status: NfcCardStatus }>,
      { cardId: string }
    >({
      query: ({ cardId }) => ({
        url: `/api/v1/nfc/cards/${cardId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['NfcCards'],
    }),

    verifyNfcAccess: builder.mutation<
      ApiEnvelope<{
        authorized: boolean;
        card: {
          _id: string;
          label: string;
          uidPreview: string;
        };
        usage: {
          lastUsedAt: string;
          totalAccessCount: number;
        };
        nextStep: string;
      }>,
      VerifyNfcAccessPayload
    >({
      query: body => ({
        url: '/api/v1/nfc/verify-access',
        method: 'POST',
        body,
      }),
    }),

    nfcAccessLogs: builder.query<ApiEnvelope<NfcAccessLogsResponse>, { page?: number; limit?: number }>({
      query: params => ({
        url: '/api/v1/nfc/access-logs',
        method: 'GET',
        params,
      }),
      providesTags: ['NfcCards'],
    }),
  }),
});

export const {
  useNfcCardsOverviewQuery,
  useNfcCardsQuery,
  useRegisterNfcCardMutation,
  useUpdateNfcCardMutation,
  useRemoveNfcCardMutation,
  useVerifyNfcAccessMutation,
  useNfcAccessLogsQuery,
} = nfcApi;
