import { useMemo } from 'react';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { API_BASE_URL } from '../config/env';
import { logs } from '../services/logs';

let axiosInstance: AxiosInstance | null = null;

function delay(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(() => resolve(), ms);
  });
}

function isRetryableError(error: AxiosError): boolean {
  const method = error.config?.method?.toLowerCase();
  const status = error.response?.status;

  if (method !== 'get') {
    return false;
  }

  if (error.code === 'ECONNABORTED' || error.message?.toLowerCase().includes('timeout')) {
    return true;
  }

  if (!status) {
    return true;
  }

  return status >= 500;
}

function getFriendlyApiError(error: AxiosError): string {
  const status = error.response?.status;
  const message = String(error.message || '').toLowerCase();

  if (error.code === 'ECONNABORTED' || message.includes('timeout')) {
    return 'Delivery service is taking longer than usual. Please try again.';
  }

  if (message.includes('network error') || !status) {
    return 'Network issue while loading delivery data. Please check your connection.';
  }

  if (status === 401) {
    return 'Your session expired. Please sign in again.';
  }

  if (status === 404) {
    return 'Requested delivery data was not found.';
  }

  if (status && status >= 500) {
    return 'Delivery service is temporarily unavailable. Please try again shortly.';
  }

  return 'Unable to load delivery data right now.';
}

/**
 * Create axios instance with auth interceptors
 */
function createApiClient(accessToken: string | null): AxiosInstance {
  const instance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Add authorization header
  instance.interceptors.request.use(config => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  });

  // Handle errors
  instance.interceptors.response.use(
    response => response,
    async (error: AxiosError) => {
      const requestConfig = error.config as (typeof error.config & {
        __retryCount?: number;
      }) | undefined;

      if (requestConfig && isRetryableError(error)) {
        requestConfig.__retryCount = requestConfig.__retryCount || 0;

        if (requestConfig.__retryCount < 1) {
          requestConfig.__retryCount += 1;
          await delay(700);
          return instance(requestConfig);
        }
      }

      const friendlyMessage = getFriendlyApiError(error);
      logs.error('[API Client] Error', friendlyMessage);
      return Promise.reject(new Error(friendlyMessage));
    }
  );

  return instance;
}

/**
 * Hook to get authenticated axios instance
 */
export function useApiClient(): AxiosInstance {
  const accessToken = useSelector((state: RootState) => state.auth?.accessToken);

  const client = useMemo(() => createApiClient(accessToken), [accessToken]);
  axiosInstance = client;

  return client;
}

/**
 * Get singleton instance (for non-component contexts)
 */
export function getApiClient(): AxiosInstance {
  return axiosInstance || createApiClient(null);
}
