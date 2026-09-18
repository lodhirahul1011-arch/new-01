import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';
import { logs } from '../logs';

export type AuthUser = {
  id?: string;
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  phoneVerified?: boolean;
  verified: boolean;
  isVerified?: boolean;
  emailVerified?: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  otpVerified?: boolean;
  address?: string;
  dateOfBirth?: string;
  gender?: string;
  googleSub?: string;
  /** Banner behind the avatar on the profile screen. */
  coverImage?: { url?: string };
  profileImage?: string;
  photoUrl?: string;
  avatarUrl?: string;
  avatar?: {
    url?: string;
    filename?: string;
    mime?: string;
    size?: number;
    updatedAt?: string;
  };
};

export type LinkedDeviceItem = {
  deviceId: string;
  name: string;
  type: 'box' | 'device' | 'display' | string;
  status: 'online' | 'offline' | string;
  statusLabel?: string;
  lastSeenAt?: string | null;
  wallpaperPreset?: string;
  wallpaperUrl?: string;
  customWallpaperUrl?: string;
  settings?: {
    wallpaperUrl?: string;
    wallpaperPreset?: string;
    customWallpaperUrl?: string;
    [key: string]: unknown;
  };
};

export type WallpaperOption = {
  key: string;
  label: string;
  imageUrl: string;
};

export type LinkedDevicesSummary = {
  summary: {
    total: number;
    online: number;
    offline: number;
  };
  items: LinkedDeviceItem[];
};

// Mirrors updateMeSchema on the server, which is `.strict()` — every key sent
// has to be one it lists, so keep the two in step. All optional: the screen
// sends only the fields the user actually edited.
export type UpdateProfilePayload = {
  name?: string;
  address?: string;
  email?: string;
  phone?: string;
  /** YYYY-MM-DD. Not a Date, so a birthday cannot shift across timezones. */
  dateOfBirth?: string;
  gender?: string;
};

export type PatchLinkedDevicePayload = {
  deviceId: string;
  simpleModeEnabled?: boolean;
  onboardingCompleted?: boolean;
  settings?: Record<string, unknown>;
};

type ApiUserEnvelope = {
  ok: boolean;
  user?: AuthUser;
  data?: AuthUser;
  message?: string;
};

type UploadPhotoPayload = {
  uri: string;
  name?: string;
  type?: string;
};

type UploadDeviceWallpaperPayload = UploadPhotoPayload & {
  deviceId: string;
};

function resolveAssetUrl(pathOrUrl?: string) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\/ik\.imagekit\.io\//i.test(pathOrUrl)) return pathOrUrl;
  return '';
}

function resolveVerifiedStatus(user: Partial<AuthUser> & Record<string, unknown>) {
  const truthyFlags = [
    user.verified,
    user.isVerified,
    user.emailVerified,
    user.phoneVerified,
    user.isEmailVerified,
    user.isPhoneVerified,
    user.otpVerified,
    user.email_verified,
    user.phone_verified,
    user.is_verified,
  ];

  return truthyFlags.some(Boolean);
}

