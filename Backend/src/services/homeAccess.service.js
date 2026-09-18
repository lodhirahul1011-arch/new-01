const mongoose = require('mongoose');

const FamilyMember = require('../models/FamilyMember');
const User = require('../models/User');
const Delivery = require('../models/Delivery');
const { resolveHomeId } = require('../utils/home');

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

  if (!actor || actor.status !== 'active') {
    throw createHttpError(403, 'FORBIDDEN', 'Forbidden');
  }

  return { homeId, actor };
}

function assertCanRead(actor) {
  if (!actor || actor.status !== 'active') {
    throw createHttpError(403, 'FORBIDDEN', 'Forbidden');
  }
}

function assertCanManage(actor) {
  assertCanRead(actor);
  const canManage = actor.role === 'owner' || actor.role === 'admin' || actor.accessLevel === 'full';
  if (!canManage) {
    throw createHttpError(403, 'FORBIDDEN', 'Forbidden');
  }
}

async function assertDeliveryInHome(homeId, deliveryId) {
  if (!deliveryId) return null;
  const _id = toObjectId(deliveryId);
  if (!_id) {
    throw createHttpError(400, 'INVALID_DELIVERY_ID', 'Invalid delivery id');
  }
  const delivery = await Delivery.findOne({ _id, homeId }).select('_id homeId otp verificationCode').lean();
  if (!delivery) {
    throw createHttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
  }
  return delivery;
}

module.exports = {
  createHttpError,
  toObjectId,
  resolveActorContext,
  assertCanRead,
  assertCanManage,
  assertDeliveryInHome,
};
