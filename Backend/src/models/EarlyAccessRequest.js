const mongoose = require('mongoose');

const earlyAccessRequestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, minlength: 7 },
    email: { type: String, required: true, trim: true, lowercase: true },
    address: { type: String, required: true, trim: true },
    livingIn: { type: String, required: true, enum: ['Apartment', 'Villa', 'Other'] },
    livesWith: { type: String, required: true, enum: ['Family', 'Friends', 'Alone', 'Other'] },
    houseOwnership: { type: String, required: true, enum: ['Rented', 'Owned', 'Other'] },
    status: { type: String, enum: ['new', 'contacted', 'converted'], default: 'new', index: true },
    idempotencyKey: { type: String, required: true, unique: true, immutable: true },
    payloadHash: { type: String, required: true, immutable: true },
  },
  {
    timestamps: true,
    collection: 'early_access_requests',
  }
);

earlyAccessRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('EarlyAccessRequest', earlyAccessRequestSchema);
