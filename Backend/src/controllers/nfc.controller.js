const nfcService = require('../services/nfc.service');
const { writeAudit } = require('../services/audit.service');

function errJson(err) {
  return {
    ok: false,
    code: err.code || 'BAD_REQUEST',
    message: err.message,
    error: err.message,
    details: err.details || {},
  };
}

async function overview(req, res) {
  try {
    const data = await nfcService.listCardsOverview(req.user._id);
    return res.json({ ok: true, message: 'NFC card overview fetched successfully', data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function list(req, res) {
  try {
    const data = await nfcService.listCards(req.user._id);
    return res.json({ ok: true, message: 'NFC cards fetched successfully', data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function create(req, res) {
  try {
    const data = await nfcService.createCard(req.user._id, req.body);
    await writeAudit({ scope: 'nfc', action: 'create_card', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.status(201).json({ ok: true, message: 'NFC card registered successfully', data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function patch(req, res) {
  try {
    const data = await nfcService.updateCard(req.user._id, req.params.cardId, req.body);
    await writeAudit({ scope: 'nfc', action: 'patch_card', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, message: 'NFC card updated successfully', data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function remove(req, res) {
  try {
    const data = await nfcService.removeCard(req.user._id, req.params.cardId);
    await writeAudit({ scope: 'nfc', action: 'remove_card', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, message: 'NFC card removed successfully', data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function verifyAccess(req, res) {
  try {
    const data = await nfcService.verifyAccess(req.user._id, req.body, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || '',
      verifiedBy: 'api',
    });
    await writeAudit({ scope: 'nfc', action: 'verify_access', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, message: 'NFC access verified successfully', data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

async function accessLogs(req, res) {
  try {
    const data = await nfcService.listAccessLogs(req.user._id, req.query);
    return res.json({ ok: true, message: 'NFC access logs fetched successfully', data });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err));
  }
}

module.exports = { overview, list, create, patch, remove, verifyAccess, accessLogs };
