import { authApi } from './authApi';
import type {
  TabletLiveFeedSession,
  TabletSignalPayload,
} from '../../features/liveFeed/types';

type ApiEnvelope<T> = {
  ok: boolean;
  message?: string;
  data: T;
};

export const liveFeedApi = authApi.injectEndpoints({
  endpoints: builder => ({
    startLiveFeedSession: builder.mutation<TabletLiveFeedSession, void>({
      query: () => ({
        url: '/api/v1/tablet/live-feed/session',
        method: 'POST',
      }),
      transformResponse: (resp: ApiEnvelope<TabletLiveFeedSession>) => resp.data,
    }),

    getLiveFeedSession: builder.query<TabletLiveFeedSession, void>({
      query: () => ({
        url: '/api/v1/tablet/live-feed/session',
        method: 'GET',
      }),
      transformResponse: (resp: ApiEnvelope<TabletLiveFeedSession>) => resp.data,
      providesTags: ['Devices'],
    }),

    sendLiveFeedSignal: builder.mutation<
      { ok: boolean },
      { callId: string; body: TabletSignalPayload }
    >({
      query: ({ callId, body }) => ({
        url: `/api/v1/tablet/calls/${encodeURIComponent(callId)}/signal`,
        method: 'POST',
        body,
      }),
    }),

    endLiveFeedSession: builder.mutation<
      { ok: boolean },
      { callId: string; reason?: string }
    >({
      query: ({ callId, reason }) => ({
        url: `/api/v1/tablet/calls/${encodeURIComponent(callId)}/end`,
        method: 'POST',
        body: {
          reason: reason || 'mobile_live_feed_closed',
        },
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useStartLiveFeedSessionMutation,
  useLazyGetLiveFeedSessionQuery,
  useSendLiveFeedSignalMutation,
  useEndLiveFeedSessionMutation,
} = liveFeedApi;
