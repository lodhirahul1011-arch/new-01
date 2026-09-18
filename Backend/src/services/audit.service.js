const AuditLog = require('../models/AuditLog');
const { safeLog } = require('../utils/logger');

async function writeAudit({ scope, action, status, userId, sessionJti, identifier, requestId, ip, userAgent, details }) {
  try {
    await AuditLog.create({
      scope,
      action,
      status,
      userId,
      sessionJti,
      identifier,
      requestId,
      ip,
      userAgent,
      details: details || {},
    });
  } catch (err) {
    safeLog('[AUDIT]', 'write failed', { error: err.message, scope, action });
  }
}

module.exports = { writeAudit };
