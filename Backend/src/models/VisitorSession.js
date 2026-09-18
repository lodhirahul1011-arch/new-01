const mongoose = require('mongoose');

const visitorSessionSchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    tabletDeviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true, index: true },
    residentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    type: { type: String, enum: ['visitor', 'doorbell'], default: 'visitor', index: true },
    state: {
      type: String,
      enum: ['initiated', 'resident_notified', 'approved', 'rejected', 'missed', 'expired'],
      default: 'initiated',
      index: true,
    },
    visitorName: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    responseNote: { type: String, trim: true, default: '' },
    requestedAt: { type: Date, default: Date.now, index: true },
    residentRespondedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    finalStatus: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

visitorSessionSchema.index({ homeId: 1, requestedAt: -1 });

module.exports = mongoose.model('VisitorSession', visitorSessionSchema);
