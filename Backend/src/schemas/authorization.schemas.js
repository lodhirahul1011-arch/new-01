const { z } = require('zod');

const emptyToUndefined = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return value;
};

const asUpper = (value) => {
  const v = emptyToUndefined(value);
  return typeof v === 'string' ? v.toUpperCase() : v;
};

const optionalObjectId = z.preprocess(
  emptyToUndefined,
  z.string().regex(/^[a-fA-F0-9]{24}$/).optional()
);

const optionalDate = z.preprocess(
  emptyToUndefined,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
);

const optionalMonth = z.preprocess(
  emptyToUndefined,
  z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional()
);

const optionalTime = z.preprocess(
  emptyToUndefined,
  z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional()
);

const queryInt = (fallback, { min = 1, max = 100 } = {}) => z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(min).max(max).default(fallback)
);

const scheduleTypeSchema = z.preprocess(asUpper, z.enum(['TODAY', 'DAILY', 'CUSTOM']));
const statusSchema = z.preprocess(asUpper, z.enum(['ACTIVE', 'USED', 'EXPIRED', 'CANCELLED']));
const listStatusSchema = z.preprocess(asUpper, z.enum(['ALL', 'ACTIVE', 'USED', 'EXPIRED', 'CANCELLED']).default('ALL'));

const createAuthorizationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    accessCode: z.preprocess(emptyToUndefined, z.string().trim().regex(/^\d{4,6}$/).optional()),
    scheduleType: scheduleTypeSchema,
    startDate: optionalDate,
    endDate: optionalDate,
    startTime: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    endTime: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    timezone: z.preprocess(emptyToUndefined, z.string().trim().max(80).default('UTC')),
    deliveryPersonName: z.preprocess(emptyToUndefined, z.string().trim().max(120).default('')),
    otpRequired: z.coerce.boolean().default(false),
    company: z.preprocess(emptyToUndefined, z.string().trim().max(120).default('')),
    purpose: z.preprocess(emptyToUndefined, z.string().trim().max(120).default('delivery')),
    note: z.preprocess(emptyToUndefined, z.string().trim().max(250).default('')),
    sourceScreen: z.preprocess(emptyToUndefined, z.string().trim().max(120).default('authorization_create')),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).optional().default([]),
    linkedDeliveryId: optionalObjectId,
    singleUse: z.coerce.boolean().optional(),
    maxUses: z.coerce.number().int().min(1).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate must be greater than or equal to startDate',
      });
    }
    if (value.endTime <= value.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime must be later than startTime',
      });
    }
  });

const listAuthorizationsQuerySchema = z.object({
  status: listStatusSchema,
  page: queryInt(1, { min: 1, max: 100000 }),
  limit: queryInt(10, { min: 1, max: 100 }),
  search: z.preprocess(emptyToUndefined, z.string().trim().max(120).default('')),
  scheduleType: z.preprocess(asUpper, z.enum(['TODAY', 'DAILY', 'CUSTOM']).optional()),
  month: optionalMonth,
  linkedDeliveryId: optionalObjectId,
  sortOrder: z.preprocess(asUpper, z.enum(['ASC', 'DESC']).default('DESC')),
});

const authorizationSummaryQuerySchema = z.object({
  month: optionalMonth,
  search: z.preprocess(emptyToUndefined, z.string().trim().max(120).default('')),
});

const markAuthorizationUsedSchema = z.object({
  otpVerified: z.coerce.boolean().optional(),
  deliveryPersonName: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  linkedDeliveryId: optionalObjectId,
  usedByDeviceId: optionalObjectId,
  usedByName: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  verificationMethod: z.preprocess(
    emptyToUndefined,
    z.enum(['access_code', 'otp', 'nfc', 'app']).optional()
  ),
});

const revokeAuthorizationSchema = z.object({
  reason: z.preprocess(emptyToUndefined, z.string().trim().max(200).default('revoked_by_user')),
});

module.exports = {
  createAuthorizationSchema,
  listAuthorizationsQuerySchema,
  authorizationSummaryQuerySchema,
  markAuthorizationUsedSchema,
  revokeAuthorizationSchema,
  scheduleTypeSchema,
  statusSchema,
};
