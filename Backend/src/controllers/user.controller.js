const userService = require('../services/user.service');
const { writeAudit } = require('../services/audit.service');
const { logs } = require('../utils/logger');

function errJson(err) {
  return {
    ok: false,
    code: err.code || 'BAD_REQUEST',
    message: err.message,
    error: err.message,
    ...(err.details ? { details: err.details } : {}),
  };
}

async function getMe(req, res) {
  try {
    const data = await userService.getMe(req.user._id);
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function patchMe(req, res) {
  try {
    const data = await userService.patchMe(req.user._id, req.body);
    await writeAudit({ scope: 'user', action: 'patch_me', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function getPreferences(req, res) {
  try {
    const data = await userService.getPreferences(req.user._id);
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function putPreferences(req, res) {
  try {
    const data = await userService.putPreferences(req.user._id, req.body);
    await writeAudit({ scope: 'user', action: 'put_preferences', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function saveFcmToken(req, res) {
  try {
    const data = await userService.saveFcmToken(req.user._id, req.body);
    await writeAudit({ scope: 'user', action: 'save_fcm_token', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function removeFcmToken(req, res) {
  try {
    const data = await userService.removeFcmToken(req.user._id, req.body || {});
    await writeAudit({ scope: 'user', action: 'remove_fcm_token', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function putPhoto(req, res) {
  try {
    const data = await userService.putPhoto(req.user._id, req.file);
    await writeAudit({ scope: 'user', action: 'put_photo', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function deletePhoto(req, res) {
  try {
    const data = await userService.deletePhoto(req.user._id);
    await writeAudit({ scope: 'user', action: 'delete_photo', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function deleteAccount(req, res) {
  try {
    const deletionReason = req.body?.deletionReason || req.body?.reason || '';
    logs.info('[USER][DELETE_ACCOUNT] request received', {
      userId: String(req.user._id),
      hasDeletionReason: Boolean(String(deletionReason || '').trim()),
    });
    const data = await userService.deleteAccount(req.user._id, { deletionReason });
    await writeAudit({ scope: 'user', action: 'delete_account', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, message: 'Account deleted successfully', data });
  } catch (err) {
    logs.error('[USER][DELETE_ACCOUNT] failed', {
      userId: req.user?._id ? String(req.user._id) : '',
      code: err.code,
      message: err.message,
    });
    return res.status(err.status || 400).json(errJson(err));
  }
}

module.exports = {
  getMe,
  patchMe,
  putPhoto,
  deletePhoto,
  getPreferences,
  putPreferences,
  saveFcmToken,
  removeFcmToken,
  deleteAccount,
};
