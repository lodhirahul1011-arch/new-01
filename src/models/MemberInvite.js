const mongoose = require('mongoose');

const memberInviteSchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    invitedName: { type: String, trim: true, required: true },
    invitedPhone: { type: String, trim: true, required: true, index: true },

    // Store only a hash so the token cannot be recovered from DB.
    tokenHash: { type: String, required: true, index: true },
    status: { type: String, enum: ['pending', 'accepted', 'expired', 'cancelled'], default: 'pending' },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date },
  },
  { timestamps: true }
);

memberInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('MemberInvite', memberInviteSchema);
