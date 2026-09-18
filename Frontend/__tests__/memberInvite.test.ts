import {
  isPhoneAlreadyRegistered,
  normalizePhoneDigits,
  resolveDisplayAccessLevel,
} from '../src/features/members/utils/memberInvite';

describe('member invite helpers', () => {
  it('normalizes Indian phone numbers to 10 digits', () => {
    expect(normalizePhoneDigits('+91 98765-43210')).toBe('9876543210');
    expect(normalizePhoneDigits('919876543210')).toBe('9876543210');
  });

  it('blocks invites for already registered or pending backend numbers', () => {
    const members = [
      {
        _id: '1',
        name: 'Active User',
        phone: '+91 9876543210',
        role: 'member' as const,
        status: 'active' as const,
      },
      {
        _id: '2',
        name: 'Pending User',
        phone: '+91 9999999999',
        role: 'member' as const,
        inviteStatus: 'pending' as const,
      },
    ];

    expect(isPhoneAlreadyRegistered('+91 9876543210', members)?.status).toBe(
      'active',
    );
    expect(isPhoneAlreadyRegistered('+91 9999999999', members)?.status).toBe(
      'pending',
    );
    expect(isPhoneAlreadyRegistered('+91 8888888888', members)).toBeNull();
  });

  it('defaults active members without an access level to full access', () => {
    expect(
      resolveDisplayAccessLevel({
        _id: '1',
        name: 'New User',
        role: 'member',
        status: 'active',
      }),
    ).toBe('full');
  });
});
