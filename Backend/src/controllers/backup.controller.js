const backupService = require('../services/backup.service');

async function overview(req, res, next) {
  try {
    const data = await backupService.getOverview(req.user, req.query || {});
    return res.json({ ok: true, message: 'Backup overview fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function assign(req, res, next) {
  try {
    const data = await backupService.assignBackup(req.user, req.body || {});
    return res.status(201).json({ ok: true, message: 'Backup person assigned successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function list(req, res, next) {
  try {
    const data = await backupService.listAssignments(req.user, req.query || {});
    return res.json({ ok: true, message: 'Backup assignments fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function revoke(req, res, next) {
  try {
    const data = await backupService.revokeAssignment(req.user, req.params.id);
    return res.json({ ok: true, message: 'Backup person revoked successfully', data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  overview,
  assign,
  list,
  revoke,
};
