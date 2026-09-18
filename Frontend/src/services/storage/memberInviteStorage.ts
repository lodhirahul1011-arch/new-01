import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_MEMBER_INVITES_KEY = 'pending_member_invites_v1';

export type PendingMemberInvite = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  createdAt: string;
  status: 'pending';
};

function normalizePhoneDigits(value?: string) {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.startsWith('91') && digits.length >= 12) {
    return digits.slice(2, 12);
  }

  if (digits.length > 10) {
    return digits.slice(-10);
  }

  return digits;
}

export async function getPendingMemberInvites() {
  const raw = await AsyncStorage.getItem(PENDING_MEMBER_INVITES_KEY);

  if (!raw) {
    return [] as PendingMemberInvite[];
  }

  try {
    const parsed = JSON.parse(raw) as PendingMemberInvite[];
    return Array.isArray(parsed)
      ? parsed.filter(
          item =>
            item &&
            typeof item.id === 'string' &&
            typeof item.name === 'string' &&
            typeof item.phone === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

async function setPendingMemberInvites(invites: PendingMemberInvite[]) {
  await AsyncStorage.setItem(
    PENDING_MEMBER_INVITES_KEY,
    JSON.stringify(invites),
  );
}

export async function savePendingMemberInvite(invite: PendingMemberInvite) {
  const currentInvites = await getPendingMemberInvites();
  const invitePhone = normalizePhoneDigits(invite.phone);

  const nextInvites = currentInvites.filter(existing => {
    return normalizePhoneDigits(existing.phone) !== invitePhone;
  });

  nextInvites.unshift(invite);
  await setPendingMemberInvites(nextInvites);
}

export async function removePendingMemberInviteById(inviteId: string) {
  const currentInvites = await getPendingMemberInvites();
  await setPendingMemberInvites(
    currentInvites.filter(invite => invite.id !== inviteId),
  );
}

export async function updatePendingMemberInviteName(inviteId: string, name: string) {
  const currentInvites = await getPendingMemberInvites();
  const nextInvites = currentInvites.map(invite =>
    invite.id === inviteId ? { ...invite, name } : invite,
  );
  await setPendingMemberInvites(nextInvites);
  return nextInvites;
}

export async function findPendingMemberInviteByPhone(phone: string) {
  const targetPhone = normalizePhoneDigits(phone);

  if (!targetPhone) {
    return null;
  }

  const currentInvites = await getPendingMemberInvites();
  return (
    currentInvites.find(invite => {
      return normalizePhoneDigits(invite.phone) === targetPhone;
    }) ?? null
  );
}

export async function reconcilePendingMemberInvites(registeredPhones: string[]) {
  const normalizedRegisteredPhones = new Set(
    registeredPhones.map(phone => normalizePhoneDigits(phone)).filter(Boolean),
  );

  const currentInvites = await getPendingMemberInvites();
  const unresolvedInvites = currentInvites.filter(invite => {
    return !normalizedRegisteredPhones.has(normalizePhoneDigits(invite.phone));
  });

  await setPendingMemberInvites(unresolvedInvites);
  return unresolvedInvites;
}
