const assert = require('assert');

const {
  deliveryNotificationIngestSchema,
  updateNotificationDeliverySchema,
  confirmNotificationDeliverySchema,
} = require('../src/schemas/smsNotification.schemas');
const deliveryNotificationService = require('../src/services/deliveryNotification.service');

function run() {
  const validPayload = deliveryNotificationIngestSchema.parse({
    hashedNotificationId: 'a'.repeat(64),
    sourcePackage: 'com.google.android.apps.messaging',
    notificationPostedAt: '2026-08-16T09:00:00.000Z',
    merchantName: 'Amazon',
    orderTrackingId: 'AB12CD3456',
    deliveryDate: '2026-08-16T15:30:00.000Z',
    deliveryTimeWindow: 'By 9 PM',
    deliveryStatus: 'out_for_delivery',
    needsConfirmation: false,
    confidence: 95,
    timezone: 'Asia/Calcutta',
    keywordMatches: ['delivery', 'order'],
    reminderLeadMinutes: 60,
  });

  assert.strictEqual(validPayload.sourcePackage, 'com.google.android.apps.messaging');
  assert.strictEqual(validPayload.deliveryStatus, 'out_for_delivery');

  assert.throws(() => {
    deliveryNotificationIngestSchema.parse({
      ...validPayload,
      hashedNotificationId: 'not-a-hash',
    });
  }, /Invalid/);

  assert.throws(() => {
    deliveryNotificationIngestSchema.parse({
      ...validPayload,
      orderTrackingId: '../bad',
    });
  }, /Invalid/);

  const updatePayload = updateNotificationDeliverySchema.parse({
    expectedDeliveryDate: '2026-08-16T15:30:00.000Z',
    deliveryTimeWindow: '3 PM - 6 PM',
  });
  assert.strictEqual(updatePayload.deliveryTimeWindow, '3 PM - 6 PM');

  const confirmPayload = confirmNotificationDeliverySchema.parse({
    expectedDeliveryDate: '2026-08-16T15:30:00.000Z',
    deliveryTimeWindow: '3 PM - 6 PM',
    reminderLeadMinutes: 30,
  });
  assert.strictEqual(confirmPayload.reminderLeadMinutes, 30);

  const hashOne = deliveryNotificationService.createPayloadHash(validPayload);
  const hashTwo = deliveryNotificationService.createPayloadHash({
    ...validPayload,
    keywordMatches: ['order', 'delivery'],
  });
  const hashThree = deliveryNotificationService.createPayloadHash({
    ...validPayload,
    deliveryTimeWindow: '4 PM - 6 PM',
  });

  assert.strictEqual(hashOne, hashTwo);
  assert.notStrictEqual(hashOne, hashThree);

  console.log('Delivery notification validation tests passed');
}

run();
