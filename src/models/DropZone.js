const mongoose = require('mongoose');

const dropZoneSchema = new mongoose.Schema({
  homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  name: { type: String, trim: true, required: true },
  type: { type: String, enum: ['locker', 'doorstep', 'reception', 'security_desk', 'garage', 'custom'], required: true },
  locationDescription: { type: String, trim: true, default: '' },
  accessCodeHash: { type: String, trim: true, default: '' },
  accessCodeLast4: { type: String, trim: true, default: '' },
  accessCodeRequired: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'inactive', 'disabled'], default: 'active', index: true },
  isDefault: { type: Boolean, default: false },
  usageCount: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

dropZoneSchema.index({ homeId: 1, name: 1 }, { unique: true });
dropZoneSchema.index({ homeId: 1, status: 1, type: 1, _id: -1 });

module.exports = mongoose.model('DropZone', dropZoneSchema);
