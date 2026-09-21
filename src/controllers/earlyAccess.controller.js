const earlyAccessService = require('../services/earlyAccess.service');
const { logs } = require('../utils/logger');

exports.create = async (req, res, next) => {
  const idempotencyKey = req.get('Idempotency-Key');
  if (!idempotencyKey || idempotencyKey.trim().length < 8 || idempotencyKey.length > 128) {
    logs.error('[EARLY_ACCESS][CREATE] invalid or missing idempotency key');
    return res.status(400).json({
      ok: false,
      code: 'INVALID_IDEMPOTENCY_KEY',
      message: 'Idempotency-Key header must be between 8 and 128 characters',
      error: 'Idempotency-Key header must be between 8 and 128 characters',
    });
  }

  try {
    const result = await earlyAccessService.createEarlyAccessRequest(req.body, idempotencyKey.trim());
    logs.info('[EARLY_ACCESS][CREATE] response sent', { replayed: result.replayed });
    return res.status(result.replayed ? 200 : 201).json({
      ok: true,
      message: result.replayed
        ? 'Early access request already submitted'
        : 'Early access request submitted successfully',
      data: result.data,
    });
  } catch (error) {
    logs.error('[EARLY_ACCESS][CREATE] request failed', { message: error.message });
    return next(error);
  }
};

exports.list = async (req, res, next) => {
  try {
    const data = await earlyAccessService.listEarlyAccessRequests(req.query);
    logs.info('[EARLY_ACCESS][LIST] response sent', { itemCount: data.items.length });
    return res.json({
      ok: true,
      message: 'Early access requests fetched successfully',
      data,
    });
  } catch (error) {
    logs.error('[EARLY_ACCESS][LIST] request failed', { message: error.message });
    return next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const data = await earlyAccessService.getEarlyAccessRequestById(req.params.id);
    logs.info('[EARLY_ACCESS][GET_BY_ID] response sent', { requestId: data.id });
    return res.json({
      ok: true,
      message: 'Early access request fetched successfully',
      data,
    });
  } catch (error) {
    logs.error('[EARLY_ACCESS][GET_BY_ID] request failed', { message: error.message });
    return next(error);
  }
};
