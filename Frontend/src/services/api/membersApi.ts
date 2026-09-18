import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

export type FamilyMember = {
  _id: string;
  userId?: string;
  name: string;
  phone?: string;
  email?: string;
  role: 'owner' | 'admin' | 'member';
        accessLevel?: 'full' | 'simple' | 'nfc_only';
  status?: 'pending' | 'active' | 'removed' | string;
  inviteStatus?: 'pending' | 'active' | 'removed' | string;
  invitationStatus?: 'pending' | 'active' | 'removed' | string;
  createdAt?: string;
  updatedAt?: string;
};

type MembersApiResponse =
  | {
      ok?: boolean;
      data?:
        | FamilyMember[]
        | {
            members?: FamilyMember[];
            familyMembers?: FamilyMember[];
            pendingMembers?: Array<Record<string, unknown>>;
            invites?: Array<Record<string, unknown>>;
            pendingInvites?: Array<Record<string, unknown>>;
            [key: string]:
              | FamilyMember[]
              | Array<Record<string, unknown>>
              | Record<string, unknown>
              | string
              | number
              | boolean
              | undefined;
          };
    }
  | undefined;

type MembersPayloadObject = {
  members?: FamilyMember[];
  familyMembers?: FamilyMember[];
  pendingMembers?: Array<Record<string, unknown>>;
  invites?: Array<Record<string, unknown>>;
  pendingInvites?: Array<Record<string, unknown>>;
  [key: string]:
    | FamilyMember[]
    | Array<Record<string, unknown>>
    | Record<string, unknown>
    | string
    | number
    | boolean
    | undefined;
};

export type InviteMemberPayload = {
  name: string;
  phone: string;
  channel?: 'sms' | 'whatsapp';
};

export type InviteMemberResponse = {
  inviteId: string;
  to: string;
  expiresAt: string;
  token?: string;
};

function getString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function normalizePendingInvite(item: Record<string, unknown>): FamilyMember {
  const inviteId =
    getString(item._id) ||
    getString(item.inviteId) ||
    getString(item.id) ||
    getString(item.token) ||
    `${getString(item.phone) || getString(item.email) || Date.now()}`;
  const rawStatus = String(
    getString(item.status) ||
      getString(item.inviteStatus) ||
      getString(item.invitationStatus) ||
      '',
  ).toLowerCase();
  const status =
    rawStatus === 'removed' || rawStatus === 'cancelled' || rawStatus === 'canceled'
      ? 'removed'
      : rawStatus === 'active' ||
          rawStatus === 'accepted' ||
          rawStatus === 'registered' ||
          rawStatus === 'completed' ||
          !!getString(item.userId)
        ? 'active'
        : 'pending';

  return {
    _id: inviteId,
    userId: getString(item.userId),
    name: getString(item.name) || 'Invited Member',
    phone: getString(item.phone) || getString(item.to),
    email: getString(item.email),
    role: 'member',
    accessLevel: status === 'active' ? 'simple' : undefined,
    status,
    inviteStatus: status,
    invitationStatus: status,
    createdAt: getString(item.createdAt),
    updatedAt: getString(item.updatedAt),
  };
}

function looksLikeFamilyMember(item: unknown): item is FamilyMember {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const record = item as Record<string, unknown>;

  return (
    typeof record._id === 'string' &&
    typeof record.name === 'string' &&
    (typeof record.role === 'string' || typeof record.userId === 'string')
  );
}

function looksLikeInvite(item: unknown): item is Record<string, unknown> {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const record = item as Record<string, unknown>;

  return (
    typeof record.phone === 'string' ||
    typeof record.email === 'string' ||
    typeof record.inviteId === 'string' ||
    typeof record.token === 'string'
  );
}

function collectCandidatePayloads(
  value: unknown,
  depth = 0,
  seen = new Set<unknown>(),
): MembersPayloadObject[] {
  if (!value || typeof value !== 'object' || depth > 4 || seen.has(value)) {
    return [];
  }

  seen.add(value);

  const record = value as Record<string, unknown>;
  const payloads: MembersPayloadObject[] = [record as MembersPayloadObject];

  Object.values(record).forEach(child => {
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      payloads.push(...collectCandidatePayloads(child, depth + 1, seen));
    }
  });

  return payloads;
}

