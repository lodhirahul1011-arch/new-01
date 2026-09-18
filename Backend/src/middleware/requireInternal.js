const { env } = require('../config/env');

module.exports = function requireInternal(req, res, next) {
  const provided = String(req.headers['x-internal-secret'] || '').trim();
  if (!env.DEVICE_PROVISION_SECRET) {
    return res.status(503).json({
      ok: false,
      code: 'DEVICE_PROVISION_DISABLED',
      message: 'Device provisioning is disabled',
      error: 'Device provisioning is disabled',
    });
  }
  if (!provided || provided !== env.DEVICE_PROVISION_SECRET) {
    return res.status(403).json({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Forbidden',
      error: 'Forbidden',
    });
  }
  return next();
};
