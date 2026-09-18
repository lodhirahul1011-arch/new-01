const crypto = require('crypto');
const EarlyAccessRequest = require('../models/EarlyAccessRequest');
const { logs } = require('../utils/logger');

function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function toResponse(request) {
  return {
    id: request._id,
    name: request.name,
    phone: request.phone,
    email: request.email,
    address: request.address,
    livingIn: request.livingIn,
    livesWith: request.livesWith,
    houseOwnership: request.houseOwnership,
    status: request.status,
    createdAt: request.createdAt,
  };
}

function conflictError() {
  const error = new Error('Idempotency key has already been used with a different request payload');
  error.status = 409;
  error.code = 'IDEMPOTENCY_KEY_CONFLICT';
  return error;
}

async function createEarlyAccessRequest(payload, idempotencyKey) {
  const payloadHash = hashPayload(payload);
  const existing = await EarlyAccessRequest.findOne({ idempotencyKey });

  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      logs.error('[EARLY_ACCESS][CREATE] idempotency conflict', { idempotencyKey });
      throw conflictError();
    }
    logs.info('[EARLY_ACCESS][CREATE] returning existing request', { requestId: existing._id });
    return { data: toResponse(existing), replayed: true };
  }

  try {
    const request = await EarlyAccessRequest.create({ ...payload, idempotencyKey, payloadHash });
    logs.info('[EARLY_ACCESS][CREATE] request created', { requestId: request._id });
    return { data: toResponse(request), replayed: false };
  } catch (error) {
    if (error && error.code === 11000) {
      const duplicate = await EarlyAccessRequest.findOne({ idempotencyKey });
      if (duplicate && duplicate.payloadHash === payloadHash) {
        logs.info('[EARLY_ACCESS][CREATE] returning request created by concurrent retry', {
          requestId: duplicate._id,
        });
        return { data: toResponse(duplicate), replayed: true };
      }
      logs.error('[EARLY_ACCESS][CREATE] concurrent idempotency conflict', { idempotencyKey });
      throw conflictError();
    }
    logs.error('[EARLY_ACCESS][CREATE] failed', { message: error.message });
    throw error;
  }
}

async function listEarlyAccessRequests({ page, limit, status, search }) {
  const filter = {};
  if (status) filter.status = status;
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchPattern = new RegExp(escapedSearch, 'i');
    filter.$or = [
      { name: searchPattern },
      { phone: searchPattern },
      { email: searchPattern },
    ];
  }

  try {
    const [requests, totalItems] = await Promise.all([
      EarlyAccessRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      EarlyAccessRequest.countDocuments(filter),
    ]);
    logs.info('[EARLY_ACCESS][LIST] requests fetched', { page, limit, totalItems });
    return {
      items: requests.map(toResponse),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        hasNextPage: page * limit < totalItems,
      },
    };
  } catch (error) {
    logs.error('[EARLY_ACCESS][LIST] failed', { message: error.message });
    throw error;
  }
}

async function getEarlyAccessRequestById(id) {
  if (!EarlyAccessRequest.db.base.Types.ObjectId.isValid(id)) {
    const error = new Error('Invalid early access request ID');
    error.status = 400;
    error.code = 'INVALID_EARLY_ACCESS_REQUEST_ID';
    logs.error('[EARLY_ACCESS][GET_BY_ID] invalid ID', { id });
    throw error;
  }

  try {
    const request = await EarlyAccessRequest.findById(id);
    if (!request) {
      const error = new Error('Early access request not found');
      error.status = 404;
      error.code = 'EARLY_ACCESS_REQUEST_NOT_FOUND';
      throw error;
    }
    logs.info('[EARLY_ACCESS][GET_BY_ID] request fetched', { requestId: request._id });
    return toResponse(request);
  } catch (error) {
    logs.error('[EARLY_ACCESS][GET_BY_ID] failed', { id, message: error.message });
    throw error;
  }
}

module.exports = {
  createEarlyAccessRequest,
  listEarlyAccessRequests,
  getEarlyAccessRequestById,
};
