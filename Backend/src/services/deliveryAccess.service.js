const crypto = require('crypto');
const mongoose = require('mongoose');
const Delivery = require('../models/Delivery');
const DropZone = require('../models/DropZone');
const NfcCard = require('../models/NfcCard');
const User = require('../models/User');
const { resolveHomeId } = require('../utils/home');
const { safeLog } = require('../utils/logger');

const ZONE_TYPES = [
  { key: 'locker', label: 'Parcel Locker' },
  { key: 'doorstep', label: 'Front Door' },
  { key: 'reception', label: 'Reception Desk' },
  { key: 'security_desk', label: 'Security Desk' },
  { key: 'garage', label: 'Garage' },
  { key: 'custom', label: 'Custom' },
];

function createHttpError(status, code, message, details) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details) err.details = details;
  return err;
}

async function getHome(user) {
  const homeId = resolveHomeId(user);
  if (!homeId) throw createHttpError(401, 'INVALID_USER', 'Invalid user');
  if (!user.primaryHomeId) {
    await User.updateOne({ _id: user._id }, { $set: { primaryHomeId: homeId } });
    user.primaryHomeId = homeId;
  }
  return homeId;
}

function toObjectId(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(String(value));
}

function maskCode(last4) {
  return last4 ? `****${last4}` : '';
}

