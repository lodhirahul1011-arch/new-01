const User = require('../models/User');
const DeliverySchedule = require('../models/DeliverySchedule');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const smsParserService = require('../services/smsParser.service');
const whatsappCloud = require('../services/whatsappCloud.service');
const { env } = require('../config/env');
const { resolveHomeId } = require('../utils/home');
const { buildPhoneLookupCandidates, normalizePhoneToE164, maskPhone } = require('../utils/phone');
const { safeLog, logs } = require('../utils/logger');
const { sendUpcomingDeliveryScheduledNotification } = require('../services/pushNotification.service');

function formatDeliveryReply(result, schedule) {
  if (result?.duplicate) return 'This delivery message was already received. No duplicate schedule was created.';
  if (!schedule) return 'Your message was received, but I could not create a delivery schedule from it. Please include the delivery date/time and tracking or order details.';

  const dateValue = schedule.expectedDeliveryDate || schedule.deliveryDate || schedule.scheduledDate;
  const dateText = dateValue ? new Date(dateValue).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '';
  const reference = schedule.referenceId || schedule.awbNumber || schedule.orderHint || '';
  const parts = ['Delivery schedule saved successfully.'];
  if (reference) parts.push(`Reference: ${reference}`);
  if (dateText && dateText !== 'Invalid Date') parts.push(`Expected: ${dateText}`);
  return parts.join('\n');
}

async function saveOutboundLog({ messageId, to, text, replyTo, scheduleId, userId, homeId }) {
  if (!messageId) return;
  await WhatsAppMessage.findOneAndUpdate(
    { waMessageId: messageId },
    {
      $setOnInsert: {
        direction: 'outbound',
        phoneNumber: to,
        messageType: 'text',
        text,
        userId: userId || null,
        homeId: homeId || null,
        scheduleId: scheduleId || null,
        payload: replyTo ? { replyTo } : null,
      },
    },
    { upsert: true }
  );
}

