const mongoose = require('mongoose');

const backupAssignmentSchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    deliveryId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    createdByMemberId: { type: mongoose.Schema.Types.ObjectId, default: null },
    otpCode: { type: String, required: true },
    otpCodeHash: { type: String, default: '' },
    guestName: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['active', 'expired', 'revoked', 'used'],
      default: 'active',
      index: true,
    },
    validFrom: { type: Date, default: Date.now },
    validUntil: { type: Date, required: true, index: true },
    assignedAt: { type: Date, default: Date.now, index: true },
    revokedAt: { type: Date, default: null },
    expiredAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    notes: { type: String, default: '' },
    meta: {
      source: { type: String, default: 'delivery_backup_screen' },
      deviceId: { type: String, default: '' },
      createdByRole: { type: String, default: 'owner' },
    },
  },
  { timestamps: true }
);

backupAssignmentSchema.index({ homeId: 1, status: 1, assignedAt: -1 });
backupAssignmentSchema.index(
  { homeId: 1, deliveryId: 1, guestName: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
    name: 'uniq_active_backup_guest_per_context',
  }
);

module.exports = mongoose.model('BackupAssignment', backupAssignmentSchema);
