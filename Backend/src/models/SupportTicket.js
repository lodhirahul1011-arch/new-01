const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    homeId: { type: mongoose.Schema.Types.ObjectId, index: true },
    channel: { type: String, enum: ['whatsapp', 'call', 'email', 'in_app'], default: 'in_app' },
    category: { type: String, enum: ['device', 'delivery', 'billing', 'account', 'other'], default: 'other' },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open', index: true },
    attachments: [
      {
        url: { type: String },
        filename: { type: String },
        mime: { type: String },
        size: { type: Number },
      },
    ],
    meta: {
      appVersion: { type: String, trim: true },
      devicePlatform: { type: String, trim: true },
    },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

supportTicketSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
