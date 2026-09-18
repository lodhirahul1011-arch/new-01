const bcrypt = require('bcryptjs');
const Device = require('../models/Device');

/**
 * Device authentication middleware.
 * Devices call with:
 *  - x-device-id
 *  - x-device-secret
 */
module.exports = async function requireDeviceAuth(req, res, next) {
  try {
    const deviceId = String(req.headers['x-device-id'] || '').trim();
    const secret = String(req.headers['x-device-secret'] || '').trim();

    if (!deviceId || !secret) {
      return res.status(401).json({
        ok: false,
        code: 'DEVICE_TOKEN_MISSING',
        message: 'Missing device credentials',
        error: 'Missing device credentials',
      });
    }

    if (req.params.deviceId && String(req.params.deviceId) !== deviceId) {
      return res.status(401).json({
        ok: false,
        code: 'DEVICE_MISMATCH',
        message: 'Device mismatch',
        error: 'Device mismatch',
      });
    }

    const device = await Device.findOne({ deviceId });
    if (!device || !device.deviceSecretHash) {
      return res.status(401).json({
        ok: false,
        code: 'DEVICE_NOT_REGISTERED',
        message: 'Device not registered',
        error: 'Device not registered',
      });
    }

    const ok = await bcrypt.compare(secret, device.deviceSecretHash);
    if (!ok) {
      return res.status(401).json({
        ok: false,
        code: 'DEVICE_TOKEN_INVALID',
        message: 'Invalid device credentials',
        error: 'Invalid device credentials',
      });
    }

    device.lastSeenAt = new Date();
    device.onlineStatus = 'online';
    device.status = 'online';
    device.presence = {
      ...(device.presence || {}),
      lastOnlineAt: new Date(),
      offlineNotificationSentAt: null,
    };
    await device.save();

    req.device = device;
    return next();
  } catch (err) {
    return res.status(401).json({
      ok: false,
      code: 'DEVICE_TOKEN_INVALID',
      message: 'Invalid device credentials',
      error: 'Invalid device credentials',
    });
  }
};
