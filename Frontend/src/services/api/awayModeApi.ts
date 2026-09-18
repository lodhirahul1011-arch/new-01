import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

export type AwayModeOverview = {
  enabled: boolean;
  modeStatus?: string;
  statusLabel?: string;
  activeUntilLabel?: string;
};

export const awayModeApi = createApi({
  reducerPath: 'awayModeApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['AwayMode'],
  endpoints: builder => ({
    getAwayModeOverview: builder.query<{ ok: boolean; data: AwayModeOverview }, void>({
      query: () => ({ url: '/api/v1/away-mode/overview', method: 'GET' }),
      providesTags: ['AwayMode'],
    }),

    toggleAwayMode: builder.mutation<
      { ok: boolean; data: { enabled: boolean; modeStatus?: string } },
      { enabled: boolean }
    >({
      query: body => ({
        url: '/api/v1/away-mode/toggle',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['AwayMode'],
    }),
  }),
});

export const {
  useGetAwayModeOverviewQuery,
  useToggleAwayModeMutation,
} = awayModeApi;
