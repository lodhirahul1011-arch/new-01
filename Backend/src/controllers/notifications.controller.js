const settingsService = require('../services/settings.service');
const {
  sendPushToUser,
  sendDoorbellRingNotification,
  sendUpcomingDeliveryScheduledNotification,
  sendDeliveryBoyAtDoorNotification,
  sendTabletOfflineNotification,
  sendVisitorRecognitionNotification,
  sendSecurityAlertNotification,
  sendWeeklySummaryNotification,
} = require('../services/pushNotification.service');

exports.getAll = async (req, res, next) => {
  try {
    const data = await settingsService.getNotificationSettings(req.user._id);
    return res.json({ ok: true, message: 'Notification settings fetched successfully', data });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const data = await settingsService.updateNotificationSettings(req.user._id, req.body);
    return res.json({ ok: true, message: 'Notification settings updated successfully', data });
  } catch (err) {
    next(err);
  }
};

exports.test = async (req, res) => {
  const type = String(req.body?.type || req.query?.type || 'generic').trim().toLowerCase();
  const scheduleStub = {
    _id: 'test-schedule',
    deliveryCompany: 'Dvaari',
    orderHint: 'TEST-ORDER-123',
    referenceId: 'TEST-REF-123',
    awbNumber: 'TEST-AWB-123',
  };
  const visitorStub = {
    _id: 'test-visitor-session',
    visitorName: 'Guest',
    note: 'Test visitor notification',
  };
  const tabletStub = {
    deviceId: 'tablet-test',
    name: 'Dvaari Tablet',
    settings: { displayName: 'Dvaari Tablet' },
  };

  let result;

  switch (type) {
    case 'doorbell':
    case 'doorbell_at_door':
      result = await sendDoorbellRingNotification(req.user, visitorStub);
      break;
    case 'delivery_scheduled':
    case 'upcoming_delivery_scheduled':
      result = await sendUpcomingDeliveryScheduledNotification(req.user, scheduleStub);
      break;
    case 'delivery_at_door':
    case 'delivery_boy_at_door':
      result = await sendDeliveryBoyAtDoorNotification(req.user, scheduleStub);
      break;
    case 'tablet_offline':
    case 'device_status':
      result = await sendTabletOfflineNotification(req.user, tabletStub);
      break;
    case 'visitor':
    case 'visitor_recognition':
      result = await sendVisitorRecognitionNotification(req.user, visitorStub);
      break;
    case 'security':
    case 'security_alert':
      result = await sendSecurityAlertNotification(req.user, {
        title: 'Security alert',
        body: 'Motion detected near the main entrance.',
        severity: 'high',
      });
      break;
    case 'weekly':
    case 'weekly_summary':
      result = await sendWeeklySummaryNotification(req.user, {
        title: 'Weekly summary',
        body: '3 visitors, 2 deliveries, and 1 security event this week.',
      });
      break;
    default:
      result = await sendPushToUser(req.user, {
        notification: {
          title: 'Test notification',
          body: 'Push notifications are working.',
        },
        data: {
          type: 'test_notification',
          deepLink: 'dvari://home',
          title: 'Test notification',
          body: 'Push notifications are working.',
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'dvaari-alerts-v3',
            priority: 'high',
            defaultSound: true,
            sound: 'default',
          },
        },
      });
      break;
  }

  const ok = Number(result?.sent || 0) > 0;
  return res.status(ok ? 200 : 503).json({
    ok,
    message: ok
      ? 'Test notification sent successfully'
      : result?.reason || result?.error || 'Push notification could not be sent',
    data: { ...result, type },
  });
};

