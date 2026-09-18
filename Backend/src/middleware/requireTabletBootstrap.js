const { env } = require('../config/env');
const { logs } = require('../utils/logger');

module.exports = function requireTabletBootstrap(req, res, next) {
  if (!env.TABLET_BOOTSTRAP_SECRET) {
    logs.info('[TABLET_BOOTSTRAP] skipped because secret is not configured', { path: req.originalUrl });
    return next();
  }
  const provided = String(
    req.headers['x-tablet-bootstrap-secret'] ||
      req.headers['x-tablet-bootstrap-token'] ||
      '',
  ).trim();
  if (!provided || provided !== env.TABLET_BOOTSTRAP_SECRET) {
    logs.error('[TABLET_BOOTSTRAP] invalid bootstrap secret', {
      path: req.originalUrl,
      hasSecret: Boolean(provided),
      header: req.headers['x-tablet-bootstrap-secret']
        ? 'x-tablet-bootstrap-secret'
        : req.headers['x-tablet-bootstrap-token']
          ? 'x-tablet-bootstrap-token'
          : 'missing',
    });
    return res.status(401).json({
      ok: false,
      code: 'TABLET_BOOTSTRAP_UNAUTHORIZED',
      message: 'Tablet bootstrap secret is invalid',
      error: 'Tablet bootstrap secret is invalid',
    });
  }
  logs.info('[TABLET_BOOTSTRAP] bootstrap secret accepted', { path: req.originalUrl });
  return next();
};
