const crypto = require('crypto');

const BackupAssignment = require('../models/BackupAssignment');
const AwayModeSetting = require('../models/AwayModeSetting');
const { writeAudit } = require('./audit.service');
const awayModeService = require('./awayMode.service');
const {
  createHttpError,
  resolveActorContext,
  assertCanManage,
  assertDeliveryInHome,
  toObjectId,
} = require('./homeAccess.service');

const VALIDITY_HOURS = Number(process.env.BACKUP_ACCESS_VALIDITY_HOURS || 24);

function hashCode(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function formatAssignedDateLabel(value) {
  if (!value) return '';
  const d = new Date(value);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `Assigned ${dd}/${mm}/${yyyy}`;
}

function formatTimeLeftLabel(record, now = new Date()) {
  const status = record.status;
  if (status === 'expired') return 'Expired';
  if (status === 'revoked') return 'Revoked';
  if (status === 'used') return 'Used';
  const validUntil = record.validUntil ? new Date(record.validUntil) : null;
  if (!validUntil) return '';
  const diffMs = validUntil.getTime() - now.getTime();
  if (diffMs <= 0) return 'Expired';
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffMinutes = Math.ceil((diffMs % (60 * 60 * 1000)) / (60 * 1000));
  if (diffHours > 0) return `${diffHours}h left`;
  return `${diffMinutes}m left`;
}

async function syncExpiredAssignments(homeId) {
  const now = new Date();
  await BackupAssignment.updateMany(
    {
      homeId,
      status: 'active',
      validUntil: { $lt: now },
    },
    {
      $set: {
        status: 'expired',
        expiredAt: now,
      },
    }
  );
}

function normalizeStatus(record, now = new Date()) {
  if (record.status === 'active' && record.validUntil && new Date(record.validUntil).getTime() < now.getTime()) {
    return 'expired';
  }
  return record.status;
}

function decorateAssignment(record, now = new Date()) {
  const status = normalizeStatus(record, now);
  return {
    _id: record._id,
    guestName: record.guestName,
    status,
    statusLabel: status === 'active' ? 'Active' : status === 'expired' ? 'Expired' : status === 'revoked' ? 'Revoked' : 'Used',
    assignedDate: record.assignedAt ? new Date(record.assignedAt).toISOString().slice(0, 10) : null,
    assignedDateLabel: formatAssignedDateLabel(record.assignedAt),
    timeLeftLabel: formatTimeLeftLabel({ ...record, status }, now),
    validUntil: record.validUntil || null,
    validFrom: record.validFrom || null,
    deliveryId: record.deliveryId || null,
  };
}

async function resolveOtpContext(homeId, userId, deliveryId) {
  if (deliveryId) {
    const delivery = await assertDeliveryInHome(homeId, deliveryId);
    const rawCode = delivery.otp || delivery.verificationCode || '';
    if (rawCode) {
      return {
        code: rawCode,
        source: 'delivery',
        deliveryId: delivery._id,
      };
    }
  }

  const temp = await awayModeService.ensureTemporaryCodeForHome(homeId, userId, { forceRegenerate: false });
  return {
    code: temp.code,
    source: 'away_mode',
    deliveryId: deliveryId || null,
    validFrom: temp.validFrom,
    validUntil: temp.validUntil,
  };
}

async function updateAwayModeBackupLink(homeId, userId, assignment) {
  await awayModeService.setBackupPersonLink(homeId, userId, {
    enabled: Boolean(assignment),
    type: assignment ? 'manual' : 'none',
    name: assignment ? assignment.guestName : '',
    backupAssignmentId: assignment ? assignment._id : null,
  });
}

async function getOverview(user, query) {
  const { homeId, actor } = await resolveActorContext(user);
  assertCanManage(actor);
  await syncExpiredAssignments(homeId);

  const deliveryId = query && query.deliveryId ? query.deliveryId : null;
  const otpContext = await resolveOtpContext(homeId, user._id, deliveryId);
  const items = await BackupAssignment.find({ homeId, ...(deliveryId ? { deliveryId: toObjectId(deliveryId) } : {}) })
    .sort({ assignedAt: -1, _id: -1 })
    .limit(20)
    .lean();

  return {
    otp: {
      code: otpContext.code,
      masked: false,
      source: otpContext.source,
      deliveryId: otpContext.deliveryId || null,
    },
    config: {
      defaultValidityHours: VALIDITY_HOURS,
      validityLabel: `The backup person will have access for ${VALIDITY_HOURS} hours from assignment`,
    },
    assignedBackupPersons: items.map((entry) => decorateAssignment(entry)),
  };
}

async function assignBackup(user, payload) {
  const { homeId, actor } = await resolveActorContext(user);
  assertCanManage(actor);
  await syncExpiredAssignments(homeId);

  const deliveryId = payload.deliveryId ? toObjectId(payload.deliveryId) : null;
  if (payload.deliveryId && !deliveryId) {
    throw createHttpError(400, 'INVALID_DELIVERY_ID', 'Invalid delivery id');
  }
  if (deliveryId) {
    await assertDeliveryInHome(homeId, deliveryId);
  }

  const escapedGuestName = String(payload.guestName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const duplicate = await BackupAssignment.findOne({
    homeId,
    deliveryId: deliveryId || null,
    guestName: new RegExp(`^${escapedGuestName}$`, 'i'),
    status: 'active',
  }).lean();
  if (duplicate) {
    throw createHttpError(409, 'BACKUP_ALREADY_ASSIGNED', 'Backup person already assigned and active');
  }

  const otpContext = await resolveOtpContext(homeId, user._id, deliveryId);
  const now = new Date();
  const validUntil = new Date(now.getTime() + VALIDITY_HOURS * 60 * 60 * 1000);

  const assignment = await BackupAssignment.create({
    homeId,
    deliveryId: deliveryId || null,
    createdByUserId: user._id,
    createdByMemberId: actor._id || null,
    otpCode: otpContext.code,
    otpCodeHash: hashCode(otpContext.code),
    guestName: payload.guestName,
    status: 'active',
    validFrom: now,
    validUntil,
    assignedAt: now,
    notes: payload.notes || '',
    meta: {
      source: 'delivery_backup_screen',
      deviceId: '',
      createdByRole: actor.role || 'owner',
    },
  });

  await updateAwayModeBackupLink(homeId, user._id, assignment);
  await writeAudit({
    scope: 'backup',
    action: 'backup_assigned',
    status: 'success',
    userId: user._id,
    details: {
      homeId: String(homeId),
      guestName: assignment.guestName,
      deliveryId: assignment.deliveryId ? String(assignment.deliveryId) : null,
    },
  });

  return decorateAssignment(assignment);
}

async function listAssignments(user, query) {
  const { homeId, actor } = await resolveActorContext(user);
  assertCanManage(actor);
  await syncExpiredAssignments(homeId);

  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;
  const mongoQuery = {
    homeId,
    ...(query.deliveryId ? { deliveryId: toObjectId(query.deliveryId) } : {}),
    ...(query.status && query.status !== 'all' ? { status: query.status } : {}),
  };

  const [items, totalItems] = await Promise.all([
    BackupAssignment.find(mongoQuery).sort({ assignedAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    BackupAssignment.countDocuments(mongoQuery),
  ]);

  return {
    items: items.map((entry) => decorateAssignment(entry)),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      hasNextPage: skip + items.length < totalItems,
    },
  };
}

async function revokeAssignment(user, id) {
  const { homeId, actor } = await resolveActorContext(user);
  assertCanManage(actor);
  const _id = toObjectId(id);
  if (!_id) {
    throw createHttpError(400, 'INVALID_BACKUP_ASSIGNMENT_ID', 'Invalid backup assignment id');
  }

  const assignment = await BackupAssignment.findOne({ _id, homeId });
  if (!assignment) {
    throw createHttpError(404, 'BACKUP_ASSIGNMENT_NOT_FOUND', 'Backup assignment not found');
  }

  if (assignment.status === 'active') {
    assignment.status = 'revoked';
    assignment.revokedAt = new Date();
    if (typeof assignment.save === 'function') {
      await assignment.save();
    } else {
      await BackupAssignment.updateOne({ _id, homeId }, { $set: { status: 'revoked', revokedAt: assignment.revokedAt } });
    }
  }

  const setting = await AwayModeSetting.findOne({ homeId }).lean();
  if (setting && setting.backupPerson && String(setting.backupPerson.backupAssignmentId || '') === String(_id)) {
    await updateAwayModeBackupLink(homeId, user._id, null);
  }

  await writeAudit({
    scope: 'backup',
    action: 'backup_revoked',
    status: 'success',
    userId: user._id,
    details: {
      homeId: String(homeId),
      assignmentId: String(_id),
    },
  });

  return {
    _id: assignment._id,
    status: assignment.status,
    statusLabel: assignment.status === 'revoked' ? 'Revoked' : 'Expired',
  };
}

module.exports = {
  getOverview,
  assignBackup,
  listAssignments,
  revokeAssignment,
};
