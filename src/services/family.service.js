const FamilyMember = require('../models/FamilyMember');
const MemberInvite = require('../models/MemberInvite');
const User = require('../models/User');

const { env } = require('../config/env');
const { resolveHomeId } = require('../utils/home');
const { sha256, randomToken } = require('../utils/security');
const { isE164Phone } = require('../utils/identifier');
const { sendTemplateSms } = require('./sms.Service');

function isSameId(a, b) {
  return String(a || '') === String(b || '');
}

function assertPhone(phone) {
  if (!isE164Phone(phone)) {
    const err = new Error('Phone must be in E.164 format (e.g. +919876543210)');
    err.status = 400;
    throw err;
  }
}

function buildMemberInviteMessage(inviterName) {
  const safeName = String(inviterName || 'A family member').trim() || 'A family member';
  return `${safeName} has invited you to join their family on Dvaari App. Please login and accept the request to continue. - Dvaari.io (GRAHNETRA AI LABS)`;
}

async function sendMemberInviteSms({ inviterName, phone }) {
  const message = buildMemberInviteMessage(inviterName);

  try {
    return await sendTemplateSms({
      phone,
      templateId: env.SMS_MEMBER_INVITE_TEMPLATE_ID,
      message,
      logScope: 'FAMILY_INVITE_SMS',
    });
  } catch (err) {
    if (env.NODE_ENV !== 'production') {
      console.log(`[DEV INVITE SMS FALLBACK] to=${phone} message="${message}" reason=${err.message}`);
      return { ok: true, provider: 'console_fallback' };
    }

    const error = new Error('Could not send invitation SMS');
    error.status = 502;
    error.code = 'INVITE_SMS_FAILED';
    error.details = err.details || err.message;
    throw error;
  }
}

async function getOrCreateOwnerMember(user) {
  const homeId = resolveHomeId(user);
  if (!homeId) {
    const err = new Error('Invalid user');
    err.status = 401;
    throw err;
  }

  // Ensure primaryHomeId exists (for consistent linking).
  if (!user.primaryHomeId) {
    await User.updateOne({ _id: user._id }, { $set: { primaryHomeId: homeId } });
    // eslint-disable-next-line no-param-reassign
    user.primaryHomeId = homeId;
  }

  const isOwnHome = isSameId(homeId, user._id);
  let actor = await FamilyMember.findOne({ homeId, userId: user._id, status: 'active' });

  if (isOwnHome && actor && actor.role !== 'owner') {
    actor.role = 'owner';
    actor.accessLevel = 'full';
    await actor.save();
  }

  if (isOwnHome && !actor) {
    actor = await FamilyMember.create({
      homeId,
      userId: user._id,
      name: user.name || 'Owner',
      phone: user.phone || '',
      email: user.email || '',
      role: 'owner',
      accessLevel: 'full',
      status: 'active',
    });
  }

  return { homeId, actor };
}

async function requireAdmin(user) {
  const { homeId, actor } = await getOrCreateOwnerMember(user);
  if (actor && (actor.role === 'owner' || actor.role === 'admin')) {
    return { homeId, actor };
  }

  const err = new Error('Forbidden');
  err.status = 403;
  throw err;
}

async function requireAdminForHome(user, homeId) {
  const currentHomeId = resolveHomeId(user);

  if (currentHomeId && isSameId(currentHomeId, homeId)) {
    const actor = await FamilyMember.findOne({
      homeId,
      userId: user._id,
      status: 'active',
    });

    if (actor) return actor;

    return { homeId, userId: user._id, role: 'owner', accessLevel: 'full' };
  }

  if (isSameId(homeId, user._id)) {
    const existing = await FamilyMember.findOne({
      homeId,
      userId: user._id,
      status: 'active',
    });

    if (existing) {
      if (existing.role !== 'owner') {
        existing.role = 'owner';
        existing.accessLevel = 'full';
        await existing.save();
      }

      return existing;
    }

    return FamilyMember.create({
      homeId,
      userId: user._id,
      name: user.name || 'Owner',
      phone: user.phone || '',
      email: user.email || '',
      role: 'owner',
      accessLevel: 'full',
      status: 'active',
    });
  }

  const actor = await FamilyMember.findOne({
    homeId,
    userId: user._id,
    status: 'active',
    role: { $in: ['owner', 'admin'] },
  });

  if (actor) return actor;

  const err = new Error('Forbidden');
  err.status = 403;
  throw err;
}

async function canManageInvite(user, invite) {
  if (!invite) return false;
  if (isSameId(invite.invitedBy, user._id)) return true;
  if (isSameId(invite.homeId, user._id)) return true;

  try {
    await requireAdminForHome(user, invite.homeId);
    return true;
  } catch {
    return false;
  }
}

async function assertCanManageInvite(user, invite) {
  if (await canManageInvite(user, invite)) return;

  const err = new Error('Forbidden');
  err.status = 403;
  throw err;
}

async function assertCanManageMember(user, member) {
  try {
    await requireAdminForHome(user, member.homeId);
    return;
  } catch {
    if (isSameId(member.homeId, user._id)) return;

    const invite = await MemberInvite.findOne({
      homeId: member.homeId,
      invitedPhone: member.phone,
      invitedBy: user._id,
      status: { $in: ['accepted', 'pending'] },
    });

    if (invite) return;

    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
}

async function listMembers(user) {
  const { homeId, actor } = await getOrCreateOwnerMember(user);
  const members = await FamilyMember.find({ homeId, status: 'active' }).sort({ createdAt: 1 }).lean();

  if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) {
    return { members, pendingInvites: [] };
  }

  const pendingInvites = await MemberInvite.find({
    homeId,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: 1 })
    .lean();

  return {
    members,
    pendingInvites: pendingInvites.map(invite => ({
      _id: invite._id,
      inviteId: invite._id,
      name: invite.invitedName,
      phone: invite.invitedPhone,
      role: 'member',
      status: 'pending',
      inviteStatus: 'pending',
      invitationStatus: 'pending',
      createdAt: invite.createdAt,
      updatedAt: invite.updatedAt,
      expiresAt: invite.expiresAt,
    })),
  };
}

