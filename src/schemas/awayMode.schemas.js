const { z } = require('zod');

const emptyToUndefined = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return value;
};

const queryBool = (fallback) => z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') return fallback;
    return value;
  },
  z.coerce.boolean()
);

const hhmmSchema = z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/);
const repeatDaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

const toggleAwayModeSchema = z.object({
  enabled: z.coerce.boolean(),
});

const updateAwayModeScheduleSchema = z
  .object({
    timezone: z.preprocess(emptyToUndefined, z.string().trim().max(80).default('Asia/Kolkata')),
    startTime: hhmmSchema,
    endTime: hhmmSchema,
    repeatDays: z.array(repeatDaySchema).min(1).max(7),
    preset: z.preprocess(
      emptyToUndefined,
      z.enum(['business_hours', 'extended_hours', 'full_day', 'afternoon_evening', 'custom']).default('custom')
    ),
  })
  .superRefine((value, ctx) => {
    if (value.endTime <= value.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'End time must be after start time',
      });
    }
  });

const generateTemporaryCodeSchema = z.object({
  forceRegenerate: z.coerce.boolean().default(false),
});

const updateSafeDropSchema = z
  .object({
    enabled: z.coerce.boolean(),
    mode: z.enum(['disabled', 'low_value_only', 'always']),
    maxValue: z.coerce.number().min(0).max(1000000),
    currency: z.preprocess(emptyToUndefined, z.string().trim().min(3).max(10).default('INR')),
    instructions: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(300).default('Package will be left at designated safe drop location with video recording.')),
  })
  .superRefine((value, ctx) => {
    if (value.enabled && value.mode === 'low_value_only' && Number.isNaN(Number(value.maxValue))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxValue'],
        message: 'maxValue is required',
      });
    }
  });

const updateVideoRecordingSchema = z
  .object({
    enabled: z.coerce.boolean(),
    mode: z.enum(['off', 'away_only', 'always']),
  })
  .superRefine((value, ctx) => {
    if (value.enabled && value.mode === 'off') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mode'],
        message: 'mode cannot be off when enabled is true',
      });
    }
    if (!value.enabled && value.mode !== 'off') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mode'],
        message: 'mode must be off when enabled is false',
      });
    }
  });

const awayModeOverviewQuerySchema = z.object({
  includeHistory: queryBool(false).optional(),
});

module.exports = {
  toggleAwayModeSchema,
  updateAwayModeScheduleSchema,
  generateTemporaryCodeSchema,
  updateSafeDropSchema,
  updateVideoRecordingSchema,
  awayModeOverviewQuerySchema,
};
