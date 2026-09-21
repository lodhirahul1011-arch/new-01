const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    scope: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    status: { type: String, enum: ['success', 'failure'], required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    sessionJti: { type: String, index: true },
    identifier: { type: String, trim: true, index: true },
    requestId: { type: String, trim: true, index: true },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