function normalizeMembersResponse(
  response: MembersApiResponse,
): { ok: boolean; data: FamilyMember[] } {
  const payload = response?.data;

  if (Array.isArray(payload)) {
    const directFamilyMembers = payload.filter(looksLikeFamilyMember);
    const directInvites = payload
      .filter(item => !looksLikeFamilyMember(item) && looksLikeInvite(item))
      .map(normalizePendingInvite);

    return {
      ok: response?.ok ?? true,
      data: [...directInvites, ...directFamilyMembers],
    };
  }

  if (!payload || typeof payload !== 'object') {
    return {
      ok: response?.ok ?? true,
      data: [],
    };
  }

  const activeMembers: FamilyMember[] = [];
  const pendingInvitesSource: Array<Record<string, unknown>> = [];
  const candidatePayloads = collectCandidatePayloads(response);

  candidatePayloads.forEach(typedPayload => {
    Object.entries(typedPayload).forEach(([key, value]) => {
      if (!Array.isArray(value)) {
        return;
      }

      const loweredKey = key.toLowerCase();
      const list = value as unknown[];
      const familyMembers = list.filter(looksLikeFamilyMember);
      const invites = list.filter(looksLikeInvite);

      if (
        familyMembers.length > 0 &&
        (loweredKey.includes('member') ||
          loweredKey.includes('family') ||
          loweredKey.includes('user'))
      ) {
        activeMembers.push(...familyMembers);
        return;
      }

      if (
        invites.length > 0 &&
        (loweredKey.includes('invite') ||
          loweredKey.includes('pending') ||
          loweredKey.includes('registration'))
      ) {
        pendingInvitesSource.push(...invites);
      }
    });
  });

  if (activeMembers.length === 0) {
    candidatePayloads.forEach(typedPayload => {
      if (Array.isArray(typedPayload.members)) {
        activeMembers.push(
          ...(typedPayload.members as unknown[]).filter(looksLikeFamilyMember),
        );
      }

      if (Array.isArray(typedPayload.familyMembers)) {
        activeMembers.push(
          ...(typedPayload.familyMembers as unknown[]).filter(looksLikeFamilyMember),
        );
      }
    });
  }

  if (pendingInvitesSource.length === 0) {
    candidatePayloads.forEach(typedPayload => {
      pendingInvitesSource.push(
        ...(Array.isArray(typedPayload.pendingMembers)
          ? (typedPayload.pendingMembers as unknown[]).filter(looksLikeInvite)
          : []),
        ...(Array.isArray(typedPayload.pendingInvites)
          ? (typedPayload.pendingInvites as unknown[]).filter(looksLikeInvite)
          : []),
        ...(Array.isArray(typedPayload.invites)
          ? (typedPayload.invites as unknown[]).filter(looksLikeInvite)
          : []),
      );
    });
  }

  if (activeMembers.length === 0 && pendingInvitesSource.length === 0) {
    candidatePayloads.forEach(typedPayload => {
      Object.values(typedPayload).forEach(value => {
        if (!Array.isArray(value)) {
          return;
        }

        const list = value as unknown[];
        activeMembers.push(...list.filter(looksLikeFamilyMember));
        pendingInvitesSource.push(...list.filter(looksLikeInvite));
      });
    });
  }

  if (activeMembers.length === 0 && pendingInvitesSource.length === 0) {
    const directArray = Object.values(response ?? {}).find(Array.isArray);

    if (Array.isArray(directArray)) {
      const list = directArray as unknown[];
      activeMembers.push(...list.filter(looksLikeFamilyMember));
      pendingInvitesSource.push(...list.filter(looksLikeInvite));
    }
  }

  const pendingInvites = pendingInvitesSource.map(normalizePendingInvite);
  const seenIds = new Set<string>();
  const mergedMembers = [...pendingInvites, ...activeMembers].filter(member => {
    if (!member?._id || seenIds.has(member._id)) {
      return false;
    }

    seenIds.add(member._id);
    return true;
  });

  return {
    ok: response?.ok ?? true,
    data: mergedMembers,
  };
}

export const membersApi = createApi({
  reducerPath: 'membersApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Members'],
  endpoints: builder => ({
    listMembers: builder.query<{ ok: boolean; data: FamilyMember[] }, void>({
      query: () => ({ url: '/api/v1/family/members', method: 'GET' }),
      transformResponse: response =>
        normalizeMembersResponse(response as MembersApiResponse),
      providesTags: ['Members'],
    }),

    inviteMember: builder.mutation<
      { ok: boolean; data: InviteMemberResponse },
      InviteMemberPayload
    >({
      query: body => ({
        url: '/api/v1/family/invite',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Members'],
    }),

    removeMember: builder.mutation<
      { ok: boolean; data: { removed: boolean; accountDeleted?: boolean } },
      { memberId: string }
    >({
      query: ({ memberId }) => ({
        url: `/api/v1/family/members/${memberId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Members'],
    }),

    updateMember: builder.mutation<
      { ok: boolean; data: FamilyMember },
      { memberId: string; name?: string }
    >({
      query: ({ memberId, ...body }) => ({
        url: `/api/v1/family/members/${memberId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Members'],
    }),
  }),
});

export const {
  useListMembersQuery,
  useInviteMemberMutation,
  useRemoveMemberMutation,
  useUpdateMemberMutation,
} = membersApi;
