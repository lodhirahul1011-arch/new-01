const settingsService = require('../services/settings.service');
const { writeAudit } = require('../services/audit.service');

function errJson(err) {
  return {
    ok: false,
    code: err.code || 'BAD_REQUEST',
    message: err.message,
    error: err.message,
    ...(err.details ? { details: err.details } : {}),
  };
}

async function overview(req, res) {
  try {
    const data = await settingsService.getSettingsOverview(req.user._id);
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function getNotifications(req, res) {
  try {
    const data = await settingsService.getNotificationSettings(req.user._id);
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function putNotifications(req, res) {
  try {
    const data = await settingsService.updateNotificationSettings(req.user._id, req.body);
    await writeAudit({ scope: 'settings', action: 'update_notifications', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, message: 'Notification settings updated', data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function getLanguage(req, res) {
  try {
    const data = await settingsService.getLanguageSettings(req.user._id);
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function putLanguage(req, res) {
  try {
    const data = await settingsService.updateLanguage(req.user._id, req.body.language);
    await writeAudit({ scope: 'settings', action: 'update_language', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, message: 'Language updated', data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function getHelp(req, res) {
  try {
    const data = await settingsService.getHelpSupport(req.user._id);
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function contactSupport(req, res) {
  try {
    const data = await settingsService.createSupportTicket(req.user._id, req.body);
    await writeAudit({ scope: 'settings', action: 'contact_support', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.status(201).json({ ok: true, message: 'Support request created', data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

module.exports = {
  overview,
  getNotifications,
  putNotifications,
  getLanguage,
  putLanguage,
  getHelp,
  contactSupport,
};