function hashAccessCode(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

async function methods(user) {
  const homeId = await getHome(user);
  const activeCard = await NfcCard.findOne({ homeId, status: 'active' }).select('_id');
  return {
    items: [
      { key: 'nfc', label: 'Use NFC Card', enabled: true, available: true, requiresRegisteredCard: true, hasRegisteredCard: !!activeCard },
      { key: 'verify', label: 'Verify Delivery', enabled: true, available: true },
      { key: 'approve_in_app', label: 'Approve via App', enabled: true, available: true },
      { key: 'zones', label: 'Choose Drop Zone', enabled: true, available: true },
    ],
  };
}

async function verifyContext(user, deliveryId) {
  const homeId = await getHome(user);
  const _id = toObjectId(deliveryId);
  if (!_id) throw createHttpError(400, 'INVALID_DELIVERY_ID', 'Invalid delivery id');
  const delivery = await Delivery.findOne({ _id, homeId }).lean();
  if (!delivery) throw createHttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
  if (!['upcoming', 'delivered', 'rejected'].includes(delivery.status)) {
    throw createHttpError(400, 'INVALID_DELIVERY_STATUS', 'Invalid delivery status');
  }
  return {
    deliveryId: String(delivery._id),
    orderId: delivery.orderId,
    verificationCode: delivery.verificationCode || null,
    status: delivery.status,
    verificationStatus: delivery.verificationStatus || 'not_started',
    deliveryType: 'delivery',
    package: {
      title: delivery.title || delivery.orderId || 'Delivery',
      imageUrl: delivery.packageImageUrl || '',
    },
    partner: {
      name: delivery.partnerName || '',
      company: delivery.company || '',
      rating: delivery.partnerRating || 0,
    },
    timeline: {
      date: delivery.scheduledFor || delivery.createdAt || null,
      time: delivery.scheduledFor || delivery.createdAt || null,
    },
    selectedZone: delivery.selectedZoneId ? {
      zoneId: String(delivery.selectedZoneId),
      name: delivery.selectedZoneSnapshot?.name || '',
      type: delivery.selectedZoneSnapshot?.type || '',
      locationDescription: delivery.selectedZoneSnapshot?.locationDescription || '',
    } : null,
    availableMethods: [
      { key: 'nfc_card', label: 'Tap NFC Card' },
      { key: 'approve_in_app', label: 'Approve via App' },
    ],
    currentZoneSelectionRequired: true,
  };
}

async function listZones(user, { status = 'active', search = '' } = {}) {
  const homeId = await getHome(user);
  const query = { homeId };
  if (status && status !== 'all') query.status = status;
  if (search) query.name = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const zones = await DropZone.find(query).sort({ isDefault: -1, usageCount: -1, createdAt: -1 }).lean();
  return {
    items: zones.map((zone) => ({
      zoneId: String(zone._id),
      name: zone.name,
      type: zone.type,
      typeLabel: ZONE_TYPES.find((item) => item.key === zone.type)?.label || zone.type,
      locationDescription: zone.locationDescription || '',
      accessCodeRequired: zone.accessCodeRequired === true,
      maskedAccessCode: maskCode(zone.accessCodeLast4),
      status: zone.status,
      usageCount: zone.usageCount || 0,
      isDefault: zone.isDefault === true,
      createdAt: zone.createdAt,
    })),
    zoneTypes: ZONE_TYPES,
  };
}

async function createZone(user, payload) {
  const homeId = await getHome(user);
  const existing = await DropZone.findOne({ homeId, name: payload.name });
  if (existing) throw createHttpError(409, 'ZONE_NAME_EXISTS', 'Zone with same name already exists');
  const accessCode = String(payload.accessCode || '').trim();
  const doc = await DropZone.create({
    homeId,
    name: payload.name,
    type: payload.type,
    locationDescription: payload.locationDescription || '',
    accessCodeHash: accessCode ? hashAccessCode(accessCode) : '',
    accessCodeLast4: accessCode ? accessCode.slice(-4) : '',
    accessCodeRequired: Boolean(accessCode),
    status: payload.status || 'active',
    isDefault: payload.makeDefault === true,
    createdBy: user._id,
    updatedBy: user._id,
  });
  if (payload.makeDefault === true) {
    await DropZone.updateMany({ homeId, _id: { $ne: doc._id } }, { $set: { isDefault: false } });
  }
  safeLog('[DELIVERY_ACCESS][ZONE_CREATE]', 'drop zone created', { user: String(user._id), home: String(homeId), zone: String(doc._id), type: doc.type });
  return {
    zoneId: String(doc._id),
    name: doc.name,
    type: doc.type,
    locationDescription: doc.locationDescription,
    accessCodeRequired: doc.accessCodeRequired,
    status: doc.status,
    isDefault: doc.isDefault,
  };
}

async function selectZone(user, deliveryId, payload) {
  const homeId = await getHome(user);
  const deliveryObjectId = toObjectId(deliveryId);
  const zoneObjectId = toObjectId(payload.zoneId);
  if (!deliveryObjectId) throw createHttpError(400, 'INVALID_DELIVERY_ID', 'Invalid delivery id');
  if (!zoneObjectId) throw createHttpError(400, 'INVALID_ZONE_ID', 'Invalid zone id');
  const [delivery, zone] = await Promise.all([
    Delivery.findOne({ _id: deliveryObjectId, homeId }),
    DropZone.findOne({ _id: zoneObjectId, homeId }),
  ]);
  if (!delivery) throw createHttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
  if (!zone) throw createHttpError(404, 'ZONE_NOT_FOUND', 'Drop zone not found');
  delivery.selectedZoneId = zone._id;
  delivery.selectedZoneSnapshot = {
    name: zone.name,
    type: zone.type,
    locationDescription: zone.locationDescription || '',
  };
  if (delivery.verificationStatus === 'not_started') delivery.verificationStatus = 'zone_selected';
  await delivery.save();
  await DropZone.updateOne({ _id: zone._id }, { $inc: { usageCount: 1 }, $set: { updatedBy: user._id } });
  safeLog('[DELIVERY_ACCESS][ZONE_SELECT]', 'delivery zone selected', { user: String(user._id), delivery: String(delivery._id), zone: String(zone._id) });
  return {
    deliveryId: String(delivery._id),
    zoneId: String(zone._id),
    zoneName: zone.name,
    verificationStatus: delivery.verificationStatus,
  };
}

async function selectVerificationMethod(user, deliveryId, payload) {
  const homeId = await getHome(user);
  const _id = toObjectId(deliveryId);
  if (!_id) throw createHttpError(400, 'INVALID_DELIVERY_ID', 'Invalid delivery id');
  const delivery = await Delivery.findOne({ _id, homeId });
  if (!delivery) throw createHttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
  delivery.verificationMethod = payload.method === 'nfc_card' ? 'nfc' : 'app';
  if (delivery.verificationStatus === 'not_started' || delivery.verificationStatus === 'zone_selected') {
    delivery.verificationStatus = 'method_selected';
  }
  await delivery.save();
  safeLog('[DELIVERY_ACCESS][METHOD_SELECT]', 'verification method selected', { user: String(user._id), delivery: String(delivery._id), method: delivery.verificationMethod });
  return {
    deliveryId: String(delivery._id),
    method: payload.method,
    verificationStatus: delivery.verificationStatus,
  };
}

async function getZoneStatus(user, zoneId) {
  const homeId = await getHome(user);
  const _id = toObjectId(zoneId);
  if (!_id) throw createHttpError(400, 'INVALID_ZONE_ID', 'Invalid zone id');
  const zone = await DropZone.findOne({ _id, homeId }).lean();
  if (!zone) throw createHttpError(404, 'ZONE_NOT_FOUND', 'Drop zone not found');
  const [deliveryCount, currentAssignedDeliveries] = await Promise.all([
    Delivery.countDocuments({ homeId, selectedZoneId: zone._id }),
    Delivery.countDocuments({ homeId, selectedZoneId: zone._id, status: 'upcoming' }),
  ]);
  return {
    zoneId: String(zone._id),
    name: zone.name,
    status: zone.status,
    deliveryCount,
    lastUsedAt: zone.updatedAt || zone.createdAt,
    currentAssignedDeliveries,
  };
}

module.exports = {
  methods,
  verifyContext,
  listZones,
  createZone,
  selectZone,
  selectVerificationMethod,
  getZoneStatus,
};
