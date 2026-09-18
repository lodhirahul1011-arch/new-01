import type { FamilyMember } from '../../../services/api/membersApi';

export type MemberBackendStatus = 'active' | 'pending' | 'removed';

export function normalizePhoneDigits(value?: string) {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.startsWith('91') && digits.length >= 12) {
    return digits.slice(2, 12);
  }

  if (digits.length > 10) {
    return digits.slice(-10);
  }

  return digits;
}

export function resolveMemberBackendStatus(item: FamilyMember): MemberBackendStatus {
  const backendStatus = String(
    item.status || item.inviteStatus || item.invitationStatus || '',
  ).toLowerCase();

  if (backendStatus === 'pending') return 'pending';
  if (backendStatus === 'removed') return 'removed';

  return 'active';
}

export function isPhoneAlreadyRegistered(
  phone: string,
  members: FamilyMember[],
): { status: MemberBackendStatus; member: FamilyMember } | null {
  const targetPhone = normalizePhoneDigits(phone);

  if (!targetPhone) {
    return null;
  }

  const matchedMember = members.find(item => {
    if (resolveMemberBackendStatus(item) === 'removed') {
      return false;
    }

    return normalizePhoneDigits(item.phone || item.email) === targetPhone;
  });

  if (!matchedMember) {
    return null;
  }

  return {
    status: resolveMemberBackendStatus(matchedMember),
    member: matchedMember,
  };
}

export function resolveDisplayAccessLevel(
  item: FamilyMember,
): 'full' | 'simple' | 'nfc_only' | 'none' {
  const status = resolveMemberBackendStatus(item);

  if (status === 'pending') {
    return 'none';
  }

  if (item.accessLevel === 'simple') {
    return 'simple';
  }

  if (item.accessLevel === 'nfc_only') {
    return 'nfc_only';
  }

  return 'full';
}
