const { z } = require('zod');

const emptyToUndefined = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return value;
};

const optionalObjectId = z.preprocess(
  emptyToUndefined,
  z.string().regex(/^[a-fA-F0-9]{24}$/).optional()
);

const optionalMonth = z.preprocess(
  emptyToUndefined,
  z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional()
);

const optionalShortString = (max = 120) => z.preprocess(
  emptyToUndefined,
  z.string().trim().max(max).optional()
);

const queryInt = (fallback, { min = 1, max = 100 } = {}) => z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(min).max(max).default(fallback)
);

const objectIdish = z.string().trim().min(1);
const isoDate = z.string().datetime({ offset: true }).or(z.string().datetime()).or(z.string().trim().min(10));

const upcomingQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(['upcoming', 'delivered', 'rejected']).optional()),
  limit: queryInt(20),
  cursor: optionalObjectId,
  search: z.preprocess(emptyToUndefined, z.string().trim().max(120).default('')),
  category: z.preprocess(emptyToUndefined, z.enum(['business', 'household', 'personal', 'other']).optional()),
});

const deliveryDashboardQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(['all', 'upcoming', 'delivered', 'rejected']).default('all')),
  limit: queryInt(20),
  cursor: optionalObjectId,
  search: z.preprocess(emptyToUndefined, z.string().trim().max(120).default('')),
  category: z.preprocess(emptyToUndefined, z.enum(['business', 'household', 'personal', 'other']).optional()),
});

const historyQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(['all', 'delivered', 'rejected']).default('all')),
  page: queryInt(1, { min: 1, max: 100000 }),
  limit: queryInt(20),
  cursor: optionalObjectId,
  month: optionalMonth,
  search: z.preprocess(emptyToUndefined, z.string().trim().max(120).default('')),
  memberId: optionalObjectId,
  company: z.preprocess(emptyToUndefined, z.string().trim().max(120).default('')),
});

const historySummaryQuerySchema = z.object({
  month: optionalMonth,
  search: z.preprocess(emptyToUndefined, z.string().trim().max(120).default('')),
  memberId: optionalObjectId,
  company: z.preprocess(emptyToUndefined, z.string().trim().max(120).default('')),
});

const historyFiltersQuerySchema = z.object({
  limitMonths: queryInt(12, { min: 1, max: 24 }),
});

const notifyArrivalSchema = z.object({
  orderId: z.string().trim().min(1),
  awbCode: z.string().trim().max(120).optional(),
  title: z.string().trim().max(120).optional(),
  company: z.string().trim().max(120).optional(),
  partnerName: z.string().trim().max(120).optional(),
  paymentStatus: z.enum(['unknown', 'prepaid', 'cod']).optional(),
  price: z.coerce.number().nonnegative().optional(),
  currency: z.string().trim().max(8).optional(),
  otp: z.string().trim().max(8).optional(),
  packageImageUrl: z.string().trim().url().optional().or(z.literal('')),
  category: z.enum(['business', 'household', 'personal', 'other']).optional(),
  partnerRating: z.coerce.number().min(0).max(5).optional(),
  scheduledFor: isoDate.optional(),
  specialInstruction: z.string().trim().max(250).optional(),
  recordingUrl: z.string().trim().url().optional().or(z.literal('')),
});

const approveSchema = z.object({
  verificationMethod: z.enum(['app']).default('app').optional(),
});

const rejectSchema = z.object({
  reason: z.string().trim().min(3).max(200).optional(),
  code: z.string().trim().max(50).optional(),
  message: z.string().trim().max(200).optional(),
}).refine((value) => Boolean(value.reason || value.code || value.message), { message: 'reason, code or message is required' });

const verifyNfcSchema = z.object({
  orderId: z.string().trim().min(1),
});

const rateSchema = z.object({
  score: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(200).optional(),
});

const rescheduleSchema = z.object({
  scheduledFor: isoDate,
  specialInstruction: z.string().trim().max(250).optional(),
  autoAccessWindowMinutes: z.coerce.number().int().min(5).max(240).default(30).optional(),
});


const dropZoneListQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(['all', 'active', 'inactive', 'disabled']).default('active')),
  search: z.preprocess(emptyToUndefined, z.string().trim().max(120).default('')),
});

const createDropZoneSchema = z.object({
  name: z.string().trim().min(3).max(50),
  type: z.enum(['locker', 'doorstep', 'reception', 'security_desk', 'garage', 'custom']),
  locationDescription: z.string().trim().min(5).max(200),
  accessCode: z.string().trim().min(4).max(8).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'disabled']).default('active').optional(),
  makeDefault: z.coerce.boolean().default(false).optional(),
});

const selectZoneSchema = z.object({
  zoneId: z.string().regex(/^[a-fA-F0-9]{24}$/),
});

const selectVerificationMethodSchema = z.object({
  method: z.enum(['nfc_card', 'approve_in_app']),
});

const analyticsMonthQuerySchema = z.object({
  month: optionalMonth,
  category: z.preprocess(emptyToUndefined, z.enum(['business', 'household', 'personal', 'other']).optional()),
});

module.exports = {
  upcomingQuerySchema,
  deliveryDashboardQuerySchema,
  historyQuerySchema,
  historySummaryQuerySchema,
  historyFiltersQuerySchema,
  notifyArrivalSchema,
  approveSchema,
  rejectSchema,
  verifyNfcSchema,
  rateSchema,
  rescheduleSchema,
  analyticsMonthQuerySchema,
  dropZoneListQuerySchema,
  createDropZoneSchema,
  selectZoneSchema,
  selectVerificationMethodSchema,
};
