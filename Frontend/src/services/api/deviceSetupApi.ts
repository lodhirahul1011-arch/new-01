import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

export type ClaimedDeviceSetupResponse = {
  ok: boolean;
  message?: string;
  data: {
    tablet?: {
      deviceId: string;
      type: string;
      name: string;
      displayName?: string;
      pairingStatus: string;
      isLinked: boolean;
      linkedHomeId?: string | null;
      onlineStatus?: string;
      lastSeenAt?: string | null;
      onboardingCompleted?: boolean;
    };
    linkResult?: {
      title?: string;
      subtitle?: string;
    };
  };
};

export const deviceSetupApi = createApi({
  reducerPath: 'deviceSetupApi',
  baseQuery: baseQueryWithReauth,
  endpoints: builder => ({
    claimDevicePairing: builder.mutation<
      ClaimedDeviceSetupResponse,
      { qrToken: string; displayName?: string }
    >({
      query: body => ({
        url: '/api/v1/tablet/pairing/claim',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const { useClaimDevicePairingMutation } = deviceSetupApi;
