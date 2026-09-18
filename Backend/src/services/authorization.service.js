const crypto = require('crypto');
const mongoose = require('mongoose');

const Authorization = require('../models/Authorization');
const FamilyMember = require('../models/FamilyMember');
const User = require('../models/User');
const Delivery = require('../models/Delivery');
const { resolveHomeId } = require('../utils/home');
const { safeLog } = require('../utils/logger');
const { writeAudit } = require('./audit.service');

function createHttpError(status, code, message, details) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details) err.details = details;
  return err;
}

function toObjectId(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(String(value));
}

function assertAuthorizationId(value) {
  const objectId = toObjectId(value);
  if (!objectId) {
    throw createHttpError(400, 'INVALID_AUTHORIZATION_ID', 'Invalid authorization id');
  }
  return objectId;
}

function utcTodayKey(now = new Date()) {
  return new Date(now.getTime()).toISOString().slice(0, 10);
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function combineDateAndTime(dateKey, timeValue) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const [hours, minutes] = String(timeValue).split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
}

function resolveMonthBounds(monthArg) {
  if (!monthArg) return null;
  const [year, month] = String(monthArg).split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

function formatDateLabel(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatDateTimeLabel(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

function formatTimeLabel(timeValue) {
  if (!timeValue) return '';
  const [hours, minutes] = String(timeValue).split(':').map(Number);
  const sample = new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
  return sample.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

function formatScheduleTypeLabel(type) {
  if (type === 'TODAY') return 'Today';
  if (type === 'DAILY') return 'Daily';
  if (type === 'CUSTOM') return 'Custom';
  return type || '';
}

function formatStatusLabel(status) {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'USED') return 'Completed';
  if (status === 'EXPIRED') return 'Expired';
  if (status === 'CANCELLED') return 'Cancelled';
  return status || '';
}

function formatStatusColor(status) {
  if (status === 'ACTIVE') return 'green';
  if (status === 'USED') return 'blue';
  if (status === 'EXPIRED') return 'orange';
  if (status === 'CANCELLED') return 'red';
  return 'gray';
}

function formatDateRangeLabel(schedule) {
  if (!schedule) return '';
  const start = schedule.startDate ? formatDateLabel(schedule.startDate) : '';
  const end = schedule.endDate ? formatDateLabel(schedule.endDate) : '';
  if (schedule.type === 'DAILY' && !schedule.endDate) return 'Daily';
  if (start && end && start !== end) return `${start} - ${end}`;
  return start || end || '';
}

function formatTimeWindowLabel(schedule) {
  if (!schedule) return '';
  const start = formatTimeLabel(schedule.startTime);
  const end = formatTimeLabel(schedule.endTime);
  if (!start && !end) return '';
  return `${start} - ${end}`;
}

function getOtpVerificationStatus(record) {
  if (!record?.verification) return 'not_required';
  if (record.verification.otpVerified) return 'verified';
  if (record.verification.status === 'failed') return 'failed';
  if (record.verification.otpRequired) return 'pending';
  return 'not_required';
}

function getOtpVerificationLabel(status) {
  if (status === 'verified') return 'Verified';
  if (status === 'pending') return 'Pending';
  if (status === 'failed') return 'Failed';
  return 'Not Required';
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isExpired(record, now = new Date()) {
  if (!record) return false;
  if (record?.status?.current && record.status.current !== 'ACTIVE') return false;
  const until = record?.schedule?.validUntilAt;
  return Boolean(until && new Date(until).getTime() < now.getTime());
}

function isWithinDailyWindow(record, now = new Date()) {
  const schedule = record?.schedule || {};
  if (!schedule.startTime || !schedule.endTime) return true;
  const todayKey = utcTodayKey(now);
  if (schedule.startDate && new Date(schedule.startDate).getTime() > parseDateKey(todayKey).getTime()) {
    return false;
  }
  if (schedule.endDate) {
    const endBoundary = combineDateAndTime(new Date(schedule.endDate).toISOString().slice(0, 10), schedule.endTime);
    if (now.getTime() > endBoundary.getTime()) return false;
  }
  const start = combineDateAndTime(todayKey, schedule.startTime);
  const end = combineDateAndTime(todayKey, schedule.endTime);
  return now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
}

function assertWindowOpenForUse(record, now = new Date()) {
  if (record?.status?.current === 'CANCELLED') {
    throw createHttpError(409, 'AUTHORIZATION_CANCELLED', 'Authorization has been cancelled');
  }

  if (isExpired(record, now) || record?.status?.current === 'EXPIRED') {
    throw createHttpError(409, 'AUTHORIZATION_EXPIRED', 'Authorization has expired');
  }

  if (record?.schedule?.type === 'DAILY') {
    if (!isWithinDailyWindow(record, now)) {
      throw createHttpError(409, 'AUTHORIZATION_OUTSIDE_VALID_WINDOW', 'Authorization is outside the valid time window');
    }
    return;
  }

  if (record?.schedule?.validFromAt && new Date(record.schedule.validFromAt).getTime() > now.getTime()) {
    throw createHttpError(409, 'AUTHORIZATION_NOT_ACTIVE_YET', 'Authorization is not active yet');
  }

  if (record?.schedule?.validUntilAt && new Date(record.schedule.validUntilAt).getTime() < now.getTime()) {
    throw createHttpError(409, 'AUTHORIZATION_EXPIRED', 'Authorization has expired');
  }
}

function decorateAuthorization(record, actor, user) {
  const status = record?.status?.current || 'ACTIVE';
  const otpVerificationStatus = getOtpVerificationStatus(record);
  const isCurrentlyValid = status === 'ACTIVE' && !isExpired(record) && (record?.schedule?.type !== 'DAILY' || isWithinDailyWindow(record));
  const isOwnerOrAdmin = Boolean(actor && (actor.role === 'owner' || actor.role === 'admin' || actor.accessLevel === 'full'));
  const isCreator = Boolean(user && String(record.createdByUserId) === String(user._id));
  const canRevoke = status === 'ACTIVE' && (isOwnerOrAdmin || isCreator);
  const canMarkUsed = status === 'ACTIVE';
  const completedAt = record?.status?.usedAt || record?.usage?.lastUsedAt || null;

  return {
    _id: record._id,
    id: String(record._id),
    name: record.name,
    accessCode: record.accessCode,
    deliveryPersonName: record.deliveryPersonName || '',
    linkedDeliveryId: record.linkedDeliveryId || null,

    scheduleType: record.schedule?.type || 'TODAY',
    scheduleTypeLabel: formatScheduleTypeLabel(record.schedule?.type),
    startDate: record.schedule?.startDate ? new Date(record.schedule.startDate).toISOString().slice(0, 10) : null,
    endDate: record.schedule?.endDate ? new Date(record.schedule.endDate).toISOString().slice(0, 10) : null,
    startTime: record.schedule?.startTime || '',
    endTime: record.schedule?.endTime || '',
    timezone: record.schedule?.timezone || 'UTC',
    validFromAt: record.schedule?.validFromAt || null,
    validUntilAt: record.schedule?.validUntilAt || null,
    validDateLabel: formatDateRangeLabel(record.schedule),
    validTimeWindow: formatTimeWindowLabel(record.schedule),
    timeWindowLabel: formatTimeWindowLabel(record.schedule),

    status,
    statusLabel: formatStatusLabel(status),
    statusColor: formatStatusColor(status),
    statusReason: record.status?.reason || '',
    createdAt: record.createdAt || null,
    createdDateLabel: formatDateTimeLabel(record.createdAt),
    usedAt: completedAt,
    usedDateLabel: formatDateTimeLabel(completedAt),
    expiredAt: record.status?.expiredAt || null,
    revokedAt: record.status?.revokedAt || null,

    otpVerificationStatus,
    otpVerificationLabel: getOtpVerificationLabel(otpVerificationStatus),
    verification: {
      method: record.verification?.method || 'access_code',
      otpRequired: Boolean(record.verification?.otpRequired),
      otpVerified: Boolean(record.verification?.otpVerified),
      otpVerifiedAt: record.verification?.otpVerifiedAt || null,
      status: record.verification?.status || (record.verification?.otpRequired ? 'pending' : 'not_required'),
    },

    usage: {
      singleUse: Boolean(record.usage?.singleUse),
      usesCount: Number(record.usage?.usesCount || 0),
      maxUses: Number(record.usage?.maxUses || 1),
      firstUsedAt: record.usage?.firstUsedAt || null,
      lastUsedAt: record.usage?.lastUsedAt || null,
      usedByDeliveryId: record.usage?.usedByDeliveryId || null,
      usedByDeviceId: record.usage?.usedByDeviceId || null,
      usedByName: record.usage?.usedByName || '',
    },

    details: {
      company: record.details?.company || '',
      purpose: record.details?.purpose || '',
      note: record.details?.note || '',
      sourceScreen: record.details?.sourceScreen || 'authorization_create',
      tags: Array.isArray(record.details?.tags) ? record.details.tags : [],
    },

    canRevoke,
    canMarkUsed,
    isCurrentlyValid,
  };
}

async function resolveActorContext(user) {
  const homeId = resolveHomeId(user);
  if (!homeId) {
    throw createHttpError(401, 'INVALID_USER_HOME', 'Invalid user home');
  }

  if (!user.primaryHomeId) {
    await User.updateOne({ _id: user._id }, { $set: { primaryHomeId: homeId } });
    // eslint-disable-next-line no-param-reassign
    user.primaryHomeId = homeId;
  }

  let actor = await FamilyMember.findOne({ homeId, userId: user._id, status: 'active' });
  if (!actor) {
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

  if (actor.status !== 'active') {
    throw createHttpError(403, 'FORBIDDEN', 'Forbidden');
  }

  return { homeId, actor };
}

function assertCanCreate(actor) {
  if (!actor || actor.status !== 'active') {
    throw createHttpError(403, 'FORBIDDEN', 'Forbidden');
  }
  if (actor.accessLevel === 'nfc_only') {
    throw createHttpError(403, 'AUTHORIZATION_CREATE_NOT_ALLOWED', 'Authorization creation not allowed for this member');
  }
}

function assertCanRead(actor) {
  if (!actor || actor.status !== 'active') {
    throw createHttpError(403, 'FORBIDDEN', 'Forbidden');
  }
}

function assertCanRevoke(actor, record, user) {
  const canManage = actor && (actor.role === 'owner' || actor.role === 'admin' || actor.accessLevel === 'full');
  const isCreator = String(record.createdByUserId) === String(user._id);
  if (!canManage && !isCreator) {
    throw createHttpError(403, 'FORBIDDEN', 'Forbidden');
  }
}

async function assertDeliveryInHome(homeId, deliveryId) {
  if (!deliveryId) return null;
  const _id = toObjectId(deliveryId);
  if (!_id) {
    throw createHttpError(400, 'INVALID_DELIVERY_ID', 'Invalid delivery id');
  }
  const delivery = await Delivery.findOne({ _id, homeId }).select('_id homeId').lean();
  if (!delivery) {
    throw createHttpError(404, 'DELIVERY_NOT_FOUND', 'Linked delivery not found');
  }
  return _id;
}

async function expireStaleAuthorizations(homeId) {
  const now = new Date();
  const result = await Authorization.updateMany(
    {
      homeId,
      'status.current': 'ACTIVE',
      'schedule.validUntilAt': { $exists: true, $ne: null, $lt: now },
    },
    {
      $set: {
        'status.current': 'EXPIRED',
        'status.reason': 'auto_expired',
        'status.expiredAt': now,
      },
    }
  );
  if (result.modifiedCount) {
    safeLog('[AUTHORIZATION][EXPIRE]', 'stale authorizations expired', { homeId: String(homeId), count: result.modifiedCount });
  }
}

async function expireIfNeeded(homeId, authorizationId) {
  const now = new Date();
  await Authorization.updateOne(
    {
      _id: authorizationId,
      homeId,
      'status.current': 'ACTIVE',
      'schedule.validUntilAt': { $exists: true, $ne: null, $lt: now },
    },
    {
      $set: {
        'status.current': 'EXPIRED',
        'status.reason': 'auto_expired',
        'status.expiredAt': now,
      },
    }
  );
}

async function generateUniqueAccessCode(homeId, preferredCode) {
  await expireStaleAuthorizations(homeId);

  if (preferredCode) {
    const existingPreferred = await Authorization.findOne({
      homeId,
      accessCode: String(preferredCode),
      'status.current': 'ACTIVE',
    })
      .select('_id')
      .lean();

    if (existingPreferred) {
      throw createHttpError(409, 'ACCESS_CODE_ALREADY_IN_USE', 'Access code already in use');
    }
    return String(preferredCode);
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = String(crypto.randomInt(1000, 10000));
    const exists = await Authorization.findOne({ homeId, accessCode: candidate, 'status.current': 'ACTIVE' })
      .select('_id')
      .lean();
    if (!exists) return candidate;
  }

  throw createHttpError(503, 'ACCESS_CODE_UNAVAILABLE', 'Unable to generate access code right now');
}

function buildSchedule(payload) {
  const today = utcTodayKey();
  let startDate = payload.startDate;
  let endDate = payload.endDate;

  if (payload.scheduleType === 'TODAY') {
    startDate = startDate || today;
    endDate = endDate || startDate;
  }

  if (payload.scheduleType === 'CUSTOM') {
    if (!startDate || !endDate) {
      throw createHttpError(400, 'CUSTOM_SCHEDULE_DATES_REQUIRED', 'Custom schedule requires startDate and endDate');
    }
  }

  if (payload.scheduleType === 'DAILY') {
    startDate = startDate || today;
    endDate = endDate || null;
  }

  if (!startDate) {
    throw createHttpError(400, 'START_DATE_REQUIRED', 'startDate is required');
  }

  const validFromAt = combineDateAndTime(startDate, payload.startTime);
  const validUntilAt = endDate ? combineDateAndTime(endDate, payload.endTime) : null;

  if (validUntilAt && validUntilAt.getTime() <= validFromAt.getTime()) {
    throw createHttpError(400, 'INVALID_TIME_WINDOW', 'Invalid authorization time window');
  }

  return {
    type: payload.scheduleType,
    startDate: parseDateKey(startDate),
    endDate: endDate ? parseDateKey(endDate) : null,
    startTime: payload.startTime,
    endTime: payload.endTime,
    timezone: payload.timezone || 'UTC',
    validFromAt,
    validUntilAt,
  };
}

function buildUsage(payload) {
  const singleUse = typeof payload.singleUse === 'boolean'
    ? payload.singleUse
    : payload.scheduleType !== 'DAILY';

  const maxUses = singleUse ? 1 : Number(payload.maxUses || 999999);

  return {
    singleUse,
    usesCount: 0,
    maxUses,
  };
}

function buildListFilter(homeId, query) {
  const filter = { homeId };

  if (query.status && query.status !== 'ALL') {
    filter['status.current'] = query.status;
  }

  if (query.scheduleType) {
    filter['schedule.type'] = query.scheduleType;
  }

  if (query.linkedDeliveryId) {
    filter.linkedDeliveryId = toObjectId(query.linkedDeliveryId);
  }

  if (query.month) {
    const { start, end } = resolveMonthBounds(query.month);
    filter.$or = [
      { 'schedule.validFromAt': { $gte: start, $lt: end } },
      { createdAt: { $gte: start, $lt: end } },
    ];
  }

  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), 'i');
    const searchOr = [
      { name: regex },
      { accessCode: regex },
      { deliveryPersonName: regex },
      { 'details.company': regex },
      { 'details.purpose': regex },
      { 'details.note': regex },
    ];

    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
      delete filter.$or;
    } else {
      filter.$or = searchOr;
    }
  }

  return filter;
}

async function getSummaryInternal(homeId, query) {
  const baseFilter = buildListFilter(homeId, { ...query, status: 'ALL', page: 1, limit: 1 });
  const [total, active, used, expired, cancelled] = await Promise.all([
    Authorization.countDocuments(baseFilter),
    Authorization.countDocuments({ ...baseFilter, 'status.current': 'ACTIVE' }),
    Authorization.countDocuments({ ...baseFilter, 'status.current': 'USED' }),
    Authorization.countDocuments({ ...baseFilter, 'status.current': 'EXPIRED' }),
    Authorization.countDocuments({ ...baseFilter, 'status.current': 'CANCELLED' }),
  ]);

  return {
    total,
    active,
    used,
    completed: used,
    expired,
    cancelled,
  };
}

async function getAuthorizationRecord(user, authorizationId, { forWrite = false } = {}) {
  const { homeId, actor } = await resolveActorContext(user);
  assertCanRead(actor);
  const _id = assertAuthorizationId(authorizationId);

  await expireIfNeeded(homeId, _id);

  const record = forWrite
    ? await Authorization.findOne({ _id, homeId })
    : await Authorization.findOne({ _id, homeId }).lean();

  if (!record) {
    throw createHttpError(404, 'AUTHORIZATION_NOT_FOUND', 'Authorization not found');
  }

  return { homeId, actor, record };
}

async function createAuthorization(user, payload) {
  const { homeId, actor } = await resolveActorContext(user);
  assertCanCreate(actor);

  const linkedDeliveryId = await assertDeliveryInHome(homeId, payload.linkedDeliveryId);
  const accessCode = await generateUniqueAccessCode(homeId, payload.accessCode);
  const schedule = buildSchedule(payload);
  if (schedule.validUntilAt && schedule.validUntilAt.getTime() < Date.now()) {
    throw createHttpError(400, 'AUTHORIZATION_WINDOW_ALREADY_PASSED', 'Authorization time window has already passed');
  }
  const usage = buildUsage(payload);
  const verification = {
    method: payload.otpRequired ? 'otp' : 'access_code',
    otpRequired: Boolean(payload.otpRequired),
    otpVerified: false,
    status: payload.otpRequired ? 'pending' : 'not_required',
  };

  const doc = await Authorization.create({
    homeId,
    createdByUserId: user._id,
    createdByMemberId: actor._id,
    linkedDeliveryId,
    name: payload.name,
    accessCode,
    deliveryPersonName: payload.deliveryPersonName || '',
    schedule,
    status: { current: 'ACTIVE', reason: '' },
    verification,
    usage,
    details: {
      company: payload.company || '',
      purpose: payload.purpose || 'delivery',
      note: payload.note || '',
      sourceScreen: payload.sourceScreen || 'authorization_create',
      tags: payload.tags || [],
    },
  });

  await writeAudit({
    scope: 'authorization',
    action: 'create',
    status: 'success',
    userId: user._id,
    details: { authorizationId: doc._id, homeId, scheduleType: doc.schedule.type },
  });

  safeLog('[AUTHORIZATION][CREATE]', 'authorization created', {
    authorizationId: String(doc._id),
    homeId: String(homeId),
    createdByUserId: String(user._id),
  });

  return decorateAuthorization(doc.toObject(), actor, user);
}

async function previewAccessCode(user) {
  const { homeId } = await resolveActorContext(user);
  const accessCode = await generateUniqueAccessCode(homeId);
  return {
    accessCode,
    length: accessCode.length,
  };
}

async function listAuthorizations(user, query) {
  const { homeId, actor } = await resolveActorContext(user);
  assertCanRead(actor);
  await expireStaleAuthorizations(homeId);

  const page = Number(query.page || 1);
  const limit = Number(query.limit || 10);
  const filter = buildListFilter(homeId, query);
  const sortOrder = String(query.sortOrder || 'DESC') === 'ASC' ? 1 : -1;

  const [totalItems, items, summary] = await Promise.all([
    Authorization.countDocuments(filter),
    Authorization.find(filter)
      .sort({ createdAt: sortOrder, _id: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    getSummaryInternal(homeId, query),
  ]);

  return {
    summary,
    filters: {
      selectedStatus: query.status || 'ALL',
      selectedScheduleType: query.scheduleType || 'ALL',
      selectedMonth: query.month || null,
      search: query.search || '',
    },
    items: items.map((item) => decorateAuthorization(item, actor, user)),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit) || 1,
      hasNextPage: page * limit < totalItems,
    },
  };
}

async function getActivityLog(user, query) {
  return listAuthorizations(user, query);
}

async function getAuthorizationSummary(user, query) {
  const { homeId, actor } = await resolveActorContext(user);
  assertCanRead(actor);
  await expireStaleAuthorizations(homeId);
  return getSummaryInternal(homeId, query);
}

async function getAuthorizationById(user, authorizationId) {
  const { actor, record } = await getAuthorizationRecord(user, authorizationId, { forWrite: false });
  return decorateAuthorization(record, actor, user);
}

async function markAuthorizationUsed(user, authorizationId, payload) {
  const { record, actor, homeId } = await getAuthorizationRecord(user, authorizationId, { forWrite: true });

  if (isExpired(record)) {
    record.status.current = 'EXPIRED';
    record.status.reason = 'auto_expired';
    record.status.expiredAt = new Date();
    await record.save();
    throw createHttpError(409, 'AUTHORIZATION_EXPIRED', 'Authorization has expired');
  }

  assertWindowOpenForUse(record);

  if (record.status.current === 'USED' && record.usage?.singleUse) {
    return decorateAuthorization(record.toObject(), actor, user);
  }

  if (payload.linkedDeliveryId) {
    record.linkedDeliveryId = await assertDeliveryInHome(homeId, payload.linkedDeliveryId);
  }

  if (payload.deliveryPersonName) {
    record.deliveryPersonName = payload.deliveryPersonName;
  }

  if (payload.verificationMethod) {
    record.verification.method = payload.verificationMethod;
  }

  if (typeof payload.otpVerified === 'boolean') {
    record.verification.otpVerified = payload.otpVerified;
    record.verification.otpVerifiedAt = payload.otpVerified ? new Date() : null;
    record.verification.status = payload.otpVerified ? 'verified' : (record.verification.otpRequired ? 'pending' : 'not_required');
  }

  const now = new Date();
  record.usage.usesCount = Number(record.usage?.usesCount || 0) + 1;
  record.usage.firstUsedAt = record.usage.firstUsedAt || now;
  record.usage.lastUsedAt = now;
  record.usage.usedByDeliveryId = record.linkedDeliveryId || record.usage.usedByDeliveryId;
  record.usage.usedByDeviceId = payload.usedByDeviceId || record.usage.usedByDeviceId;
  record.usage.usedByName = payload.usedByName || payload.deliveryPersonName || record.deliveryPersonName || record.usage.usedByName;

  const reachedLimit = record.usage.singleUse || record.usage.usesCount >= Number(record.usage.maxUses || 1);
  if (reachedLimit) {
    record.status.current = 'USED';
    record.status.reason = 'authorization_consumed';
    record.status.usedAt = now;
  }

  await record.save();

  await writeAudit({
    scope: 'authorization',
    action: 'use',
    status: 'success',
    userId: user._id,
    details: { authorizationId: record._id, homeId, status: record.status.current },
  });

  safeLog('[AUTHORIZATION][USE]', 'authorization marked used', {
    authorizationId: String(record._id),
    homeId: String(homeId),
    status: record.status.current,
  });

  return decorateAuthorization(record.toObject(), actor, user);
}

async function revokeAuthorization(user, authorizationId, payload) {
  const { record, actor, homeId } = await getAuthorizationRecord(user, authorizationId, { forWrite: true });
  assertCanRevoke(actor, record, user);

  if (record.status.current === 'USED') {
    throw createHttpError(409, 'AUTHORIZATION_ALREADY_COMPLETED', 'Completed authorization cannot be revoked');
  }

  if (record.status.current === 'EXPIRED') {
    throw createHttpError(409, 'AUTHORIZATION_ALREADY_EXPIRED', 'Expired authorization cannot be revoked');
  }

  if (record.status.current === 'CANCELLED') {
    return decorateAuthorization(record.toObject(), actor, user);
  }

  record.status.current = 'CANCELLED';
  record.status.reason = payload.reason || 'revoked_by_user';
  record.status.revokedAt = new Date();
  await record.save();

  await writeAudit({
    scope: 'authorization',
    action: 'revoke',
    status: 'success',
    userId: user._id,
    details: { authorizationId: record._id, homeId },
  });

  safeLog('[AUTHORIZATION][REVOKE]', 'authorization revoked', {
    authorizationId: String(record._id),
    homeId: String(homeId),
  });

  return decorateAuthorization(record.toObject(), actor, user);
}

module.exports = {
  createAuthorization,
  previewAccessCode,
  listAuthorizations,
  getActivityLog,
  getAuthorizationSummary,
  getAuthorizationById,
  markAuthorizationUsed,
  revokeAuthorization,
  __test__: {
    buildSchedule,
    buildUsage,
    decorateAuthorization,
    isExpired,
    formatTimeWindowLabel,
    formatDateRangeLabel,
    formatStatusLabel,
  },
};
