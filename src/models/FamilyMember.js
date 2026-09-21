const mongoose = require('mongoose');

/**
 * Family members are linked to a "home".
 * For now, homeId is a Mongo ObjectId stored as an ObjectId.
 * The owner's default homeId is their own user._id unless `primaryHomeId` is set.
 */
const familyMemberSchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    name: { type: String, trim: true, required: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },

    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    accessLevel: { type: String, enum: ['full', 'simple', 'nfc_only'], default: 'simple' },

    status: { type: String, enum: ['active', 'removed'], default: 'active' },
    removedAt: { type: Date },
  },
  { timestamps: true }
);

// Prevent duplicate active member entries for same home + user/phone.
familyMemberSchema.index(
  { homeId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' }, status: 'active' } }
);
familyMemberSchema.index(
  { homeId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' }, status: 'active' } }
);

module.exports = mongoose.model('FamilyMember', familyMemberSchema);
