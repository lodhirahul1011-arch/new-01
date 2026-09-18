import { authApi } from './authApi';
import type {
  TabletIceCandidate,
  TabletSignalPayload,
} from '../../features/liveFeed/types';

type ApiEnvelope<T> = {
  ok: boolean;
  message?: string;
  data: T;
};

export type TabletCallDetail = {
  id: string;
  type: 'doorbell' | 'delivery' | 'visitor' | 'guest' | 'live_feed' | string;
  state: 'ringing' | 'calling' | 'connecting' | 'answered' | 'paused' | 'declined' | 'ended' | 'missed' | 'failed' | string;
  ringCount?: number;
  autoStartThreshold?: number;
  liveVideoRequested?: boolean;
  note?: string;
  callStartedAt?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  endReason?: string;
  updatedAt?: string;
};

export type TabletCallSignaling = {
  callId: string;
  type: string;
  state: string;
  offerSdp: string;
  answerSdp: string;
  offerCreatedAt?: string | null;
  answerCreatedAt?: string | null;
  iceCandidates: TabletIceCandidate[];
  updatedAt?: string;
};

export const tabletCallsApi = authApi.injectEndpoints({
  endpoints: builder => ({
    getTabletCall: builder.query<TabletCallDetail, { callId: string }>({
      query: ({ callId }) => ({
        url: `/api/v1/tablet/calls/${encodeURIComponent(callId)}`,
        method: 'GET',
      }),
      transformResponse: (resp: ApiEnvelope<TabletCallDetail>) => resp.data,
    }),

    getTabletCallSignaling: builder.query<
      TabletCallSignaling,
      { callId: string }
    >({
      query: ({ callId }) => ({
        url: `/api/v1/tablet/calls/${encodeURIComponent(callId)}/signaling`,
        method: 'GET',
      }),
      transformResponse: (resp: ApiEnvelope<TabletCallSignaling>) => resp.data,
    }),

    sendTabletCallSignal: builder.mutation<
      TabletCallDetail,
      { callId: string; body: TabletSignalPayload }
    >({
      query: ({ callId, body }) => ({
        url: `/api/v1/tablet/calls/${encodeURIComponent(callId)}/signal`,
        method: 'POST',
        body,
      }),
      transformResponse: (resp: ApiEnvelope<TabletCallDetail>) => resp.data,
    }),

    answerTabletCall: builder.mutation<
      TabletCallDetail,
      { callId: string; liveVideoRequested?: boolean }
    >({
      query: ({ callId, liveVideoRequested = false }) => ({
        url: `/api/v1/tablet/calls/${encodeURIComponent(callId)}/answer`,
        method: 'POST',
        body: { liveVideoRequested },
      }),
      transformResponse: (resp: ApiEnvelope<TabletCallDetail>) => resp.data,
    }),

    rejectTabletCall: builder.mutation<
      TabletCallDetail,
      { callId: string; reason?: string }
    >({
      query: ({ callId, reason }) => ({
        url: `/api/v1/tablet/calls/${encodeURIComponent(callId)}/reject`,
        method: 'POST',
        body: { reason: reason || 'rejected_by_resident' },
      }),
      transformResponse: (resp: ApiEnvelope<TabletCallDetail>) => resp.data,
    }),

    endTabletCall: builder.mutation<
      TabletCallDetail,
      { callId: string; reason?: string }
    >({
      query: ({ callId, reason }) => ({
        url: `/api/v1/tablet/calls/${encodeURIComponent(callId)}/end`,
        method: 'POST',
        body: { reason: reason || 'ended_by_resident' },
      }),
      transformResponse: (resp: ApiEnvelope<TabletCallDetail>) => resp.data,
    }),
  }),
  overrideExisting: false,
});

export const {
  useLazyGetTabletCallQuery,
  useLazyGetTabletCallSignalingQuery,
  useSendTabletCallSignalMutation,
  useAnswerTabletCallMutation,
  useRejectTabletCallMutation,
  useEndTabletCallMutation,
} = tabletCallsApi;
