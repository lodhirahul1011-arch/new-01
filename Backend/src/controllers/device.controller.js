const deviceService = require('../services/device.service');
const { writeAudit } = require('../services/audit.service');

function toPublic(device) {
  const obj = device && device.toObject ? device.toObject() : device;
  if (!obj) return obj;
  delete obj.deviceSecretHash;
  delete obj.pairingCodeId;
  delete obj.pairingSecretHash;
  delete obj.pairingExpiresAt;
  return obj;
}

async function provision(req, res, next) {
  try {
    const data = await deviceService.provisionDevice(req.body);
    return res.status(201).json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

async function link(req, res, next) {
  try {
    const device = await deviceService.linkDevice({ userId: req.user._id, qrToken: req.body.qrToken });
    await writeAudit({ scope: 'device', action: 'link', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, data: toPublic(device) });
  } catch (err) {
    return next(err);
  }
}

async function list(req, res, next) {
  try {
    const data = await deviceService.listDevices(req.user._id);
    return res.json({ ok: true, data: data.map(toPublic) });
  } catch (err) {
    return next(err);
  }
}

async function linkedSummary(req, res, next) {
  try {
    const data = await deviceService.getLinkedSummary(req.user._id);
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const data = await deviceService.getDevice(req.user._id, req.params.deviceId);
    return res.json({ ok: true, data: toPublic(data) });
  } catch (err) {
    return next(err);
  }
}

async function patch(req, res, next) {
  try {
    const data = await deviceService.patchDevice(req.user._id, req.params.deviceId, req.body);
    await writeAudit({ scope: 'device', action: 'patch', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, data: toPublic(data) });
  } catch (err) {
    return next(err);
  }
}

async function unlink(req, res, next) {
  try {
    const data = await deviceService.unlinkDevice(req.user._id, req.params.deviceId);
    await writeAudit({ scope: 'device', action: 'unlink', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

async function heartbeat(req, res, next) {
  try {
    const device = await deviceService.heartbeat(req.device, req.body);
    return res.json({ ok: true, data: { deviceId: device.deviceId, status: device.status, lastSeenAt: device.lastSeenAt } });
  } catch (err) {
    return next(err);
  }
}

async function status(req, res, next) {
  try {
    const data = await deviceService.getStatus(req.user._id, req.params.deviceId);
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

async function wallpapers(req, res, next) {
  try {
    const data = await deviceService.getWallpaperOptions(req.user._id);
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

async function selectWallpaper(req, res, next) {
  try {
    const data = await deviceService.selectWallpaper(req.user._id, req.params.deviceId, req.body?.wallpaperKey);
    await writeAudit({ scope: 'device', action: 'select_wallpaper', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, message: 'Wallpaper selected', data: toPublic(data) });
  } catch (err) {
    return next(err);
  }
}

async function uploadWallpaper(req, res, next) {
  try {
    const data = await deviceService.uploadWallpaper(req.user._id, req.params.deviceId, req.file);
    await writeAudit({ scope: 'device', action: 'upload_wallpaper', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, message: 'Wallpaper updated', data: toPublic(data) });
  } catch (err) {
    return next(err);
  }
}

async function listIntegrations(req, res, next) {
  try {
    const data = await deviceService.listIntegrations(req.user._id, req.params.deviceId);
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

async function connectIntegration(req, res, next) {
  try {
    const data = await deviceService.connectIntegration(req.user._id, req.params.deviceId, req.body);
    await writeAudit({ scope: 'device_integration', action: 'connect', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.status(201).json({ ok: true, message: 'Integration connection initiated', data });
  } catch (err) {
    return next(err);
  }
}

async function verifyIntegration(req, res, next) {
  try {
    const data = await deviceService.verifyIntegration(req.user._id, req.params.deviceId, req.params.provider, req.body);
    await writeAudit({ scope: 'device_integration', action: 'verify', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, message: 'Integration verified', data });
  } catch (err) {
    return next(err);
  }
}

async function disconnectIntegration(req, res, next) {
  try {
    const data = await deviceService.disconnectIntegration(req.user._id, req.params.deviceId, req.params.provider);
    await writeAudit({ scope: 'device_integration', action: 'disconnect', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, message: 'Integration disconnected', data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  provision,
  link,
  list,
  linkedSummary,
  getOne,
  patch,
  unlink,
  heartbeat,
  status,
  wallpapers,
  selectWallpaper,
  uploadWallpaper,
  listIntegrations,
  connectIntegration,
  verifyIntegration,
  disconnectIntegration,
};
