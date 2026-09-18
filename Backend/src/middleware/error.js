const { logs } = require('../utils/logger');

function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Not Found', error: 'Not Found' });
}

function errorHandler(err, req, res, next) {
  const status = Number(err.status || 500);
  const payload = {
    
    ok: false,
    code: err.code || 'SERVER_ERROR',
    message: err.message || 'Server error',
    error: err.message || 'Server error',
  };
  if (err.details) payload.details = err.details;
  if (process.env.NODE_ENV !== 'production' && err.stack) payload.stack = err.stack;
  logs.error('[GLOBAL_ERROR]', { status, code: payload.code, message: payload.message });
  res.status(status).json(payload);
}

module.exports = { notFoundHandler, errorHandler };
