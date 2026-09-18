const { z } = require('zod');

const emptyToUndefined = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return value;
};

const optionalText = (max) => z.preprocess(
  emptyToUndefined,
  z.string().trim().max(max).optional()
);

const optionalIsoDate = z.preprocess(
  emptyToUndefined,
  z.string().datetime({ offset: true }).optional()
);

const optionalReference = z.preprocess(
  emptyToUndefined,
  z.string().trim().max(120).regex(/^[A-Za-z0-9][A-Za-z0-9-]{2,119}$/).optional()
);

const reminderLeadMinutes = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(5).max(1440).optional()
);

const deliveryStatus = z.enum([
  'initiated',
  'arriving_soon',
  'out_for_delivery',
  'scheduled',
  'delivered',
  'failed',
  'unknown',
]).default('unknown');

const deliveryNotificationIngestSchema = z.object({
  hashedNotificationId: z.string().trim().regex(/^[a-f0-9]{32,128}$/i),
  sourcePackage: z.string().trim().min(3).max(160),
  notificationPostedAt: z.string().datetime({ offset: true }),
  merchantName: optionalText(80),
  courierName: optionalText(80),
  orderTrackingId: optionalReference,
  deliveryDate: optionalIsoDate,
  deliveryTimeWindow: optionalText(80),
  deliveryStatus,
  needsConfirmation: z.coerce.boolean().default(false),
  confidence: z.coerce.number().min(0).max(100).default(0),
  timezone: optionalText(80),
  keywordMatches: z.array(z.string().trim().min(2).max(40)).max(30).default([]),
  reminderLeadMinutes,
});

const updateNotificationDeliverySchema = z.object({
  deliveryCompany: optionalText(80),
  referenceId: optionalReference,
  orderHint: optionalText(120),
  awbNumber: optionalText(120),
  expectedDeliveryDate: optionalIsoDate,
  deliveryTimeWindow: optionalText(80),
  productSummary: optionalText(160),
  sellerName: optionalText(120),
  riderName: optionalText(120),
  riderPhone: optionalText(30),
  reminderLeadMinutes,
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: 'At least one field is required',
});

const confirmNotificationDeliverySchema = z.object({
  expectedDeliveryDate: z.string().datetime({ offset: true }),
  deliveryTimeWindow: z.string().trim().min(2).max(80),
  reminderLeadMinutes,
});

module.exports = {
  deliveryNotificationIngestSchema,
  updateNotificationDeliverySchema,
  confirmNotificationDeliverySchema,
};
