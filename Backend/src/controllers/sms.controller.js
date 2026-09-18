const SmsLog = require('../models/SmsLog');
const DeliverySchedule = require('../models/DeliverySchedule');
const DeliverySession = require('../models/DeliverySession');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const smsParserService = require('../services/smsParser.service');
const { resolveHomeId } = require('../utils/home');
const { safeLog, logs } = require('../utils/logger');
const { env } = require('../config/env');
const { buildPhoneLookupCandidates, normalizePhoneToE164, maskPhone } = require('../utils/phone');
const ollamaDeliveryExtractorService = require('../services/ollamaDeliveryExtractor.service');
const {
  sendUpcomingDeliveryScheduledNotification,
} = require('../services/pushNotification.service');
const deliveryNotificationService = require('../services/deliveryNotification.service');


function getInboundWebhookSecret(req) {
  const direct = String(req.headers['x-webhook-secret'] || '').trim();
  if (direct) return direct;
  const authorization = String(req.headers.authorization || '').trim();
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  return bearerMatch ? bearerMatch[1].trim() : '';
}

function isInboundWebhookAuthorized(req) {
  const configured = String(env.INBOUND_MESSAGE_WEBHOOK_SECRET || '').trim();
  if (!configured) return env.NODE_ENV !== 'production';
  return getInboundWebhookSecret(req) === configured;
}

function readInboundMessagePayload(body = {}) {
  const senderPhone =
    body.senderPhone || body.from || body.phone || body.msisdn || body.From || body.WaId || '';
  const smsText =
    body.smsText || body.message || body.text || body.body || body.Body || body.Message || '';
  const messageId =
    body.messageId || body.message_id || body.id || body.MessageSid || body.SmsSid || body.SmsMessageSid || '';

  return {
    senderPhone: String(senderPhone || '').trim(),
    smsText: String(smsText || '').trim(),
    messageId: String(messageId || '').trim(),
  };
}

function inMinutes(mins) {
  return new Date(Date.now() + mins * 60 * 1000);
}

function maskCode(code) {
  const value = String(code || '');
  return value ? `${'*'.repeat(Math.max(0, value.length - 2))}${value.slice(-2)}` : '';
}

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

function normalizeIdempotencyKey(value) {
  return String(value || '').trim().slice(0, 160);
}

function hashManualSchedulePayload(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      productTitle: payload.productTitle,
      orderId: payload.orderId,
      awbNumber: payload.awbNumber,
      otpCode: payload.otpCode,
    }))
    .digest('hex');
}

async function getPrimaryUserForHome(homeId) {
  return User.findOne({
    $or: [{ primaryHomeId: homeId }, { _id: homeId }],
  }).select('_id preferences fcmTokens');
}

