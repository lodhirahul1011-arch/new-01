const authorizationService = require('../services/authorization.service');

async function create(req, res, next) {
  try {
    const data = await authorizationService.createAuthorization(req.user, req.body);
    return res.status(201).json({ ok: true, message: 'Authorization created successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function generateCode(req, res, next) {
  try {
    const data = await authorizationService.previewAccessCode(req.user);
    return res.json({ ok: true, message: 'Access code generated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function list(req, res, next) {
  try {
    const data = await authorizationService.listAuthorizations(req.user, req.query);
    return res.json({ ok: true, message: 'Authorizations fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function summary(req, res, next) {
  try {
    const data = await authorizationService.getAuthorizationSummary(req.user, req.query);
    return res.json({ ok: true, message: 'Authorization summary fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function activityLog(req, res, next) {
  try {
    const data = await authorizationService.getActivityLog(req.user, req.query);
    return res.json({ ok: true, message: 'Authorization activity log fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const data = await authorizationService.getAuthorizationById(req.user, req.params.id);
    return res.json({ ok: true, message: 'Authorization detail fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function markUsed(req, res, next) {
  try {
    const data = await authorizationService.markAuthorizationUsed(req.user, req.params.id, req.body || {});
    return res.json({ ok: true, message: 'Authorization updated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function revoke(req, res, next) {
  try {
    const data = await authorizationService.revokeAuthorization(req.user, req.params.id, req.body || {});
    return res.json({ ok: true, message: 'Authorization revoked successfully', data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  create,
  generateCode,
  list,
  summary,
  activityLog,
  getOne,
  markUsed,
  revoke,
};
