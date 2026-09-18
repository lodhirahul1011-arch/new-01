const crypto = require('crypto');
const NfcCard = require('../models/NfcCard');
const NfcAccessLog = require('../models/NfcAccessLog');
const User = require('../models/User');
const { resolveHomeId } = require('../utils/home');

function hashUid(uid) {
  return crypto.createHash('sha256').update(String(uid).trim()).digest('hex');
}

function buildPreview(uid) {
  const value = String(uid || '').replace(/\s+/g, '');
  return value.slice(-4).toUpperCase();
}

function buildMasked(preview) {
  const last4 = String(preview || '').slice(-4).toUpperCase();
  return `XXX XXX ${last4}`.trim();
}

function formatDateLabel(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatRelativeDateTime(date) {
  if (!date) return 'Never used';
  const d = new Date(date);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${time}`;
}

function statusLabel(status) {
  switch (status) {
    case 'active':
      return 'Active';
    case 'inactive':
      return 'Inactive';
    case 'blocked':
      return 'Blocked';
    case 'removed':
      return 'Removed';
    default:
      return status;
  }
}

function toOverviewCard(card) {
  if (!card) return null;
  return {
    _id: card._id,
    label: card.label,
    serialMasked: card.serialMasked,
    uidPreview: card.uidPreview,
    status: card.status,
    statusLabel: statusLabel(card.status),
    addedOn: card.registeredAt || card.createdAt,
    addedOnLabel: formatDateLabel(card.registeredAt || card.createdAt),
    lastUsedAt: card.lastUsedAt,
    lastUsedLabel: formatRelativeDateTime(card.lastUsedAt),
    totalAccessCount: card.totalAccessCount || 0,
    canRemove: card.status !== 'removed',
  };
}

async function requireUser(userId) {
  const user = await User.findById(userId).select('_id primaryHomeId');
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  return user;
}

async function getHomeContext(userId) {
  const user = await requireUser(userId);
  const homeId = resolveHomeId(user);
  if (!homeId) {
    const err = new Error('Home not resolved for user');
    err.status = 400;
    err.code = 'HOME_NOT_RESOLVED';
    throw err;
  }
  return { user, homeId };
}

async function getActiveCardForHome(homeId) {
  return NfcCard.findOne({ homeId, status: 'active' }).sort({ registeredAt: -1, createdAt: -1 });
}

async function listCardsOverview(userId) {
  const { homeId } = await getHomeContext(userId);
  const activeCard = await getActiveCardForHome(homeId);
  return {
    singleCardLimit: true,
    canAddNew: !activeCard,
    warning: {
      title: 'Single Card Limit',
      message: 'You can register only one NFC card at a time. Remove the existing card to add a new one.',
    },
    registeredCard: toOverviewCard(activeCard),
  };
}

async function listCards(userId) {
  const { homeId } = await getHomeContext(userId);
  const cards = await NfcCard.find({ homeId }).sort({ status: 1, registeredAt: -1, createdAt: -1 });
  return {
    items: cards.map(toOverviewCard),
    summary: {
      total: cards.length,
      active: cards.filter((x) => x.status === 'active').length,
      inactive: cards.filter((x) => x.status === 'inactive').length,
      blocked: cards.filter((x) => x.status === 'blocked').length,
      removed: cards.filter((x) => x.status === 'removed').length,
    },
  };
}

async function createCard(userId, payload) {
  const { homeId } = await getHomeContext(userId);
  const activeCard = await getActiveCardForHome(homeId);
  if (activeCard) {
    const err = new Error('Only one NFC card can be active at a time');
    err.status = 409;
    err.code = 'ACTIVE_NFC_CARD_ALREADY_EXISTS';
    throw err;
  }

  const uidHash = hashUid(payload.uid);
  const existingUid = await NfcCard.findOne({ homeId, uidHash });
  if (existingUid) {
    if (existingUid.status === 'removed') {
      const uidPreview = buildPreview(payload.uid);
      existingUid.userId = userId;
      existingUid.assignedToMemberId = payload.assignedToMemberId || null;
      existingUid.label = payload.label;
      existingUid.cardType = payload.cardType || 'access';
      existingUid.uidPreview = uidPreview;
      existingUid.serialMasked = buildMasked(uidPreview);
      existingUid.status = 'active';
      existingUid.isPrimary = true;
      existingUid.registeredAt = new Date();
      existingUid.lastUsedAt = null;
      existingUid.totalAccessCount = 0;
      existingUid.removeReason = '';
      existingUid.removedAt = null;
      existingUid.meta = {
        source: payload.meta?.source || 'settings_nfc',
        registrationMethod: payload.meta?.registrationMethod || 'manual',
        deviceId: payload.meta?.deviceId || null,
        notes: payload.meta?.notes || '',
      };
      await existingUid.save();
      return toOverviewCard(existingUid);
    }

    const err = new Error('NFC card already registered');
    err.status = 409;
    err.code = 'DUPLICATE_NFC_UID';
    throw err;
  }

  const uidPreview = buildPreview(payload.uid);
  const card = await NfcCard.create({
    userId,
    homeId,
    assignedToMemberId: payload.assignedToMemberId || null,
    label: payload.label,
    cardType: payload.cardType || 'access',
    uidHash,
    uidPreview,
    serialMasked: buildMasked(uidPreview),
    status: 'active',
    isPrimary: true,
    registeredAt: new Date(),
    meta: {
      source: payload.meta?.source || 'settings_nfc',
      registrationMethod: payload.meta?.registrationMethod || 'manual',
      deviceId: payload.meta?.deviceId || null,
      notes: payload.meta?.notes || '',
    },
  });

  return {
    _id: card._id,
    label: card.label,
    serialMasked: card.serialMasked,
    status: card.status,
    addedOnLabel: formatDateLabel(card.registeredAt),
  };
}

async function getCardForHome(homeId, cardId) {
  const card = await NfcCard.findOne({ _id: cardId, homeId });
  if (!card) {
    const err = new Error('NFC card not found');
    err.status = 404;
    err.code = 'NFC_CARD_NOT_FOUND';
    throw err;
  }
  return card;
}

async function updateCard(userId, cardId, patch) {
  const { homeId } = await getHomeContext(userId);
  const card = await getCardForHome(homeId, cardId);
  if (patch.status === 'active') {
    const existingActive = await NfcCard.findOne({ homeId, status: 'active', _id: { $ne: card._id } });
    if (existingActive) {
      const err = new Error('Only one NFC card can be active at a time');
      err.status = 409;
      err.code = 'ACTIVE_NFC_CARD_ALREADY_EXISTS';
      throw err;
    }
  }
  if (patch.label !== undefined) card.label = patch.label;
  if (patch.cardType !== undefined) card.cardType = patch.cardType;
  if (patch.assignedToMemberId !== undefined) card.assignedToMemberId = patch.assignedToMemberId || null;
  if (patch.status !== undefined) card.status = patch.status;
  if (patch.meta?.notes !== undefined) card.meta.notes = patch.meta.notes;
  await card.save();
  return toOverviewCard(card);
}

async function removeCard(userId, cardId) {
  const { homeId } = await getHomeContext(userId);
  const card = await getCardForHome(homeId, cardId);
  card.status = 'removed';
  card.removeReason = 'user_removed';
  card.removedAt = new Date();
  card.isPrimary = false;
  await card.save();
  return { _id: card._id, status: 'removed' };
}

async function verifyAccess(userId, payload, requestMeta = {}) {
  const { homeId } = await getHomeContext(userId);
  const uidHash = hashUid(payload.uid);
  const card = await NfcCard.findOne({ homeId, uidHash }).sort({ createdAt: -1 });

  const baseLog = {
    homeId,
    uidHash,
    nfcCardId: card?._id || null,
    context: {
      flow: payload.flow || 'delivery_access',
      deliveryId: payload.deliveryId || null,
      authorizationId: payload.authorizationId || null,
    },
    deviceId: payload.deviceId || null,
    verifiedBy: requestMeta.verifiedBy || 'api',
    ipAddress: requestMeta.ipAddress || '',
    userAgent: requestMeta.userAgent || '',
    scannedAt: new Date(),
  };

  if (!card) {
    await NfcAccessLog.create({ ...baseLog, result: 'unknown', reasonCode: 'NFC_CARD_NOT_FOUND' });
    const err = new Error('NFC card not recognized');
    err.status = 404;
    err.code = 'NFC_CARD_NOT_FOUND';
    throw err;
  }

  if (card.status === 'blocked') {
    await NfcAccessLog.create({ ...baseLog, result: 'blocked', reasonCode: 'NFC_CARD_BLOCKED' });
    const err = new Error('NFC card is blocked');
    err.status = 403;
    err.code = 'NFC_CARD_BLOCKED';
    throw err;
  }

  if (card.status === 'removed') {
    await NfcAccessLog.create({ ...baseLog, result: 'removed', reasonCode: 'NFC_CARD_REMOVED' });
    const err = new Error('NFC card has been removed');
    err.status = 403;
    err.code = 'NFC_CARD_REMOVED';
    throw err;
  }

  if (card.status !== 'active') {
    await NfcAccessLog.create({ ...baseLog, result: 'denied', reasonCode: 'NFC_ACCESS_DENIED' });
    const err = new Error('NFC access denied');
    err.status = 403;
    err.code = 'NFC_ACCESS_DENIED';
    throw err;
  }

  card.lastUsedAt = new Date();
  card.totalAccessCount = (card.totalAccessCount || 0) + 1;
  await card.save();

  await NfcAccessLog.create({ ...baseLog, nfcCardId: card._id, result: 'success', reasonCode: 'AUTHORIZED' });

  return {
    authorized: true,
    card: {
      _id: card._id,
      label: card.label,
      uidPreview: card.uidPreview,
    },
    usage: {
      lastUsedAt: card.lastUsedAt,
      totalAccessCount: card.totalAccessCount,
    },
    nextStep: 'grant_access',
  };
}

async function listAccessLogs(userId, query = {}) {
  const { homeId } = await getHomeContext(userId);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const findQuery = { homeId };
  if (query.result) findQuery.result = query.result;
  if (query.flow) findQuery['context.flow'] = query.flow;

  const [items, totalItems] = await Promise.all([
    NfcAccessLog.find(findQuery).sort({ scannedAt: -1 }).skip((page - 1) * limit).limit(limit),
    NfcAccessLog.countDocuments(findQuery),
  ]);

  return {
    items: items.map((log) => ({
      _id: log._id,
      result: log.result,
      flow: log.context?.flow || 'delivery_access',
      scannedAt: log.scannedAt,
      scannedAtLabel: formatRelativeDateTime(log.scannedAt),
      deviceId: log.deviceId,
      reasonCode: log.reasonCode,
    })),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      hasNextPage: page * limit < totalItems,
    },
  };
}

module.exports = {
  listCardsOverview,
  listCards,
  createCard,
  updateCard,
  removeCard,
  verifyAccess,
  listAccessLogs,
};
