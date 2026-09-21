const crypto = require('crypto');

const DeliverySchedule = require('../models/DeliverySchedule');
const DeliveryNotificationEvent = require('../models/DeliveryNotificationEvent');
const smsParserService = require('./smsParser.service');
const { logs } = require('../utils/logger');

const ANDROID_PACKAGE_NAME_REGEX = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;

const ACTIVE_STATUSES = ['initiated', 'arriving_soon', 'out_for_delivery', 'upon_arrival'];
const STATUS_PRIORITY = {
  initiated: 1,
  scheduled: 1,
  arriving_soon: 2,
  out_for_delivery: 3,
  upon_arrival: 4,
  failed: 5,
};

function createHttpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function clean(value, max = 160) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeCompany(value) {
  return clean(value, 80).toLowerCase().replace(/\s+/g, '_') || 'notification';
}

function normalizeReference(value, fallbackHash) {
  const reference = clean(value, 120)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
  if (reference && /\d/.test(reference) && reference.length >= 3) {
    return reference;
  }
  return buildDisplayReferenceId(fallbackHash);
}

function buildDisplayReferenceId(hash) {
  const digits = String(hash || '')
    .split('')
    .map(char => (parseInt(char, 16) || 0) % 10)
    .join('')
    .padEnd(10, '0')
    .slice(0, 10);
  return `DLV${digits}`;
}

