const mongoose = require('mongoose');

const whatsAppMessageSchema = new mongoose.Schema(
  {
    waMessageId: { type: String, required: true, unique: true, index: true },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true, index: true },
    phoneNumber: { type: String, default: '', index: true },
    phoneNumberId: { type: String, default: '' },
    messageType: { type: String, default: 'text' },
    text: { type: String, default: '' },
    status: { type: String, default: '', index: true },
    statusTimestamp: { type: Date, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    homeId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    smsLogId: { type: mongoose.Schema.Types.ObjectId, ref: 'SmsLog', default: null },
    scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliverySchedule', default: null, index: true },
    errors: { type: mongoose.Schema.Types.Mixed, default: null },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WhatsAppMessage', whatsAppMessageSchema);
