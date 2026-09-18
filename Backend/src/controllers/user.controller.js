const userService = require('../services/user.service');
const { writeAudit } = require('../services/audit.service');
const { logs } = require('../utils/logger');
const User = require('../models/User');
const admin = require('firebase-admin');

function normalizeGoogleProfilePayload(payload = {}) {
  const normalized = {};

  if (typeof payload.name === 'string') {
    normalized.name = payload.name.trim();
  }
  if (typeof payload.email === 'string') {
    normalized.email = payload.email.trim().toLowerCase();
  }
  if (typeof payload.avatarUrl === 'string') {
    normalized.avatarUrl = payload.avatarUrl.trim();
  }
  if (typeof payload.picture === 'string') {
    normalized.avatarUrl = normalized.avatarUrl || payload.picture.trim();
  }
  if (typeof payload.googleSub === 'string') {
    normalized.googleSub = payload.googleSub.trim();
  }

  return normalized;
}

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

async function googleProfile(req, res) {
  try {
    const authHeader = String(req.headers.authorization || '');
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = String(req.body?.idToken || req.body?.token || bearerMatch?.[1] || '').trim();

    if (!idToken) {
      return res.status(400).json({
        ok: false,
        code: 'GOOGLE_ID_TOKEN_REQUIRED',
        message: 'Google ID token is required',
        error: 'Google ID token is required',
      });
    }

    if (!admin.apps.length) {
      try {
        admin.initializeApp();
      } catch (error) {
        logs.warn('[USER][GOOGLE_PROFILE] firebase_admin_init_failed', {
          message: error.message,
        });
      }
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const payload = normalizeGoogleProfilePayload({
      name: req.body?.name || decoded.name || req.user?.name || '',
      email: req.body?.email || decoded.email || req.user?.email || '',
      avatarUrl: req.body?.avatarUrl || req.body?.picture || decoded.picture || req.user?.avatar?.url || '',
      googleSub: req.body?.googleSub || decoded.uid || req.user?.googleSub || '',
    });

    if (!payload.googleSub) {
      return res.status(400).json({
        ok: false,
        code: 'GOOGLE_SUB_MISSING',
        message: 'Google profile could not be resolved',
        error: 'Google profile could not be resolved',
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        ok: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found',
        error: 'User not found',
      });
    }

    const duplicateEmail = payload.email
      ? await User.findOne({ email: payload.email, _id: { $ne: user._id }, isDeleted: { $ne: true } })
      : null;

    if (duplicateEmail) {
      return res.status(409).json({
        ok: false,
        code: 'EMAIL_IN_USE',
        message: 'This Google email is already linked to another account.',
        error: 'This Google email is already linked to another account.',
      });
    }

    if (payload.name) user.name = payload.name;
    if (payload.email) user.email = payload.email;
    user.googleSub = payload.googleSub;
    user.emailVerified = user.emailVerified || decoded.email_verified === true || decoded.email_verified === 'true';
    user.isVerified = true;
    user.verifiedAt = user.verifiedAt || new Date();
    user.lastLoginAt = new Date();

    if (payload.avatarUrl) {
      user.avatar = {
        ...(user.avatar || {}),
        url: payload.avatarUrl,
        updatedAt: new Date(),
      };
    }

    await user.save();

    await writeAudit({
      scope: 'user',
      action: 'google_profile_sync',
      status: 'success',
      userId: user._id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      details: { googleSub: payload.googleSub },
    });

    return res.json({
      ok: true,
      message: 'Google profile synced',
      user: {
        id: user._id,
        _id: user._id,
        name: user.name || '',
        email: user.email || undefined,
        phone: user.phone || undefined,
        googleSub: user.googleSub || undefined,
        verified: user.isVerified === true,
        isVerified: user.isVerified === true,
        emailVerified: user.emailVerified,
        avatar: user.avatar || { url: '' },
      },
    });
  } catch (err) {
    logs.error('[USER][GOOGLE_PROFILE] failed', {
      code: err.code,
      message: err.message,
      stack: err.stack,
    });

    await writeAudit({
      scope: 'user',
      action: 'google_profile_sync',
      status: 'failure',
      userId: req.user?._id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      details: { code: err.code || 'GOOGLE_PROFILE_SYNC_FAILED', message: err.message },
    }).catch(() => {});

    return res.status(err.status || 401).json({
      ok: false,
      code: err.code || 'GOOGLE_PROFILE_SYNC_FAILED',
      message: err.message || 'Google profile sync failed',
      error: err.message || 'Google profile sync failed',
    });
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
  googleProfile,
  patchMe,
  putPhoto,
  deletePhoto,
  getPreferences,
  putPreferences,
  saveFcmToken,
  removeFcmToken,
  deleteAccount,
};