async function updateMatchingTabletDeliverySession(homeId, schedule, update) {
  // We intentionally avoid requiring a sessionId from the mobile app.
  // We match the most recent resident_notified session for this home + schedule identifiers.
  // Prefer scheduleId correlation when available (most reliable).
  const explicitSessionId = String(schedule?.activeTabletDeliverySessionId || '').trim();
  if (explicitSessionId) {
    const byId = await DeliverySession.findOne({
      _id: explicitSessionId,
      homeId,
      state: { $in: ['resident_notified', 'lookup_pending', 'detected'] },
    });
    if (byId) {
      Object.assign(byId, update);
      byId.meta = {
        ...(byId.meta || {}),
        scheduleId: String(schedule?._id || ''),
        scheduleReferenceId: String(schedule?.referenceId || ''),
        ...((update.meta && typeof update.meta === 'object') ? update.meta : {}),
      };
      await byId.save();
      return byId;
    }
  }

  const scheduleId = String(schedule?._id || '').trim();
  if (scheduleId) {
    const byScheduleId = await DeliverySession.findOne({
      homeId,
      state: { $in: ['resident_notified', 'lookup_pending', 'detected'] },
      'meta.scheduleId': scheduleId,
    }).sort({ createdAt: -1, _id: -1 });

    if (byScheduleId) {
      Object.assign(byScheduleId, update);
      byScheduleId.meta = {
        ...(byScheduleId.meta || {}),
        scheduleId,
        scheduleReferenceId: String(schedule?.referenceId || ''),
        ...((update.meta && typeof update.meta === 'object') ? update.meta : {}),
      };
      await byScheduleId.save();
      return byScheduleId;
    }
  }

  // Time-window fallback: if we have an "active" tablet session timestamp on the schedule,
  // use it to locate the exact session even when identifier matching fails.
  const anchorAtRaw = schedule?.activeTabletDeliverySessionAt;
  if (anchorAtRaw) {
    const anchorAt = new Date(anchorAtRaw);
    if (!Number.isNaN(anchorAt.getTime())) {
      const start = new Date(anchorAt.getTime() - 10 * 60 * 1000);
      const end = new Date(anchorAt.getTime() + 10 * 60 * 1000);
      const byTime = await DeliverySession.findOne({
        homeId,
        state: { $in: ['resident_notified', 'lookup_pending', 'detected'] },
        createdAt: { $gte: start, $lte: end },
      }).sort({ createdAt: -1, _id: -1 });

      if (byTime) {
        Object.assign(byTime, update);
        byTime.meta = {
          ...(byTime.meta || {}),
          scheduleId: String(schedule?._id || ''),
          scheduleReferenceId: String(schedule?.referenceId || ''),
          ...((update.meta && typeof update.meta === 'object') ? update.meta : {}),
        };
        await byTime.save();
        return byTime;
      }
    }
  }

  const keys = Array.from(
    new Set(
      [
        schedule?.referenceId,
        schedule?.awbNumber,
        schedule?.orderHint,
      ]
        .map(v => String(v || '').trim())
        .filter(Boolean)
    )
  );

  if (!keys.length) return null;

  const ors = [];
  for (const k of keys) {
    ors.push({ orderId: k });
    ors.push({ awbCode: k });
  }

  const session = await DeliverySession.findOne({
    homeId,
    state: { $in: ['resident_notified', 'lookup_pending', 'detected'] },
    $or: ors,
  }).sort({ createdAt: -1, _id: -1 });

  if (!session) {
    // Final fallback: if there is exactly one active waiting session for this home,
    // promote it. This avoids being stuck when the scanned identifier differs from
    // SMS parsing output, but still prevents promoting the wrong session when multiple
    // deliveries are pending.
    const since = new Date(Date.now() - 15 * 60 * 1000);
    const candidates = await DeliverySession.find({
      homeId,
      state: { $in: ['resident_notified', 'lookup_pending', 'detected'] },
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(2);

    if (candidates.length === 1) {
      const only = candidates[0];
      Object.assign(only, update);
      only.meta = {
        ...(only.meta || {}),
        scheduleId: String(schedule?._id || ''),
        scheduleReferenceId: String(schedule?.referenceId || ''),
        ...((update.meta && typeof update.meta === 'object') ? update.meta : {}),
      };
      await only.save();
      return only;
    }

    return null;
  }

  Object.assign(session, update);
  session.meta = {
    ...(session.meta || {}),
    scheduleId: String(schedule?._id || ''),
    scheduleReferenceId: String(schedule?.referenceId || ''),
    ...((update.meta && typeof update.meta === 'object') ? update.meta : {}),
  };
  await session.save();
  return session;
}

class SmsController {
  /**
   * Receive SMS from mobile app and process it
   * POST /api/v1/sms/receive
   */
  async receiveSms(req, res) {
    try {
      const { smsText, senderPhone, messageId } = req.body;

      if (!smsText || !smsText.trim()) {
        return res.status(400).json({
          success: false,
          message: 'SMS text is required',
        });
      }

      // Resolve home ID from authenticated user
      const homeId = resolveHomeId(req.user);
      if (!homeId) {
        return res.status(401).json({
          success: false,
          message: 'Home not found',
        });
      }

      // Process SMS
      const result = await smsParserService.processSms(
        homeId,
        smsText,
        senderPhone || '',
        messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      );

      if (result.scheduleIsNew && result.scheduleId) {
        try {
          const schedule = await DeliverySchedule.findOne({
            _id: result.scheduleId,
            homeId,
          });
          if (schedule && !schedule.notifications?.upcomingScheduledSentAt) {
            const user = await getPrimaryUserForHome(homeId);
            const pushResult = await sendUpcomingDeliveryScheduledNotification(user, schedule);
            if (pushResult?.sent > 0) {
              schedule.notifications = {
                ...(schedule.notifications || {}),
                upcomingScheduledSentAt: new Date(),
              };
              await schedule.save();
            } else {
              safeLog('[SmsController] upcoming_schedule_push_skipped', {
                reason:
                  pushResult?.reason ||
                  pushResult?.error ||
                  (pushResult?.skipped ? 'skipped' : 'not_sent'),
                scheduleId: String(result.scheduleId),
              });
            }
          }
        } catch (notificationError) {
          safeLog('[SmsController] upcoming_schedule_push_failed', {
            error: notificationError.message,
            scheduleId: String(result.scheduleId),
          });
        }
      }

      if (result.ignored) {
        return res.status(200).json({
          success: true,
          data: {
            ignored: true,
            reason: result.reason || 'non_delivery_sms',
            scheduleUpdated: false,
            scheduleId: null,
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          smsId: result.smsLog?._id || null,
          company: result.smsLog?.deliveryCompany || 'unknown',
          status: result.smsLog?.status || 'unknown',
          scheduleUpdated: result.scheduleUpdated,
          scheduleId: result.scheduleId,
          confidence: result.smsLog?.confidenceScore || 0,
          duplicate: Boolean(result.duplicate),
        },
      });
    } catch (error) {
      safeLog('[SmsController] Error in receiveSms:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to process SMS',
        error: error.message,
      });
    }
  }

  /**
   * Receive structured Android NotificationListener delivery data.
   * POST /api/v1/sms/delivery-notifications
   */
  async receiveDeliveryNotification(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      if (!homeId) {
        logs.error('[SmsController] delivery notification home missing');
        return res.status(401).json({
          success: false,
          message: 'Home not found',
        });
      }

      const result = await deliveryNotificationService.ingestNotification(homeId, req.body);
      const statusCode = result.duplicate ? 200 : 201;
      logs.info('[SmsController] delivery notification processed', {
        scheduleId: result.schedule ? String(result.schedule._id) : null,
        duplicate: Boolean(result.duplicate),
      });

      return res.status(statusCode).json({
        success: true,
        data: {
          eventId: result.event ? String(result.event._id) : null,
          scheduleId: result.schedule ? String(result.schedule._id) : null,
          duplicate: Boolean(result.duplicate),
          scheduleUpdated: Boolean(result.scheduleUpdated),
          scheduleIsNew: Boolean(result.scheduleIsNew),
          confirmationRequired: Boolean(result.schedule?.confirmationRequired),
          delivery: result.schedule || null,
        },
      });
    } catch (error) {
      logs.error('[SmsController] delivery notification failed', {
        code: error.code,
        message: error.message,
      });
      return res.status(Number(error.status) || 500).json({
        success: false,
        code: error.code || 'DELIVERY_NOTIFICATION_FAILED',
        message: error.message || 'Failed to process delivery notification',
      });
    }
  }


  /**
   * Receive a delivery message directly from an SMS/WhatsApp provider.
   * The sender phone number is matched against User.phone; no JWT is required.
   * POST /api/v1/sms/inbound
   */
  async receiveInboundMessage(req, res) {
    try {
      if (!isInboundWebhookAuthorized(req)) {
        return res.status(env.INBOUND_MESSAGE_WEBHOOK_SECRET ? 401 : 503).json({
          success: false,
          message: env.INBOUND_MESSAGE_WEBHOOK_SECRET
            ? 'Invalid webhook credentials'
            : 'Inbound webhook is not configured',
        });
      }

      const payload = readInboundMessagePayload(req.body || {});
      if (!payload.senderPhone || !payload.smsText) {
        return res.status(400).json({
          success: false,
          message: 'Sender phone and message text are required',
        });
      }

      const phoneCandidates = buildPhoneLookupCandidates(
        payload.senderPhone,
        env.SMS_COUNTRY_CODE || '91'
      );

      const registeredUser = await User.findOne({
        phone: { $in: phoneCandidates },
        isDeleted: { $ne: true },
      }).select('_id name phone primaryHomeId preferences fcmTokens');

      // Return 200 so messaging providers do not endlessly retry unregistered senders.
      if (!registeredUser) {
        safeLog('[SmsController] inbound_message_unregistered_sender', {
          sender: maskPhone(payload.senderPhone),
        });
        return res.status(200).json({
          success: true,
          data: {
            ignored: true,
            reason: 'unregistered_sender',
            scheduleUpdated: false,
            scheduleId: null,
          },
        });
      }

      const homeId = resolveHomeId(registeredUser);
      if (!homeId) {
        return res.status(200).json({
          success: true,
          data: {
            ignored: true,
            reason: 'home_not_found',
            scheduleUpdated: false,
            scheduleId: null,
          },
        });
      }

      const normalizedSenderPhone =
        normalizePhoneToE164(payload.senderPhone, env.SMS_COUNTRY_CODE || '91') || registeredUser.phone;
      const resolvedMessageId = payload.messageId ||
        `inbound_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      const result = await smsParserService.processSms(
        homeId,
        payload.smsText,
        normalizedSenderPhone,
        resolvedMessageId
      );

      if (result.ignored) {
        return res.status(200).json({
          success: true,
          data: {
            ignored: true,
            reason: result.reason || 'non_delivery_message',
            scheduleUpdated: false,
            scheduleId: null,
          },
        });
      }

      let schedule = null;
      if (result.scheduleId) {
        schedule = await DeliverySchedule.findOne({ _id: result.scheduleId, homeId });
        if (schedule) {
          if (!schedule.phoneNumber) schedule.phoneNumber = registeredUser.phone || normalizedSenderPhone;
          if (!schedule.customerName && registeredUser.name) schedule.customerName = registeredUser.name;

          if (result.scheduleIsNew && !schedule.notifications?.upcomingScheduledSentAt) {
            try {
              const pushResult = await sendUpcomingDeliveryScheduledNotification(registeredUser, schedule);
              if (pushResult?.sent > 0) {
                schedule.notifications = {
                  ...(schedule.notifications || {}),
                  upcomingScheduledSentAt: new Date(),
                };
              }
            } catch (notificationError) {
              safeLog('[SmsController] inbound_schedule_push_failed', {
                error: notificationError.message,
                scheduleId: String(result.scheduleId),
              });
            }
          }

          await schedule.save();
        }
      }

      safeLog('[SmsController] inbound_message_processed', {
        userId: String(registeredUser._id),
        sender: maskPhone(registeredUser.phone || normalizedSenderPhone),
        scheduleId: result.scheduleId ? String(result.scheduleId) : '',
        scheduleUpdated: Boolean(result.scheduleUpdated),
      });

      return res.status(200).json({
        success: true,
        data: {
          ignored: false,
          userMatched: true,
          smsId: result.smsLog?._id || null,
          company: result.smsLog?.deliveryCompany || 'unknown',
          status: result.smsLog?.status || 'unknown',
          scheduleUpdated: Boolean(result.scheduleUpdated),
          scheduleId: result.scheduleId || null,
          duplicate: Boolean(result.duplicate),
          delivery: schedule || undefined,
        },
      });
    } catch (error) {
      safeLog('[SmsController] Error in receiveInboundMessage:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to process inbound delivery message',
      });
    }
  }

  /**
   * Get upcoming deliveries for authenticated user
   * GET /api/v1/sms/deliveries/upcoming
   */
  async getUpcomingDeliveries(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      if (!homeId) {
        return res.status(401).json({
          success: false,
          message: 'Home not found',
        });
      }

      const { skip = 0, limit = 50 } = req.query;

      const result = await smsParserService.getUpcomingDeliveries(homeId, {
        limit: Math.min(parseInt(limit) || 50, 100),
        skip: parseInt(skip) || 0,
      });

      return res.status(200).json({
        success: true,
        data: result.deliveries,
        pagination: {
          skip: parseInt(skip) || 0,
          limit: Math.min(parseInt(limit) || 50, 100),
          total: result.total,
        },
      });
    } catch (error) {
      safeLog('[SmsController] Error in getUpcomingDeliveries:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch deliveries',
      });
    }
  }

  /**
   * Get delivery history
   * GET /api/v1/sms/deliveries/history
   */
  async getDeliveryHistory(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      if (!homeId) {
        return res.status(401).json({
          success: false,
          message: 'Home not found',
        });
      }

      const { skip = 0, limit = 50 } = req.query;

      const result = await smsParserService.getDeliveryHistory(homeId, {
        limit: Math.min(parseInt(limit) || 50, 100),
        skip: parseInt(skip) || 0,
      });

      return res.status(200).json({
        success: true,
        data: result.deliveries,
        pagination: {
          skip: parseInt(skip) || 0,
          limit: Math.min(parseInt(limit) || 50, 100),
          total: result.total,
        },
      });
    } catch (error) {
      safeLog('[SmsController] Error in getDeliveryHistory:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch history',
      });
    }
  }

  /**
   * Get single delivery schedule with SMS history
   * GET /api/v1/sms/deliveries/:scheduleId
   */
  async getDeliveryDetails(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      const { scheduleId } = req.params;

      if (!homeId) {
        return res.status(401).json({
          success: false,
          message: 'Home not found',
        });
      }

      const schedule = await DeliverySchedule.findOne({
        _id: scheduleId,
        homeId,
      })
        .populate('latestSmsId')
        .populate('smsIds');

      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: 'Delivery schedule not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: schedule,
      });
    } catch (error) {
      safeLog('[SmsController] Error in getDeliveryDetails:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch delivery details',
      });
    }
  }

  /**
   * Search deliveries by reference ID or company
   * GET /api/v1/sms/deliveries/search?referenceId=XXX&company=blitz
   */
  async searchDeliveries(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      if (!homeId) {
        return res.status(401).json({
          success: false,
          message: 'Home not found',
        });
      }

      const { referenceId, company, skip = 0, limit = 50 } = req.query;

      if (!referenceId && !company) {
        return res.status(400).json({
          success: false,
          message: 'Provide referenceId or company for search',
        });
      }

      const result = await smsParserService.searchDeliveries(homeId, {
        referenceId: referenceId || undefined,
        company: company || undefined,
        limit: Math.min(parseInt(limit) || 50, 100),
        skip: parseInt(skip) || 0,
      });

      return res.status(200).json({
        success: true,
        data: result.deliveries,
        pagination: {
          skip: parseInt(skip) || 0,
          limit: Math.min(parseInt(limit) || 50, 100),
          total: result.total,
        },
      });
    } catch (error) {
      safeLog('[SmsController] Error in searchDeliveries:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to search deliveries',
      });
    }
  }

  /**
   * Get SMS logs for delivery schedule
   * GET /api/v1/sms/deliveries/:scheduleId/messages
   */
  async getScheduleMessages(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      const { scheduleId } = req.params;
      const { skip = 0, limit = 50 } = req.query;

      if (!homeId) {
        return res.status(401).json({
          success: false,
          message: 'Home not found',
        });
      }

      // Verify schedule belongs to user
      const schedule = await DeliverySchedule.findOne({
        _id: scheduleId,
        homeId,
      }).lean();

      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: 'Schedule not found',
        });
      }

      // Get SMS messages
      const messages = await SmsLog.find({
        _id: { $in: schedule.smsIds },
      })
        .sort({ createdAt: -1 })
        .skip(parseInt(skip) || 0)
        .limit(Math.min(parseInt(limit) || 50, 100))
        .lean();

      return res.status(200).json({
        success: true,
        data: messages,
        pagination: {
          skip: parseInt(skip) || 0,
          limit: Math.min(parseInt(limit) || 50, 100),
          total: schedule.smsIds.length,
        },
      });
    } catch (error) {
      safeLog('[SmsController] Error in getScheduleMessages:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch messages',
      });
    }
  }

  /**
   * List notification-created deliveries that need date/time confirmation.
   * GET /api/v1/sms/deliveries/needs-confirmation
   */
  async getDeliveriesNeedingConfirmation(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      if (!homeId) {
        logs.error('[SmsController] confirmation list home missing');
        return res.status(401).json({
          success: false,
          message: 'Home not found',
        });
      }

      const deliveries = await deliveryNotificationService.listConfirmationRequired(homeId);
      return res.status(200).json({
        success: true,
        data: deliveries,
        pagination: {
          skip: 0,
          limit: deliveries.length,
          total: deliveries.length,
        },
      });
    } catch (error) {
      logs.error('[SmsController] confirmation list failed', {
        message: error.message,
      });
      return res.status(Number(error.status) || 500).json({
        success: false,
        code: error.code || 'DELIVERY_CONFIRMATION_LIST_FAILED',
        message: error.message || 'Failed to fetch deliveries needing confirmation',
      });
    }
  }

  /**
   * Update a delivery schedule without marking it delivered.
   * PATCH /api/v1/sms/deliveries/:scheduleId
   */
  async updateDeliverySchedule(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      if (!homeId) {
        logs.error('[SmsController] update delivery home missing');
        return res.status(401).json({ success: false, message: 'Home not found' });
      }

      const schedule = await deliveryNotificationService.updateSchedule(
        homeId,
        req.params.scheduleId,
        req.body
      );
      return res.status(200).json({ success: true, data: schedule });
    } catch (error) {
      logs.error('[SmsController] update delivery failed', {
        scheduleId: req.params.scheduleId,
        message: error.message,
      });
      return res.status(Number(error.status) || 500).json({
        success: false,
        code: error.code || 'DELIVERY_UPDATE_FAILED',
        message: error.message || 'Failed to update delivery schedule',
      });
    }
  }

  /**
   * Confirm date/time for an uncertain notification schedule.
   * PATCH /api/v1/sms/deliveries/:scheduleId/confirm
   */
  async confirmDeliverySchedule(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      if (!homeId) {
        logs.error('[SmsController] confirm delivery home missing');
        return res.status(401).json({ success: false, message: 'Home not found' });
      }

      const schedule = await deliveryNotificationService.confirmSchedule(
        homeId,
        req.params.scheduleId,
        req.body
      );
      return res.status(200).json({ success: true, data: schedule });
    } catch (error) {
      logs.error('[SmsController] confirm delivery failed', {
        scheduleId: req.params.scheduleId,
        message: error.message,
      });
      return res.status(Number(error.status) || 500).json({
        success: false,
        code: error.code || 'DELIVERY_CONFIRM_FAILED',
        message: error.message || 'Failed to confirm delivery schedule',
      });
    }
  }

  /**
   * Delete a delivery schedule.
   * DELETE /api/v1/sms/deliveries/:scheduleId
   */
  async deleteDeliverySchedule(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      if (!homeId) {
        logs.error('[SmsController] delete delivery home missing');
        return res.status(401).json({ success: false, message: 'Home not found' });
      }

      const result = await deliveryNotificationService.deleteSchedule(homeId, req.params.scheduleId);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      logs.error('[SmsController] delete delivery failed', {
        scheduleId: req.params.scheduleId,
        message: error.message,
      });
      return res.status(Number(error.status) || 500).json({
        success: false,
        code: error.code || 'DELIVERY_DELETE_FAILED',
        message: error.message || 'Failed to delete delivery schedule',
      });
    }
  }

  /**
   * Get SMS statistics for home
   * GET /api/v1/sms/stats
   */
  async getStats(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      if (!homeId) {
        return res.status(401).json({
          success: false,
          message: 'Home not found',
        });
      }

      const [totalSms, upcoming, delivered, failed] = await Promise.all([
        SmsLog.countDocuments({ homeId }),
        DeliverySchedule.countDocuments({
          homeId,
          currentStatus: { $in: ['initiated', 'arriving_soon', 'out_for_delivery', 'upon_arrival'] },
        }),
        DeliverySchedule.countDocuments({
          homeId,
          currentStatus: 'delivered',
        }),
        DeliverySchedule.countDocuments({
          homeId,
          currentStatus: 'failed',
        }),
      ]);

      // Get company breakdown
      const byCompany = await DeliverySchedule.aggregate([
        { $match: { homeId } },
        { $group: { _id: '$deliveryCompany', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);

      return res.status(200).json({
        success: true,
        data: {
          totalSms,
          statistics: {
            upcoming,
            delivered,
            failed,
          },
          byCompany: byCompany.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
        },
      });
    } catch (error) {
      safeLog('[SmsController] Error in getStats:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
      });
    }
  }

  /**
   * Create a delivery schedule manually from the mobile app.
   * POST /api/v1/sms/deliveries/manual
   */
  async createManualDeliverySchedule(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      const productTitle = String(req.body?.productTitle || '').trim();
      const orderId = String(req.body?.orderId || '').trim();
      const awbNumber = String(req.body?.awbNumber || '').trim();
      const otpCode = String(req.body?.otpCode || '').trim();
      const clientIdempotencyKey = normalizeIdempotencyKey(
        req.get?.('x-idempotency-key') || req.body?.idempotencyKey
      );

      if (!homeId) {
        logs.error('[SmsController] manual_delivery_home_missing', {
          userId: req.user?._id ? String(req.user._id) : null,
        });
        return res.status(401).json({
          success: false,
          message: 'Home not found',
        });
      }

      if (!productTitle || !orderId || !awbNumber) {
        logs.error('[SmsController] manual_delivery_validation_failed', {
          homeId: String(homeId),
          hasProductTitle: Boolean(productTitle),
          hasOrderId: Boolean(orderId),
          hasAwbNumber: Boolean(awbNumber),
        });
        return res.status(400).json({
          success: false,
          message: 'productTitle, orderId and awbNumber are required',
        });
      }

      const normalizedProductTitle = productTitle.replace(/\s+/g, ' ').trim();
      const normalizedOrderId = orderId.replace(/\s+/g, ' ').trim();
      const normalizedAwbNumber = awbNumber.replace(/\s+/g, '').trim().toUpperCase();
      const normalizedOtpCode = otpCode.replace(/\D/g, '').trim();
      const referenceId = normalizedAwbNumber || normalizedOrderId;
      const now = new Date();
      const manualMessage = 'Manually scheduled from dvari app';
      const scheduleGroupId = smsParserService.generateScheduleGroupId('manual', referenceId);
      const payloadHash = hashManualSchedulePayload({
        productTitle: normalizedProductTitle,
        orderId: normalizedOrderId,
        awbNumber: normalizedAwbNumber,
        otpCode: normalizedOtpCode,
      });
      const idempotencyKey =
        clientIdempotencyKey || `manual-delivery-${payloadHash.slice(0, 32)}`;

      logs.info('[SmsController] manual_delivery_create_requested', {
        homeId: String(homeId),
        referenceId,
        hasClientIdempotencyKey: Boolean(clientIdempotencyKey),
        hasOtpCode: Boolean(normalizedOtpCode),
      });

      const idempotentSchedule = await DeliverySchedule.findOne({
        homeId,
        manualIdempotencyKey: idempotencyKey,
      });

      if (idempotentSchedule) {
        if (
          idempotentSchedule.manualPayloadHash &&
          idempotentSchedule.manualPayloadHash !== payloadHash
        ) {
          logs.error('[SmsController] manual_delivery_idempotency_conflict', {
            homeId: String(homeId),
            scheduleId: String(idempotentSchedule._id),
          });
          return res.status(409).json({
            success: false,
            message: 'Idempotency key was already used with a different payload',
          });
        }

        logs.info('[SmsController] manual_delivery_idempotency_replayed', {
          homeId: String(homeId),
          scheduleId: String(idempotentSchedule._id),
        });
        return res.status(idempotentSchedule.manualIdempotencyStatusCode || 200).json({
          success: true,
          data: idempotentSchedule,
        });
      }

      let schedule = await DeliverySchedule.findOne({
        homeId,
        currentStatus: { $in: ['initiated', 'arriving_soon', 'out_for_delivery', 'upon_arrival'] },
        $or: [
          { awbNumber: normalizedAwbNumber },
          { orderHint: normalizedOrderId },
          { referenceId },
        ],
      }).sort({ updatedAt: -1, createdAt: -1 });

      const isNewSchedule = !schedule;
      if (!schedule) {
        schedule = new DeliverySchedule({
          homeId,
          source: 'manual',
          scheduleGroupId,
          referenceId,
          deliveryCompany: 'manual',
          currentStatus: 'initiated',
          productSummary: normalizedProductTitle,
          orderHint: normalizedOrderId,
          awbNumber: normalizedAwbNumber,
          otpCode: normalizedOtpCode || '',
          scheduledAt: now,
          statusHistory: [],
          latestSmsId: null,
          smsIds: [],
          smsCount: 0,
          manualIdempotencyKey: idempotencyKey,
          manualPayloadHash: payloadHash,
        });
      } else {
        schedule.source = schedule.source === 'sms' && !schedule.smsCount
          ? 'manual'
          : (schedule.source || 'manual');
        schedule.scheduleGroupId = schedule.scheduleGroupId || scheduleGroupId;
        schedule.referenceId = referenceId;
        schedule.deliveryCompany = schedule.deliveryCompany || 'manual';
        schedule.productSummary = normalizedProductTitle;
        schedule.orderHint = normalizedOrderId;
        schedule.awbNumber = normalizedAwbNumber;
        if (normalizedOtpCode) {
          schedule.otpCode = normalizedOtpCode;
        }
        schedule.manualIdempotencyKey = idempotencyKey;
        schedule.manualPayloadHash = payloadHash;
        schedule.updatedAt = now;
      }
      schedule.manualIdempotencyStatusCode = isNewSchedule ? 201 : 200;

      const hasRecentManualHistory = Array.isArray(schedule.statusHistory)
        && schedule.statusHistory.some(entry =>
          entry?.smsId == null
          && entry?.status === (schedule.currentStatus || 'initiated')
          && String(entry?.messageSummary || '').toLowerCase() === manualMessage.toLowerCase()
        );

      if (!hasRecentManualHistory) {
        schedule.statusHistory.push({
          status: schedule.currentStatus || 'initiated',
          updatedAt: now,
          smsId: null,
          messageSummary: manualMessage,
        });
      }

      try {
        await schedule.save();
      } catch (saveError) {
        if (isDuplicateKeyError(saveError)) {
          const existingSchedule = await DeliverySchedule.findOne({
            homeId,
            manualIdempotencyKey: idempotencyKey,
          });

          if (existingSchedule) {
            if (
              existingSchedule.manualPayloadHash &&
              existingSchedule.manualPayloadHash !== payloadHash
            ) {
              logs.error('[SmsController] manual_delivery_idempotency_conflict_after_save', {
                homeId: String(homeId),
                scheduleId: String(existingSchedule._id),
              });
              return res.status(409).json({
                success: false,
                message: 'Idempotency key was already used with a different payload',
              });
            }

            logs.info('[SmsController] manual_delivery_idempotency_replayed_after_save', {
              homeId: String(homeId),
              scheduleId: String(existingSchedule._id),
            });
            return res.status(existingSchedule.manualIdempotencyStatusCode || 200).json({
              success: true,
              data: existingSchedule,
            });
          }
        }

        throw saveError;
      }

      logs.info('[SmsController] manual_delivery_schedule_saved', {
        homeId: String(homeId),
        scheduleId: String(schedule._id),
        created: isNewSchedule,
      });

      return res.status(isNewSchedule ? 201 : 200).json({
        success: true,
        data: schedule,
      });
    } catch (error) {
      logs.error('[SmsController] manual_delivery_schedule_failed', {
        error: error.message,
      });
      safeLog('[SmsController] Error in createManualDeliverySchedule:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to create manual delivery schedule',
      });
    }
  }

  /**
   * Mark delivery as completed manually
   * PATCH /api/v1/sms/deliveries/:scheduleId/mark-delivered
   */
  async markDelivered(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      const { scheduleId } = req.params;

      if (!homeId) {
        return res.status(401).json({
          success: false,
          message: 'Home not found',
        });
      }

      const schedule = await DeliverySchedule.findOneAndUpdate(
        { _id: scheduleId, homeId },
        {
          currentStatus: 'delivered',
          markedDelivered: true,
          completedAt: new Date(),
        },
        { new: true }
      );

      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: 'Schedule not found',
        });
      }

      const alreadyTracked = schedule.statusHistory.some(
        entry => String(entry.smsId || '') === '' && entry.status === 'delivered'
      );

      if (!alreadyTracked) {
        schedule.statusHistory.push({
          status: 'delivered',
          updatedAt: new Date(),
          smsId: null,
          messageSummary: 'Approved from mobile app',
        });
        await schedule.save();
      }

      // If a tablet scanned this delivery and is waiting for a resident decision,
      // promote the matching DeliverySession to OTP-ready so the tablet can proceed.
      try {
        const scheduleCode = String(schedule.otpCode || '').replace(/\D/g, '');
        const code = scheduleCode || String(Math.floor(1000 + Math.random() * 9000));
        const otpCodeHash = await bcrypt.hash(code, 8);
        const updatedSession = await updateMatchingTabletDeliverySession(homeId, schedule, {
          state: 'otp_generated',
          otpCodeHash,
          otpPreview: maskCode(code),
          otpExpiresAt: inMinutes(10),
          finalStatus: '',
          meta: {
            otpCode: code,
            codeIssuedToTablet: true,
            approvedAt: new Date().toISOString(),
          },
        });
        safeLog('[SmsController] approve -> tablet session', updatedSession ? 'updated' : 'not_found', {
          scheduleId: String(schedule._id),
          activeSessionId: String(schedule.activeTabletDeliverySessionId || ''),
          updatedSessionId: updatedSession ? String(updatedSession._id) : null,
          state: updatedSession ? updatedSession.state : null,
        });
      } catch (err) {
        safeLog('[SmsController] Delivery session update failed (approve):', err?.message || String(err));
      }

      return res.status(200).json({
        success: true,
        data: schedule,
      });
    } catch (error) {
      safeLog('[SmsController] Error in markDelivered:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to update delivery status',
      });
    }
  }

  /**
   * Respond to a tablet-scanned delivery request.
   * PATCH /api/v1/sms/deliveries/:scheduleId/respond
   * Body: { decision: 'approved' | 'rejected', reason?: string }
   *
   * This endpoint is purpose-built for the "visitor at door -> approve -> show OTP on tablet" flow.
   * It updates the active tablet DeliverySession immediately, without marking the schedule as delivered.
   */
  async respondDelivery(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      const { scheduleId } = req.params;
      const decision = String(req.body?.decision || '').trim().toLowerCase();
      const reason = String(req.body?.reason || '').trim();

      if (!homeId) {
        return res.status(401).json({ success: false, message: 'Home not found' });
      }

      if (decision !== 'approved' && decision !== 'rejected') {
        return res.status(400).json({ success: false, message: 'decision must be approved or rejected' });
      }

      const schedule = await DeliverySchedule.findOne({ _id: scheduleId, homeId });
      if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
      }

      if (decision === 'approved') {
        let scheduleCode = String(schedule.otpCode || '').replace(/\D/g, '');

        // If OTP wasn't captured at schedule creation time (common when OTP arrives as "123 456" / "12-34-56"),
        // attempt to extract it from the latest SMS for this schedule at approval time.
        if (!scheduleCode && schedule.latestSmsId) {
          try {
            const latestSms = await SmsLog.findById(schedule.latestSmsId).select('rawText').lean();
            const rawText = String(latestSms?.rawText || '');
            if (rawText) {
              const extracted = await smsParserService.extractData(rawText, schedule.deliveryCompany);
              const extractedCode = String(extracted?.extractedData?.otpCode || '').replace(/\D/g, '');
              if (extractedCode.length >= 4 && extractedCode.length <= 8) {
                schedule.otpCode = extractedCode;
                await schedule.save();
                scheduleCode = extractedCode;
              }
            }
          } catch (_e) {
            // non-blocking
          }
        }

        const code = scheduleCode || String(Math.floor(1000 + Math.random() * 9000));
        const otpCodeHash = await bcrypt.hash(code, 8);
        const updatedSession = await updateMatchingTabletDeliverySession(homeId, schedule, {
          state: 'otp_generated',
          otpCodeHash,
          otpPreview: maskCode(code),
          otpExpiresAt: inMinutes(10),
          finalStatus: '',
          meta: {
            otpCode: code,
            codeIssuedToTablet: true,
            approvedAt: new Date().toISOString(),
          },
        });

        // Keep schedule in upcoming state; this is an approval, not delivery completion.
        schedule.currentStatus = 'upon_arrival';
        schedule.statusHistory = Array.isArray(schedule.statusHistory) ? schedule.statusHistory : [];
        schedule.statusHistory.push({
          status: 'upon_arrival',
          updatedAt: new Date(),
          smsId: null,
          messageSummary: 'Approved from mobile app',
        });
        await schedule.save();

        safeLog('[SmsController] respondDelivery approved', 'done', {
          scheduleId: String(schedule._id),
          updatedSessionId: updatedSession ? String(updatedSession._id) : null,
          sessionState: updatedSession ? updatedSession.state : null,
        });

        return res.status(200).json({
          success: true,
          data: {
            schedule,
            tablet: {
              sessionId: updatedSession ? String(updatedSession._id) : null,
              state: updatedSession?.state || null,
              otpPreview: updatedSession?.otpPreview || null,
            },
          },
        });
      }

      // rejected
      const updatedSession = await updateMatchingTabletDeliverySession(homeId, schedule, {
        state: 'rejected',
        finalStatus: 'rejected',
        meta: {
          rejectedAt: new Date().toISOString(),
          rejectionReason: reason || 'rejected_from_mobile',
          codeIssuedToTablet: false,
        },
      });

      schedule.currentStatus = 'failed';
      schedule.completedAt = new Date();
      schedule.statusHistory = Array.isArray(schedule.statusHistory) ? schedule.statusHistory : [];
      schedule.statusHistory.push({
        status: 'failed',
        updatedAt: new Date(),
        smsId: null,
        messageSummary: reason || 'Rejected from mobile app',
      });
      await schedule.save();

      safeLog('[SmsController] respondDelivery rejected', 'done', {
        scheduleId: String(schedule._id),
        updatedSessionId: updatedSession ? String(updatedSession._id) : null,
        sessionState: updatedSession ? updatedSession.state : null,
      });

      return res.status(200).json({
        success: true,
        data: {
          schedule,
          tablet: {
            sessionId: updatedSession ? String(updatedSession._id) : null,
            state: updatedSession?.state || null,
          },
        },
      });
    } catch (error) {
      safeLog('[SmsController] Error in respondDelivery:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to respond to delivery request' });
    }
  }

  /**
   * Select verification method before the tablet scans this scheduled delivery.
   * PATCH /api/v1/sms/deliveries/:scheduleId/verification-method
   * Body: { method: 'nfc_card' | 'approve_in_app' | 'none' }
   */
  async selectVerificationMethod(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      const { scheduleId } = req.params;
      const method = String(req.body?.method || '').trim().toLowerCase();

      if (!homeId) {
        return res.status(401).json({ success: false, message: 'Home not found' });
      }

      if (!['nfc_card', 'approve_in_app', 'none'].includes(method)) {
        return res.status(400).json({ success: false, message: 'method must be nfc_card, approve_in_app or none' });
      }

      const schedule = await DeliverySchedule.findOne({ _id: scheduleId, homeId });
      if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
      }

      schedule.verificationMethod = method === 'nfc_card' ? 'nfc' : method === 'approve_in_app' ? 'app' : 'none';
      schedule.statusHistory = Array.isArray(schedule.statusHistory) ? schedule.statusHistory : [];
      schedule.statusHistory.push({
        status: schedule.currentStatus,
        updatedAt: new Date(),
        smsId: null,
        messageSummary: schedule.verificationMethod === 'nfc'
          ? 'NFC card selected for delivery approval'
          : 'Mobile app approval selected for delivery',
      });
      await schedule.save();

      if (schedule.verificationMethod !== 'nfc' && schedule.activeTabletDeliverySessionId) {
        await DeliverySession.updateOne(
          {
            _id: schedule.activeTabletDeliverySessionId,
            homeId,
            state: 'awaiting_nfc_card',
          },
          {
            $set: {
              state: 'resident_notified',
              'meta.verificationMethod': 'app',
              'meta.codeIssuedToTablet': false,
            },
          }
        );
      }

      safeLog('[SmsController] selectVerificationMethod', 'done', {
        scheduleId: String(schedule._id),
        method: schedule.verificationMethod,
      });

      return res.status(200).json({ success: true, data: schedule });
    } catch (error) {
      safeLog('[SmsController] Error in selectVerificationMethod:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to update verification method' });
    }
  }

  /**
   * Save customer rating for a delivery schedule.
   * PATCH /api/v1/sms/deliveries/:scheduleId/rating
   * Body: { score: 1..5, comment?: string }
   */
  async rateDelivery(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      const { scheduleId } = req.params;
      const score = Number(req.body?.score);
      const comment = String(req.body?.comment || '').trim();

      if (!homeId) {
        return res.status(401).json({
          success: false,
          message: 'Home not found',
        });
      }

      if (!Number.isFinite(score) || score < 1 || score > 5) {
        return res.status(400).json({
          success: false,
          message: 'score must be between 1 and 5',
        });
      }

      const schedule = await DeliverySchedule.findOneAndUpdate(
        { _id: scheduleId, homeId },
        {
          rating: score,
          ratingComment: comment,
          ratedAt: new Date(),
        },
        { new: true, runValidators: true }
      ).populate('latestSmsId');

      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: 'Schedule not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: schedule,
      });
    } catch (error) {
      safeLog('[SmsController] Error in rateDelivery:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to save delivery rating',
      });
    }
  }

  /**
   * Mark delivery as rejected manually
   * PATCH /api/v1/sms/deliveries/:scheduleId/mark-failed
   */
  async markFailed(req, res) {
    try {
      const homeId = resolveHomeId(req.user);
      const { scheduleId } = req.params;
      const reason = String(req.body?.reason || '').trim();

      if (!homeId) {
        return res.status(401).json({
          success: false,
          message: 'Home not found',
        });
      }

      const update = {
        currentStatus: 'failed',
        markedDelivered: false,
        completedAt: new Date(),
      };

      const schedule = await DeliverySchedule.findOneAndUpdate(
        { _id: scheduleId, homeId },
        update,
        { new: true }
      );

      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: 'Schedule not found',
        });
      }

      const alreadyTracked = schedule.statusHistory.some(
        entry => String(entry.smsId || '') === '' && entry.status === 'failed'
      );

      if (!alreadyTracked) {
        schedule.statusHistory.push({
          status: 'failed',
          updatedAt: new Date(),
          smsId: null,
          messageSummary: reason || 'Rejected from mobile app',
        });
        await schedule.save();
      }

      // Notify tablet session (if any) that the resident rejected this delivery.
      try {
        const updatedSession = await updateMatchingTabletDeliverySession(homeId, schedule, {
          state: 'rejected',
          finalStatus: 'rejected',
          meta: {
            rejectedAt: new Date().toISOString(),
            rejectionReason: reason || 'rejected_from_mobile',
            codeIssuedToTablet: false,
          },
        });
        safeLog('[SmsController] reject -> tablet session', updatedSession ? 'updated' : 'not_found', {
          scheduleId: String(schedule._id),
          activeSessionId: String(schedule.activeTabletDeliverySessionId || ''),
          updatedSessionId: updatedSession ? String(updatedSession._id) : null,
          state: updatedSession ? updatedSession.state : null,
        });
      } catch (err) {
        safeLog('[SmsController] Delivery session update failed (reject):', err?.message || String(err));
      }

      return res.status(200).json({
        success: true,
        data: schedule,
      });
    } catch (error) {
      safeLog('[SmsController] Error in markFailed:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to update delivery status',
      });
    }
  }

    /**
   * Extract delivery context from a raw English SMS using a local Ollama model
   * POST /api/v1/sms/extract-delivery-context
   */
    async extractDeliveryContext(req, res) {
      try {
        const smsText = String(req.body?.smsText || '').trim();
  
        if (!smsText) {
          return res.status(400).json({
            success: false,
            message: 'smsText is required',
          });
        }
  
        const result = await ollamaDeliveryExtractorService.extractDeliveryContext(smsText);
  
        return res.status(200).json({
          success: true,
          data: result.extracted,
          meta: {
            model: result.model,
            usage: result.usage,
          },
        });
      } catch (error) {
        safeLog('[SmsController] Error in extractDeliveryContext:', error.message);
        return res.status(Number(error.status) || 500).json({
          success: false,
          code: error.code || 'DELIVERY_SMS_EXTRACTION_FAILED',
          message: error.message || 'Failed to extract delivery SMS context',
        });
      }
    }
}

module.exports = new SmsController();