class WhatsAppController {
  verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token && token === env.WHATSAPP_VERIFY_TOKEN) {
      safeLog('[WhatsApp] webhook_verified');
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  async receiveWebhook(req, res) {
    try {
      const signature = req.headers['x-hub-signature-256'];
      logs.info('[WhatsApp] webhook_post_received', {
        hasSignature: Boolean(signature),
        object: req.body?.object || '',
        entryCount: Array.isArray(req.body?.entry) ? req.body.entry.length : 0,
      });
      if (!whatsappCloud.verifyMetaSignature(req.rawBody, signature)) {
        logs.error('[WhatsApp] webhook_signature_invalid', {
          hasSignature: Boolean(signature),
          appSecretConfigured: Boolean(env.WHATSAPP_APP_SECRET),
        });
        safeLog('[WhatsApp] invalid_signature');
        return res.sendStatus(env.WHATSAPP_APP_SECRET ? 401 : 503);
      }

      // Acknowledge Meta quickly, then process in this request lifecycle.
      const events = whatsappCloud.extractWebhookEvents(req.body || {});
      for (const event of events) {
        if (event.kind === 'status') {
          await this.processStatus(event);
        } else {
          await this.processMessage(event);
        }
      }
      return res.sendStatus(200);
    } catch (error) {
      logs.error('[WhatsApp] webhook_failed', { error: error.message });
      safeLog('[WhatsApp] webhook_error', { error: error.message });
      return res.sendStatus(500);
    }
  }

  async processStatus(event) {
    const status = event.status || {};
    const timestamp = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
    await WhatsAppMessage.findOneAndUpdate(
      { waMessageId: status.id },
      {
        $set: {
          status: status.status || '',
          statusTimestamp: timestamp,
          errors: status.errors || null,
        },
        $setOnInsert: {
          direction: 'outbound',
          phoneNumber: status.recipient_id || '',
          phoneNumberId: event.phoneNumberId || '',
          messageType: 'unknown',
          payload: status,
        },
      },
      { upsert: true }
    );
  }

  async processMessage(event) {
    const message = event.message || {};
    const sender = String(message.from || '').trim();
    const text = whatsappCloud.messageText(message);

    const existing = await WhatsAppMessage.findOne({ waMessageId: message.id }).select('_id');
    if (existing) return;

    const inboundLog = await WhatsAppMessage.create({
      waMessageId: message.id,
      direction: 'inbound',
      phoneNumber: sender,
      phoneNumberId: event.phoneNumberId || '',
      messageType: message.type || 'unknown',
      text,
      status: 'received',
      statusTimestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
      payload: message,
    });

    if (!text) {
      safeLog('[WhatsApp] unsupported_message_type', { type: message.type || 'unknown' });
      return;
    }

    const candidates = buildPhoneLookupCandidates(sender, env.SMS_COUNTRY_CODE || '91');
    const user = await User.findOne({
      phone: { $in: candidates },
      isDeleted: { $ne: true },
    }).select('_id name phone primaryHomeId preferences fcmTokens');

    if (!user) {
      safeLog('[WhatsApp] unregistered_sender', { sender: maskPhone(sender) });
      if (env.WHATSAPP_REPLY_TO_UNREGISTERED) {
        const reply = 'This WhatsApp number is not registered with your delivery account. Please use the phone number registered in the app.';
        try {
          const sent = await whatsappCloud.sendTextMessage(sender, reply, { replyToMessageId: message.id });
          await saveOutboundLog({ messageId: sent.messageId, to: sender, text: reply, replyTo: message.id });
        } catch (error) {
          safeLog('[WhatsApp] unregistered_reply_failed', { error: error.message });
        }
      }
      return;
    }

    const homeId = resolveHomeId(user);
    inboundLog.userId = user._id;
    inboundLog.homeId = homeId || null;
    await inboundLog.save();
    if (!homeId) return;

    const normalizedSender = normalizePhoneToE164(sender, env.SMS_COUNTRY_CODE || '91') || user.phone || sender;
    const result = await smsParserService.processSms(homeId, text, normalizedSender, message.id);

    if (result.ignored) {
      if (env.WHATSAPP_REPLY_ON_UNRECOGNIZED) {
        const reply = 'I received your message, but could not identify delivery scheduling details. Please send the courier/order reference and expected delivery date or time.';
        try {
          const sent = await whatsappCloud.sendTextMessage(sender, reply, { replyToMessageId: message.id });
          await saveOutboundLog({ messageId: sent.messageId, to: sender, text: reply, replyTo: message.id, userId: user._id, homeId });
        } catch (error) {
          safeLog('[WhatsApp] unrecognized_reply_failed', { error: error.message });
        }
      }
      return;
    }

    let schedule = null;
    if (result.scheduleId) {
      schedule = await DeliverySchedule.findOne({ _id: result.scheduleId, homeId });
      if (schedule) {
        if (!schedule.phoneNumber) schedule.phoneNumber = user.phone || normalizedSender;
        if (!schedule.customerName && user.name) schedule.customerName = user.name;

        if (result.scheduleIsNew && !schedule.notifications?.upcomingScheduledSentAt) {
          try {
            const push = await sendUpcomingDeliveryScheduledNotification(user, schedule);
            if (push?.sent > 0) {
              schedule.notifications = { ...(schedule.notifications || {}), upcomingScheduledSentAt: new Date() };
            }
          } catch (error) {
            safeLog('[WhatsApp] push_failed', { error: error.message, scheduleId: String(schedule._id) });
          }
        }
        await schedule.save();
      }
    }

    inboundLog.smsLogId = result.smsLog?._id || null;
    inboundLog.scheduleId = result.scheduleId || null;
    await inboundLog.save();

    if (env.WHATSAPP_AUTO_REPLY) {
      const reply = formatDeliveryReply(result, schedule);
      try {
        const sent = await whatsappCloud.sendTextMessage(sender, reply, { replyToMessageId: message.id });
        await saveOutboundLog({
          messageId: sent.messageId,
          to: sender,
          text: reply,
          replyTo: message.id,
          scheduleId: result.scheduleId,
          userId: user._id,
          homeId,
        });
      } catch (error) {
        safeLog('[WhatsApp] confirmation_reply_failed', { error: error.message, sender: maskPhone(sender) });
      }
    }

    safeLog('[WhatsApp] delivery_message_processed', {
      sender: maskPhone(sender),
      userId: String(user._id),
      scheduleId: result.scheduleId ? String(result.scheduleId) : '',
      duplicate: Boolean(result.duplicate),
    });
  }
}

module.exports = new WhatsAppController();
