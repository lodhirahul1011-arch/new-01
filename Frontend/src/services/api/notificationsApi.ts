import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

export type NotificationPreferences = {
  doorbellAlerts: boolean;
  deliveryNotifications: boolean;
  visitorRecognition: boolean;
  securityAlerts: boolean;
  deviceStatus: boolean;
  weeklySummary: boolean;
  sound: string;
  vibration: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  doorbellAlerts: true,
  deliveryNotifications: true,
  visitorRecognition: true,
  securityAlerts: true,
  deviceStatus: false,
  weeklySummary: true,
  sound: 'default',
  vibration: true,
};

export type RegisterPushTokenPayload = {
  token: string;
  platform: 'android' | 'ios';
};

type NotificationPreferencesEnvelope =
  | {
      ok?: boolean;
      data?:
        | Partial<NotificationPreferences>
        | {
            settings?: Partial<NotificationPreferences> | null;
          }
        | null;
      preferences?: Partial<NotificationPreferences> | null;
    }
  | Partial<NotificationPreferences>
  | null
  | undefined;

function normalizeNotificationPreferences(
  response?: NotificationPreferencesEnvelope,
): NotificationPreferences {
  const envelope =
    (response &&
    typeof response === 'object' &&
    !Array.isArray(response) &&
    ('data' in response || 'preferences' in response)
      ? response
      : null);

  const raw =
    envelope && typeof envelope.data === 'object' && envelope.data && 'settings' in envelope.data
      ? envelope.data.settings
      : envelope?.data ?? envelope?.preferences ?? response ?? {};

  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(raw as Partial<NotificationPreferences>),
  };
}

export const notificationsApi = createApi({
  reducerPath: 'notificationsApi',
  baseQuery: baseQueryWithReauth,
  endpoints: builder => ({
    getNotificationPreferences: builder.query<NotificationPreferences, void>({
      query: () => ({
        url: '/api/v1/settings/notifications',
        method: 'GET',
      }),
      transformResponse: response =>
        normalizeNotificationPreferences(response as NotificationPreferencesEnvelope),
    }),

    updateNotificationPreferences: builder.mutation<
      NotificationPreferences,
      Partial<NotificationPreferences>
    >({
      query: body => ({
        url: '/api/v1/settings/notifications',
        method: 'PUT',
        body,
      }),
      transformResponse: response =>
        normalizeNotificationPreferences(response as NotificationPreferencesEnvelope),
    }),

    registerPushToken: builder.mutation<
      { ok: boolean; data?: { count?: number } },
      RegisterPushTokenPayload
    >({
      query: body => ({
        url: '/api/v1/users/me/fcm-token',
        method: 'POST',
        body,
      }),
    }),

    unregisterPushToken: builder.mutation<
      { ok: boolean; data?: { count?: number } },
      { token?: string | null }
    >({
      query: body => ({
        url: '/api/v1/users/me/fcm-token',
        method: 'DELETE',
        body,
      }),
    }),
  }),
});

export const {
  useGetNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
  useRegisterPushTokenMutation,
  useUnregisterPushTokenMutation,
} = notificationsApi;