function unwrapUserResponse(response: ApiUserEnvelope): {
  ok: boolean;
  user: AuthUser;
  message?: string;
} {
  const user = (response.user ?? response.data ?? {}) as Partial<AuthUser> &
    Record<string, unknown>;
  const avatarUrl = resolveAssetUrl(user.avatar?.url || user.avatarUrl || user.photoUrl || user.profileImage);
  const verified = resolveVerifiedStatus(user);
  const userId =
    typeof user._id === 'string'
      ? user._id
      : typeof user.id === 'string'
        ? user.id
        : '';

  return {
    ok: response.ok,
    user: {
      ...user,
      _id: userId,
      id: typeof user.id === 'string' ? user.id : userId,
      name: typeof user.name === 'string' ? user.name : '',
      verified,
      avatarUrl,
      photoUrl: avatarUrl || user.photoUrl,
      profileImage: avatarUrl || user.profileImage,
    },
    message: response.message,
  };
}

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Me', 'Devices'],
  endpoints: builder => ({
    requestOtp: builder.mutation<
      // debugCode only ever comes back when the backend's
      // OTP_EXPOSE_CODE_IN_RESPONSE dev flag is on (never in production) —
      // lets the app auto-fill the OTP screen during testing instead of
      // requiring a real SMS/email provider.
      {
        ok: boolean;
        message: string;
        isExisting?: boolean;
        otpSessionId?: string;
        debugCode?: string;
      },
      { identifier: string }
    >({
      query: body => ({ url: '/api/v1/auth/request-otp', method: 'POST', body }),
    }),

    googleSignIn: builder.mutation<
      { ok: boolean; accessToken: string; refreshToken: string; user: AuthUser; isNewUser?: boolean },
      { idToken: string }
    >({
      query: body => ({ url: '/api/v1/auth/google', method: 'POST', body }),
      transformResponse: (response: {
        ok: boolean;
        accessToken: string;
        refreshToken: string;
        user?: AuthUser;
        data?: AuthUser;
        isNewUser?: boolean;
      }) => {
        const normalized = unwrapUserResponse(response);
        return {
          ok: response.ok,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          user: normalized.user,
          isNewUser: response.isNewUser,
        };
      },
      invalidatesTags: ['Me'],
    }),

    // Attaching a second identifier to the signed-in account — the email leg of
    // a phone signup, or the phone leg of an email one. These run under
    // requireAuth and do NOT issue tokens: request-otp/verify-otp resolve an
    // account from the identifier and create one when none matches, which for a
    // second identifier means a duplicate account and an orphaned first one.
    requestLinkOtp: builder.mutation<
      {
        ok: boolean;
        message: string;
        isExisting?: boolean;
        otpSessionId?: string;
        debugCode?: string;
      },
      { identifier: string }
    >({
      query: body => ({
        url: '/api/v1/auth/link-identifier/request',
        method: 'POST',
        body,
      }),
    }),

    verifyLinkOtp: builder.mutation<
      { ok: boolean; user: AuthUser },
      { identifier: string; code: string; otpSessionId?: string }
    >({
      query: body => ({
        url: '/api/v1/auth/link-identifier/verify',
        method: 'POST',
        body,
      }),
      transformResponse: (response: ApiUserEnvelope) => unwrapUserResponse(response),
      invalidatesTags: ['Me'],
    }),

    verifyOtp: builder.mutation<
      { ok: boolean; accessToken: string; refreshToken: string; user: AuthUser },
      { identifier: string; code: string; otpSessionId?: string }
      >({
      query: body => ({ url: '/api/v1/auth/verify-otp', method: 'POST', body }),
      transformResponse: (response: {
        ok: boolean;
        accessToken: string;
        refreshToken: string;
        user?: AuthUser;
        data?: AuthUser;
      }) => {
        const normalized = unwrapUserResponse(response);

        return {
          ok: response.ok,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          user: normalized.user,
        };
      },
      invalidatesTags: ['Me'],
    }),

    deviceRegistrationRequestOtp: builder.mutation<
      {
        ok: boolean;
        message: string;
        otpSessionId?: string;
        debugCode?: string;
      },
      { name: string; email: string; phone: string }
    >({
      query: body => ({
        url: '/api/v1/auth/device-registration-request-otp',
        method: 'POST',
        body,
      }),
    }),

    deviceRegistrationVerifyOtp: builder.mutation<
      { ok: boolean; accessToken: string; refreshToken: string; user: AuthUser },
      { identifier: string; code: string }
    >({
      query: body => ({
        url: '/api/v1/auth/device-registration-verify-otp',
        method: 'POST',
        body,
      }),
      transformResponse: (response: {
        ok: boolean;
        accessToken: string;
        refreshToken: string;
        user?: AuthUser;
        data?: AuthUser;
      }) => {
        const normalized = unwrapUserResponse(response);

        return {
          ok: response.ok,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          user: normalized.user,
        };
      },
      invalidatesTags: ['Me'],
    }),

    resendOtp: builder.mutation<
      { ok: boolean; message: string; otpSessionId?: string; debugCode?: string },
      { identifier: string; purpose?: 'login' | 'register' }
    >({
      query: body => ({ url: '/api/v1/auth/resend-otp', method: 'POST', body }),
    }),

    requestWhatsappOtp: builder.mutation<
      { ok: boolean; message: string; otpSessionId?: string },
      { identifier: string; purpose?: 'login' | 'register' | 'link_identifier' }
    >({
      query: body => ({ url: '/api/v1/auth/whatsapp-otp', method: 'POST', body }),
    }),

    logout: builder.mutation<{ ok: boolean }, { fcmToken?: string | null } | void>({
      query: body => ({
        url: '/api/v1/auth/logout-all',
        method: 'POST',
        body: body ?? {},
      }),
    }),

    deleteAccount: builder.mutation<
      { ok: boolean; message?: string },
      { deletionReason: string }
    >({
      query: body => ({
        url: '/api/v1/users/account',
        method: 'DELETE',
        body,
      }),
      async onQueryStarted(body, { queryFulfilled }) {
        logs.info('[authApi] delete account request started', {
          hasDeletionReason: Boolean(body.deletionReason.trim()),
        });
        try {
          await queryFulfilled;
          logs.info('[authApi] delete account request completed');
        } catch (error) {
          logs.error('[authApi] delete account request failed', { error });
        }
      },
      invalidatesTags: ['Me', 'Devices'],
    }),

    me: builder.query<{ ok: boolean; user: AuthUser }, void>({
      query: () => ({ url: '/api/v1/auth/me', method: 'GET' }),
      transformResponse: (response: ApiUserEnvelope) => unwrapUserResponse(response),
      providesTags: ['Me'],
    }),

    usersMe: builder.query<{ ok: boolean; user: AuthUser }, void>({
      query: () => ({ url: '/api/v1/users/me', method: 'GET' }),
      transformResponse: (response: ApiUserEnvelope) => unwrapUserResponse(response),
      providesTags: ['Me'],
    }),

    updateProfile: builder.mutation<
      { ok: boolean; user: AuthUser; message?: string },
      UpdateProfilePayload
    >({
      query: body => ({
        url: '/api/v1/users/me',
        method: 'PATCH',
        body,
      }),
      transformResponse: (response: ApiUserEnvelope) => unwrapUserResponse(response),
      invalidatesTags: ['Me'],
    }),

    uploadProfilePhoto: builder.mutation<
      { ok: boolean; user: AuthUser; message?: string },
      UploadPhotoPayload
    >({
      query: ({uri, name, type}) => {
        const formData = new FormData();

        formData.append('photo', {
          uri,
          name: name ?? 'profile-photo.jpg',
          type: type ?? 'image/jpeg',
        } as unknown as Blob);

        return {
          url: '/api/v1/users/me/photo',
          method: 'PUT',
          body: formData,
        };
      },
      transformResponse: (response: ApiUserEnvelope) => unwrapUserResponse(response),
      invalidatesTags: ['Me'],
    }),

    // The banner behind the avatar on the profile screen. Same contract as the
    // avatar upload, against PUT /users/me/cover with a `cover` part.
    uploadCoverPhoto: builder.mutation<
      { ok: boolean; user: AuthUser; message?: string },
      UploadPhotoPayload
    >({
      query: ({ uri, name, type }) => {
        const formData = new FormData();

        formData.append('cover', {
          uri,
          name: name ?? 'cover-photo.jpg',
          type: type ?? 'image/jpeg',
        } as unknown as Blob);

        return {
          url: '/api/v1/users/me/cover',
          method: 'PUT',
          body: formData,
        };
      },
      transformResponse: (response: ApiUserEnvelope) => unwrapUserResponse(response),
      invalidatesTags: ['Me'],
    }),

    linkedDevicesSummary: builder.query<
      { ok: boolean; data: LinkedDevicesSummary },
      string | void
    >({
      query: () => ({ url: '/api/v1/devices/linked/summary', method: 'GET' }),
      providesTags: ['Devices'],
    }),

    wallpaperOptions: builder.query<
      { ok: boolean; data: { items: WallpaperOption[]; deviceCount: number } },
      void
    >({
      query: () => ({ url: '/api/v1/devices/wallpapers', method: 'GET' }),
      providesTags: ['Devices'],
    }),

    linkDevice: builder.mutation<
      { ok: boolean; data: LinkedDeviceItem },
      { qrToken: string }
    >({
      query: body => ({
        url: '/api/v1/devices/link',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Devices'],
    }),

    unlinkDevice: builder.mutation<
      { ok: boolean; data: { deviceId: string } },
      { deviceId: string }
    >({
      query: ({ deviceId }) => ({
        url: `/api/v1/devices/${deviceId}/unlink`,
        method: 'POST',
      }),
      invalidatesTags: ['Devices'],
    }),

    patchLinkedDevice: builder.mutation<
      { ok: boolean; data: LinkedDeviceItem },
      PatchLinkedDevicePayload
    >({
      query: ({ deviceId, ...body }) => ({
        url: `/api/v1/devices/${deviceId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Devices'],
    }),

    uploadDeviceWallpaper: builder.mutation<
      { ok: boolean; data: LinkedDeviceItem; message?: string },
      UploadDeviceWallpaperPayload
    >({
      query: ({ deviceId, uri, name, type }) => {
        const formData = new FormData();

        formData.append('wallpaper', {
          uri,
          name: name ?? 'device-wallpaper.jpg',
          type: type ?? 'image/jpeg',
        } as unknown as Blob);

        return {
          url: `/api/v1/devices/${deviceId}/wallpaper/gallery`,
          method: 'POST',
          body: formData,
          timeout: 120000,
        };
      },
      invalidatesTags: ['Devices'],
    }),

    selectDeviceWallpaper: builder.mutation<
      { ok: boolean; data: LinkedDeviceItem; message?: string },
      { deviceId: string; wallpaperKey: string }
    >({
      query: ({ deviceId, wallpaperKey }) => ({
        url: `/api/v1/devices/${deviceId}/wallpaper/select`,
        method: 'PUT',
        body: { wallpaperKey },
      }),
      invalidatesTags: ['Devices'],
    }),

    patchTabletDevice: builder.mutation<
      { ok: boolean; data: LinkedDeviceItem },
      PatchLinkedDevicePayload
    >({
      query: ({ deviceId, ...body }) => ({
        url: `/api/v1/tablet/devices/${deviceId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Devices'],
    }),
  }),
});

export const {
  useRequestOtpMutation,
  useGoogleSignInMutation,
  useRequestLinkOtpMutation,
  useVerifyLinkOtpMutation,
  useVerifyOtpMutation,
  useDeviceRegistrationRequestOtpMutation,
  useDeviceRegistrationVerifyOtpMutation,
  useResendOtpMutation,
  useRequestWhatsappOtpMutation,
  useLogoutMutation,
  useDeleteAccountMutation,
  useMeQuery,
  useLazyMeQuery,
  useUsersMeQuery,
  useLazyUsersMeQuery,
  useUpdateProfileMutation,
  useUploadProfilePhotoMutation,
  useUploadCoverPhotoMutation,
  useLinkedDevicesSummaryQuery,
  useLazyLinkedDevicesSummaryQuery,
  useWallpaperOptionsQuery,
  useLinkDeviceMutation,
  useUnlinkDeviceMutation,
  usePatchLinkedDeviceMutation,
  useUploadDeviceWallpaperMutation,
  useSelectDeviceWallpaperMutation,
  usePatchTabletDeviceMutation,
} = authApi;