async function inviteMember(user, { name, phone, channel }) {
  const { homeId, actor } = await requireAdmin(user);
  assertPhone(phone);

  // Prevent duplicate member.
  const existing = await FamilyMember.findOne({ homeId, phone, status: 'active' });
  if (existing) {
    const err = new Error('Member with this phone already exists');
    err.status = 409;
    throw err;
  }

  // Rate limiting per inviter is handled by global auth limiter.
  const token = randomToken(24);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const invite = await MemberInvite.create({
    homeId,
    invitedBy: user._id,
    invitedName: name,
    invitedPhone: phone,
    tokenHash,
    status: 'pending',
    expiresAt,
  });

  if (channel === 'sms') {
    await sendMemberInviteSms({
      inviterName: actor.name || user.name,
      phone,
    });
  }

  return {
    inviteId: invite._id,
    to: phone,
    expiresAt,
    ...(process.env.NODE_ENV !== 'production' ? { token } : {}),
  };
}

async function acceptInvite(user, { token }) {
  const tokenHash = sha256(token);
  const invite = await MemberInvite.findOne({ tokenHash });
  if (!invite) {
    const err = new Error('Invalid invite token');
    err.status = 400;
    throw err;
  }
  if (invite.status !== 'pending') {
    const err = new Error('Invite token already used');
    err.status = 400;
    throw err;
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    await MemberInvite.updateOne({ _id: invite._id }, { $set: { status: 'expired' } });
    const err = new Error('Invite token expired');
    err.status = 400;
    throw err;
  }

  // Link user to the home.
  await User.updateOne(
    { _id: user._id },
    { $set: { primaryHomeId: invite.homeId } }
  );

  // Create family member record.
  const member = await FamilyMember.create({
    homeId: invite.homeId,
    userId: user._id,
    name: invite.invitedName,
    phone: invite.invitedPhone,
    email: user.email || '',
    role: 'member',
    accessLevel: 'simple',
    status: 'active',
  });

  await MemberInvite.updateOne({ _id: invite._id }, { $set: { status: 'accepted', acceptedAt: new Date() } });

  return member;
}

async function acceptPendingInviteForRegisteredUser(user) {
  if (!user || !user.phone) return null;

  const invite = await MemberInvite.findOne({
    invitedPhone: user.phone,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: 1 });

  if (!invite) return null;

  const existing = await FamilyMember.findOne({
    homeId: invite.homeId,
    $or: [
      { userId: user._id, status: 'active' },
      { phone: invite.invitedPhone, status: 'active' },
    ],
  });

  if (existing) {
    invite.status = 'accepted';
    invite.acceptedAt = new Date();
    await invite.save();
    return existing;
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { primaryHomeId: invite.homeId } }
  );

  const member = await FamilyMember.create({
    homeId: invite.homeId,
    userId: user._id,
    name: invite.invitedName || user.name,
    phone: invite.invitedPhone,
    email: user.email || '',
    role: 'member',
    accessLevel: 'simple',
    status: 'active',
  });

  invite.status = 'accepted';
  invite.acceptedAt = new Date();
  await invite.save();

  return member;
}

async function updateMember(user, memberId, patch) {
  const member = await FamilyMember.findOne({ _id: memberId, status: 'active' });
  if (!member) {
    const invite = await MemberInvite.findOne({ _id: memberId, status: 'pending' });
    if (!invite) {
      const err = new Error('Member not found');
      err.status = 404;
      throw err;
    }

    await assertCanManageInvite(user, invite);

    if (patch.name) invite.invitedName = patch.name;
    await invite.save();

    return {
      _id: invite._id,
      inviteId: invite._id,
      name: invite.invitedName,
      phone: invite.invitedPhone,
      role: 'member',
      status: 'pending',
      inviteStatus: 'pending',
      invitationStatus: 'pending',
      createdAt: invite.createdAt,
      updatedAt: invite.updatedAt,
      expiresAt: invite.expiresAt,
    };
  }

  await assertCanManageMember(user, member);

  if (member.role === 'owner') {
    const err = new Error('Owner role cannot be changed');
    err.status = 400;
    throw err;
  }
  Object.assign(member, patch);
  await member.save();

  if (patch.name && member.userId) {
    await User.updateOne({ _id: member.userId }, { $set: { name: patch.name } });
  }

  return member;
}

async function removeMember(user, memberId) {
  const member = await FamilyMember.findOne({ _id: memberId, status: 'active' });
  if (!member) {
    const invite = await MemberInvite.findOne({ _id: memberId, status: 'pending' });
    if (!invite) {
      const err = new Error('Member not found');
      err.status = 404;
      throw err;
    }

    await assertCanManageInvite(user, invite);

    invite.status = 'cancelled';
    await invite.save();
    return { removed: true, inviteRemoved: true, accountDeleted: false };
  }

  await assertCanManageMember(user, member);

  if (member.role === 'owner' || isSameId(member.userId, user._id)) {
    const err = new Error('Owner cannot be removed');
    err.status = 400;
    throw err;
  }
  member.status = 'removed';
  member.removedAt = new Date();
  await member.save();

  return {
    removed: true,
    accountDeleted: false,
  };
}

module.exports = {
  listMembers,
  inviteMember,
  acceptInvite,
  acceptPendingInviteForRegisteredUser,
  updateMember,
  removeMember,
};
