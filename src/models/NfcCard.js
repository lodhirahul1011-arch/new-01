const mongoose = require('mongoose');

const nfcCardSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    assignedToMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyMember', default: null, index: true },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    cardType: {
      type: String,
      enum: ['access', 'delivery', 'member'],
      default: 'access',
      index: true,
    },
    uidHash: { type: String, required: true, trim: true, maxlength: 255, index: true },
    uidPreview: { type: String, required: true, trim: true, maxlength: 8 },
    serialMasked: { type: String, required: true, trim: true, maxlength: 64 },
    status: {
      type: String,
      enum: ['active', 'inactive', 'blocked', 'removed'],
      default: 'active',
      index: true,
    },
    isPrimary: { type: Boolean, default: true, index: true },
    registeredAt: { type: Date, default: () => new Date(), index: true },
    lastUsedAt: { type: Date, default: null },
    totalAccessCount: { type: Number, default: 0 },
    removeReason: { type: String, default: '', trim: true, maxlength: 120 },
    removedAt: { type: Date, default: null },
    meta: {
      source: { type: String, default: 'settings_nfc', trim: true, maxlength: 50 },
      registrationMethod: { type: String, default: 'manual', trim: true, maxlength: 50 },
      deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', default: null },
      notes: { type: String, default: '', trim: true, maxlength: 200 },
    },
  },
  { timestamps: true }
);

nfcCardSchema.index({ homeId: 1, status: 1, registeredAt: -1 });
nfcCardSchema.index({ homeId: 1, isPrimary: 1 });
nfcCardSchema.index({ homeId: 1, uidHash: 1 }, { unique: true });
nfcCardSchema.index(
  { homeId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
    name: 'uniq_active_nfc_card_per_home',
  }
);

module.exports = mongoose.model('NfcCard', nfcCardSchema);
