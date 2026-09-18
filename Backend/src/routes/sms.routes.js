const express = require('express');
const smsController = require('../controllers/sms.controller');
const requireAuth = require('../middleware/requireAuth');
const { validateBody } = require('../middleware/validateZod');
const {
  deliveryNotificationIngestSchema,
  updateNotificationDeliverySchema,
  confirmNotificationDeliverySchema,
} = require('../schemas/smsNotification.schemas');

const router = express.Router();

// Provider-facing inbound webhook. The controller validates X-Webhook-Secret
// (or Authorization: Bearer <secret>) and resolves the resident by sender phone.
router.post('/inbound', smsController.receiveInboundMessage.bind(smsController));

// Resident/mobile endpoints below require authentication.
router.use(requireAuth);

/**
 * SMS Webhook Endpoints
 */

// Receive SMS from mobile app
router.post('/receive', smsController.receiveSms.bind(smsController));

// Receive structured Android notification-listener delivery data.
router.post(
  '/delivery-notifications',
  validateBody(deliveryNotificationIngestSchema),
  smsController.receiveDeliveryNotification.bind(smsController)
);

/**
 * Delivery Schedule Retrieval Endpoints
 */

// Get upcoming deliveries
router.get('/deliveries/upcoming', smsController.getUpcomingDeliveries.bind(smsController));

// Get delivery history
router.get('/deliveries/history', smsController.getDeliveryHistory.bind(smsController));

// Search deliveries
router.get('/deliveries/search', smsController.searchDeliveries.bind(smsController));

// Notification schedules that need user date/time confirmation
router.get(
  '/deliveries/needs-confirmation',
  smsController.getDeliveriesNeedingConfirmation.bind(smsController)
);

// Create a manual delivery schedule
router.post('/deliveries/manual', smsController.createManualDeliverySchedule.bind(smsController));

// Get single delivery details
router.get('/deliveries/:scheduleId', smsController.getDeliveryDetails.bind(smsController));

// Update or delete delivery schedules without automatically marking delivered
router.patch(
  '/deliveries/:scheduleId',
  validateBody(updateNotificationDeliverySchema),
  smsController.updateDeliverySchedule.bind(smsController)
);
router.delete('/deliveries/:scheduleId', smsController.deleteDeliverySchedule.bind(smsController));

// Confirm uncertain date/time before reminder scheduling
router.patch(
  '/deliveries/:scheduleId/confirm',
  validateBody(confirmNotificationDeliverySchema),
  smsController.confirmDeliverySchedule.bind(smsController)
);

// Get SMS messages for a delivery schedule
router.get('/deliveries/:scheduleId/messages', smsController.getScheduleMessages.bind(smsController));

// Mark delivery as completed
router.patch('/deliveries/:scheduleId/mark-delivered', smsController.markDelivered.bind(smsController));
router.patch('/deliveries/:scheduleId/mark-failed', smsController.markFailed.bind(smsController));

// Resident response for tablet-scanned delivery (best-effort immediate tablet sync)
router.patch('/deliveries/:scheduleId/respond', smsController.respondDelivery.bind(smsController));
router.patch('/deliveries/:scheduleId/verification-method', smsController.selectVerificationMethod.bind(smsController));

// Customer rating for approved/completed delivery schedules
router.patch('/deliveries/:scheduleId/rating', smsController.rateDelivery.bind(smsController));

/**
 * Statistics & Analytics
 */

// Get SMS statistics
router.get('/stats', smsController.getStats.bind(smsController));

// LLM-based extraction from raw English delivery SMS
router.post('/extract-delivery-context', smsController.extractDeliveryContext.bind(smsController));

module.exports = router;
// WWWW