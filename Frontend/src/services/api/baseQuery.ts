import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from '@reduxjs/toolkit/query';
import { API_BASE_URL } from '../../config/env';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
} from '../storage/tokenStorage';
import { authActions } from '../../store/slices/authSlice';
import { logs } from '../logs';

type RefreshOutcome =
  | { kind: 'success'; accessToken: string; refreshToken: string }
  | { kind: 'invalid' }
  | { kind: 'transient'; error: FetchBaseQueryError };

let refreshInFlight: Promise<RefreshOutcome> | null = null;
let lastRefreshFailureAt = 0;
const REFRESH_FAILURE_COOLDOWN_MS = 20000;

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: async headers => {
    const token = await getAccessToken();

    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return headers;
  },
  responseHandler: async response => {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      const status = response.status;
      logs.error('[api] non-JSON server response blocked from the UI', {
        status,
        contentType: response.headers.get('content-type') || '',
        error: String(error),
      });

      if (status === 413) {
        logs.info('[api] oversized payload response normalized', { status });
        return {
          ok: false,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'The selected file is too large. Please choose a smaller file.',
        };
      }

      logs.info('[api] generic server response selected', { status });
      return {
        ok: false,
        code: 'INVALID_SERVER_RESPONSE',
        message: 'Something went wrong. Please try again.',
      };
    }
  },
});

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    const refreshToken = await getRefreshToken();

    if (!refreshToken) {
      logs.info('[api] auth refresh skipped because refresh token is missing');
      await clearTokens();
      api.dispatch(authActions.signedOut());
      return result;
    }

    if (Date.now() - lastRefreshFailureAt < REFRESH_FAILURE_COOLDOWN_MS) {
      logs.info('[api] auth refresh skipped during transient failure cooldown');
      return {
        error: {
          status: 'CUSTOM_ERROR',
          error: 'AUTH_REFRESH_COOLDOWN',
        },
      };
    }

    if (!refreshInFlight) {
      refreshInFlight = (async (): Promise<RefreshOutcome> => {
        logs.info('[api] auth refresh started');
        const refreshResult = await rawBaseQuery(
          {
            url: '/api/v1/auth/refresh',
            method: 'POST',
            body: { refreshToken },
          },
          api,
          extraOptions,
        );

        if (refreshResult.error) {
          const status = refreshResult.error.status;
          if (status === 401 || status === 403) {
            logs.error('[api] auth refresh rejected by server', { status });
            return { kind: 'invalid' };
          }
          lastRefreshFailureAt = Date.now();
          logs.error('[api] auth refresh failed transiently', {
            status,
            error: refreshResult.error,
          });
          return { kind: 'transient', error: refreshResult.error };
        }

        const accessToken = (refreshResult.data as any)?.accessToken as
          | string
          | undefined;
        if (!accessToken) {
          lastRefreshFailureAt = Date.now();
          logs.error('[api] auth refresh response missing access token');
          return {
            kind: 'transient',
            error: {
              status: 'CUSTOM_ERROR',
              error: 'AUTH_REFRESH_RESPONSE_INVALID',
            },
          };
        }
        const nextRefresh =
          ((refreshResult.data as any)?.refreshToken as string | undefined) ??
          refreshToken;
        logs.info('[api] auth refresh completed');
        return { kind: 'success', accessToken, refreshToken: nextRefresh };
      })().finally(() => {
        refreshInFlight = null;
      });
    }

    const refreshPromise = refreshInFlight;
    const refreshOutcome = await refreshPromise;
    if (refreshOutcome.kind === 'success') {
      await setTokens(refreshOutcome.accessToken, refreshOutcome.refreshToken);
      api.dispatch(
        authActions.tokensUpdated({
          accessToken: refreshOutcome.accessToken,
          refreshToken: refreshOutcome.refreshToken,
        }),
      );
      result = await rawBaseQuery(args, api, extraOptions);
    } else if (refreshOutcome.kind === 'transient') {
      return { error: refreshOutcome.error };
    } else {
      logs.info('[api] signing out after invalid refresh token');
      await clearTokens();
      api.dispatch(authActions.signedOut());
    }
  }

  return result;
};