function isValidNotificationSourcePackage(sourcePackage) {
  if (!ANDROID_PACKAGE_NAME_REGEX.test(sourcePackage)) {
    logs.error('[DeliveryNotification] invalid source package rejected', { sourcePackage });
    return false;
  }

  logs.info('[DeliveryNotification] source package accepted', { sourcePackage });
  return true;
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeIncomingStatus(status) {
  const value = clean(status, 40).toLowerCase();
  if (value === 'out_for_delivery') return 'out_for_delivery';
  if (value === 'arriving_soon') return 'arriving_soon';
  if (value === 'scheduled') return 'scheduled';
  if (value === 'failed') return 'failed';
  if (value === 'delivered') return 'delivered';
  return 'initiated';
}

function toScheduleStatus(incomingStatus, currentStatus) {
  if (incomingStatus === 'delivered') {
    return currentStatus && currentStatus !== 'delivered' ? currentStatus : 'initiated';
  }
  if (incomingStatus === 'scheduled') return 'initiated';
  if (incomingStatus === 'failed') return 'failed';
  return incomingStatus || 'initiated';
}

function chooseNextStatus(currentStatus, incomingStatus) {
  const current = currentStatus || 'initiated';
  const next = toScheduleStatus(incomingStatus, current);
  const currentPriority = STATUS_PRIORITY[current] || 0;
  const nextPriority = STATUS_PRIORITY[next] || 0;
  return nextPriority >= currentPriority ? next : current;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function createPayloadHash(payload) {
  const canonical = {
    sourcePackage: clean(payload.sourcePackage, 160),
    notificationPostedAt: payload.notificationPostedAt,
    merchantName: clean(payload.merchantName, 80),
    courierName: clean(payload.courierName, 80),
    orderTrackingId: clean(payload.orderTrackingId, 120),
    deliveryDate: payload.deliveryDate || '',
    deliveryTimeWindow: clean(payload.deliveryTimeWindow, 80),
    deliveryStatus: normalizeIncomingStatus(payload.deliveryStatus),
    needsConfirmation: Boolean(payload.needsConfirmation),
    confidence: Number(payload.confidence || 0),
    timezone: clean(payload.timezone, 80),
    keywordMatches: Array.isArray(payload.keywordMatches)
      ? payload.keywordMatches.map(item => clean(item, 40)).filter(Boolean).sort()
      : [],
  };
  return crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.name === 'MongoServerError');
}

function buildEventPayload(homeId, scheduleId, payload, payloadHash, confirmationRequired) {
  return {
    homeId,
    deliveryScheduleId: scheduleId || null,
    hashedNotificationId: clean(payload.hashedNotificationId, 128).toLowerCase(),
    payloadHash,
    sourcePackage: clean(payload.sourcePackage, 160),
    notificationPostedAt: safeDate(payload.notificationPostedAt) || new Date(),
    merchantName: clean(payload.merchantName, 80),
    courierName: clean(payload.courierName, 80),
    orderTrackingId: clean(payload.orderTrackingId, 120),
    deliveryDate: safeDate(payload.deliveryDate),
    deliveryTimeWindow: clean(payload.deliveryTimeWindow, 80),
    deliveryStatus: normalizeIncomingStatus(payload.deliveryStatus),
    confirmationRequired,
    confidence: Math.max(0, Math.min(100, Number(payload.confidence || 0))),
    timezone: clean(payload.timezone, 80),
    keywordMatches: Array.isArray(payload.keywordMatches)
      ? payload.keywordMatches.map(item => clean(item, 40)).filter(Boolean).slice(0, 30)
      : [],
  };
}

async function findExistingDuplicate(homeId, hashedNotificationId, payloadHash) {
  const existingEvent = await DeliveryNotificationEvent.findOne({
    homeId,
    hashedNotificationId: clean(hashedNotificationId, 128).toLowerCase(),
  });

  if (!existingEvent) return null;

  if (existingEvent.payloadHash !== payloadHash) {
    throw createHttpError(
      409,
      'IDEMPOTENCY_KEY_REUSED',
      'Notification id was reused with different payload data'
    );
  }

  const schedule = existingEvent.deliveryScheduleId
    ? await DeliverySchedule.findOne({ _id: existingEvent.deliveryScheduleId, homeId })
    : null;
  logs.info('[DeliveryNotification] duplicate notification returned original response', {
    scheduleId: schedule ? String(schedule._id) : null,
  });
  return { event: existingEvent, schedule };
}

async function upsertScheduleForEvent(homeId, payload, payloadHash) {
  const sourcePackage = clean(payload.sourcePackage, 160);
  if (!isValidNotificationSourcePackage(sourcePackage)) {
    throw createHttpError(400, 'INVALID_NOTIFICATION_SOURCE', 'Invalid notification source');
  }

  const company = normalizeCompany(payload.merchantName || payload.courierName || 'notification');
  const referenceId = normalizeReference(payload.orderTrackingId, payload.hashedNotificationId || payloadHash);
  const expectedDate = safeDate(payload.deliveryDate);
  const deliveryTimeWindow = clean(payload.deliveryTimeWindow, 80);
  const incomingStatus = normalizeIncomingStatus(payload.deliveryStatus);
  const confirmationRequired = Boolean(
    payload.needsConfirmation ||
      !expectedDate ||
      !deliveryTimeWindow ||
      incomingStatus === 'delivered'
  );
  const scheduleGroupId = smsParserService.generateScheduleGroupId(company, referenceId);
  const now = new Date();

  let schedule = await DeliverySchedule.findOne({
    homeId,
    currentStatus: { $in: ACTIVE_STATUSES },
    $or: [
      { scheduleGroupId },
      { referenceId },
      { awbNumber: referenceId },
      { orderHint: referenceId },
    ],
  }).sort({ updatedAt: -1, createdAt: -1 });

  const isNewSchedule = !schedule;
  if (!schedule) {
    schedule = new DeliverySchedule({
      homeId,
      source: 'notification',
      scheduleGroupId,
      referenceId,
      deliveryCompany: company,
      currentStatus: toScheduleStatus(incomingStatus, 'initiated'),
      customerName: '',
      expectedDeliveryDate: expectedDate,
      deliveryTimeWindow,
      scheduledAt: now,
      confirmationRequired,
      reminderLeadMinutes: payload.reminderLeadMinutes || 60,
      latestSmsId: null,
      smsIds: [],
      smsCount: 0,
      statusHistory: [],
      notificationSourcePackage: sourcePackage,
      notificationEventCount: 0,
      notificationEventIds: [],
    });
  }

  schedule.source = schedule.source === 'sms' && !schedule.smsCount ? 'notification' : schedule.source;
  schedule.scheduleGroupId = schedule.scheduleGroupId || scheduleGroupId;
  schedule.referenceId = schedule.referenceId || referenceId;
  schedule.deliveryCompany = schedule.deliveryCompany && schedule.deliveryCompany !== 'unknown'
    ? schedule.deliveryCompany
    : company;
  schedule.currentStatus = chooseNextStatus(schedule.currentStatus, incomingStatus);
  schedule.notificationSourcePackage = sourcePackage;
  schedule.confirmationRequired = Boolean(schedule.confirmationRequired || confirmationRequired);
  schedule.reminderLeadMinutes = payload.reminderLeadMinutes || schedule.reminderLeadMinutes || 60;

  if (expectedDate) schedule.expectedDeliveryDate = expectedDate;
  if (deliveryTimeWindow) schedule.deliveryTimeWindow = deliveryTimeWindow;
  if (referenceId && !schedule.orderHint) schedule.orderHint = referenceId;
  if (clean(payload.merchantName, 80) && !schedule.sellerName) {
    schedule.sellerName = clean(payload.merchantName, 80);
  }
  if (!schedule.productSummary && clean(payload.merchantName, 80)) {
    schedule.productSummary = `${clean(payload.merchantName, 80)} delivery`;
  }

  const messageSummary = incomingStatus === 'delivered'
    ? 'Delivery notification reported delivered; awaiting confirmation'
    : 'Delivery notification captured from monitored app';
  schedule.statusHistory = Array.isArray(schedule.statusHistory) ? schedule.statusHistory : [];
  schedule.statusHistory.push({
    status: schedule.currentStatus,
    updatedAt: now,
    smsId: null,
    messageSummary,
  });

  await schedule.save();
  logs.info('[DeliveryNotification] schedule upserted from notification', {
    scheduleId: String(schedule._id),
    isNewSchedule,
    confirmationRequired: schedule.confirmationRequired,
  });

  return { schedule, isNewSchedule, confirmationRequired: schedule.confirmationRequired };
}

async function ingestNotification(homeId, payload) {
  const payloadHash = createPayloadHash(payload);
  const duplicate = await findExistingDuplicate(homeId, payload.hashedNotificationId, payloadHash);
  if (duplicate) {
    return {
      duplicate: true,
      event: duplicate.event,
      schedule: duplicate.schedule,
      scheduleUpdated: false,
      scheduleIsNew: false,
    };
  }

  const { schedule, isNewSchedule, confirmationRequired } = await upsertScheduleForEvent(
    homeId,
    payload,
    payloadHash
  );

  let event;
  try {
    event = await DeliveryNotificationEvent.create(
      buildEventPayload(homeId, schedule._id, payload, payloadHash, confirmationRequired)
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const duplicateAfterRace = await findExistingDuplicate(
      homeId,
      payload.hashedNotificationId,
      payloadHash
    );
    if (!duplicateAfterRace) throw error;
    return {
      duplicate: true,
      event: duplicateAfterRace.event,
      schedule: duplicateAfterRace.schedule,
      scheduleUpdated: false,
      scheduleIsNew: false,
    };
  }

  schedule.latestNotificationEventId = event._id;
  if (!schedule.notificationEventIds.some(id => String(id) === String(event._id))) {
    schedule.notificationEventIds.push(event._id);
  }
  schedule.notificationEventCount = schedule.notificationEventIds.length;
  await schedule.save();

  logs.info('[DeliveryNotification] notification event stored', {
    eventId: String(event._id),
    scheduleId: String(schedule._id),
  });

  return {
    duplicate: false,
    event,
    schedule,
    scheduleUpdated: true,
    scheduleIsNew: isNewSchedule,
  };
}

async function listConfirmationRequired(homeId) {
  const deliveries = await DeliverySchedule.find({
    homeId,
    confirmationRequired: true,
    currentStatus: { $in: ACTIVE_STATUSES },
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(50)
    .lean();
  logs.info('[DeliveryNotification] confirmation-required deliveries listed', {
    homeId: String(homeId),
    count: deliveries.length,
  });
  return deliveries;
}

async function updateSchedule(homeId, scheduleId, payload) {
  const schedule = await DeliverySchedule.findOne({ _id: scheduleId, homeId });
  if (!schedule) {
    throw createHttpError(404, 'DELIVERY_SCHEDULE_NOT_FOUND', 'Delivery schedule not found');
  }

  if (payload.deliveryCompany !== undefined) schedule.deliveryCompany = normalizeCompany(payload.deliveryCompany);
  if (payload.referenceId !== undefined) schedule.referenceId = normalizeReference(payload.referenceId, schedule.referenceId);
  if (payload.orderHint !== undefined) schedule.orderHint = clean(payload.orderHint, 120);
  if (payload.awbNumber !== undefined) schedule.awbNumber = clean(payload.awbNumber, 120).toUpperCase();
  if (payload.expectedDeliveryDate !== undefined) schedule.expectedDeliveryDate = safeDate(payload.expectedDeliveryDate);
  if (payload.deliveryTimeWindow !== undefined) schedule.deliveryTimeWindow = clean(payload.deliveryTimeWindow, 80);
  if (payload.productSummary !== undefined) schedule.productSummary = clean(payload.productSummary, 160);
  if (payload.sellerName !== undefined) schedule.sellerName = clean(payload.sellerName, 120);
  if (payload.riderName !== undefined) schedule.riderName = clean(payload.riderName, 120);
  if (payload.riderPhone !== undefined) schedule.riderPhone = clean(payload.riderPhone, 30);
  if (payload.reminderLeadMinutes !== undefined) schedule.reminderLeadMinutes = Number(payload.reminderLeadMinutes);

  schedule.confirmationRequired = Boolean(
    schedule.confirmationRequired ||
      !schedule.expectedDeliveryDate ||
      !schedule.deliveryTimeWindow
  );
  schedule.updatedAt = new Date();
  schedule.statusHistory.push({
    status: schedule.currentStatus,
    updatedAt: new Date(),
    smsId: null,
    messageSummary: 'Delivery schedule updated by user',
  });
  await schedule.save();
  logs.info('[DeliveryNotification] delivery schedule updated', { scheduleId: String(schedule._id) });
  return schedule;
}

async function confirmSchedule(homeId, scheduleId, payload) {
  const schedule = await DeliverySchedule.findOne({ _id: scheduleId, homeId });
  if (!schedule) {
    throw createHttpError(404, 'DELIVERY_SCHEDULE_NOT_FOUND', 'Delivery schedule not found');
  }

  const expectedDate = safeDate(payload.expectedDeliveryDate);
  if (!expectedDate) {
    throw createHttpError(400, 'INVALID_DELIVERY_DATE', 'Invalid delivery date');
  }

  schedule.expectedDeliveryDate = expectedDate;
  schedule.deliveryTimeWindow = clean(payload.deliveryTimeWindow, 80);
  schedule.confirmationRequired = false;
  schedule.confirmedAt = new Date();
  schedule.reminderLeadMinutes = payload.reminderLeadMinutes || schedule.reminderLeadMinutes || 60;
  schedule.statusHistory.push({
    status: schedule.currentStatus,
    updatedAt: new Date(),
    smsId: null,
    messageSummary: 'Delivery schedule confirmed by user',
  });
  await schedule.save();

  await DeliveryNotificationEvent.updateMany(
    { homeId, deliveryScheduleId: schedule._id },
    { $set: { confirmationRequired: false } }
  );
  logs.info('[DeliveryNotification] delivery schedule confirmed', { scheduleId: String(schedule._id) });
  return schedule;
}

async function deleteSchedule(homeId, scheduleId) {
  const schedule = await DeliverySchedule.findOne({ _id: scheduleId, homeId });
  if (!schedule) {
    throw createHttpError(404, 'DELIVERY_SCHEDULE_NOT_FOUND', 'Delivery schedule not found');
  }

  await DeliverySchedule.deleteOne({ _id: schedule._id, homeId });
  await DeliveryNotificationEvent.updateMany(
    { homeId, deliveryScheduleId: schedule._id },
    { $set: { deliveryScheduleId: null } }
  );
  logs.info('[DeliveryNotification] delivery schedule deleted', { scheduleId: String(schedule._id) });
  return { scheduleId: String(schedule._id) };
}

module.exports = {
  isValidNotificationSourcePackage,
  createPayloadHash,
  ingestNotification,
  listConfirmationRequired,
  updateSchedule,
  confirmSchedule,
  deleteSchedule,
};
