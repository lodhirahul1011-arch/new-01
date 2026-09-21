const { z } = require('zod');

const updateMeSchema = z
  .object({
    name: z.string().min(2).max(80).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(7).max(20).optional(),
    address: z.string().max(300).optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD').optional(),
    gender: z.preprocess(
      value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.enum(['Male', 'Female', 'Prefer not to say']).optional(),
    ),
  })
  .strict();

const preferencesSchema = z
  .object({
    language: z.string().min(2).max(10).optional(),
    mode: z.enum(['active', 'away', 'simple']).optional(),
    notifications: z
      .object({
        doorbellAlerts: z.boolean().optional(),
        deliveryNotifications: z.boolean().optional(),
        visitorRecognition: z.boolean().optional(),
        securityAlerts: z.boolean().optional(),
        deviceStatus: z.boolean().optional(),
        weeklySummary: z.boolean().optional(),
      })
      .optional(),
    sound: z.string().optional(),
    vibration: z.boolean().optional(),
  })
  .strict();

const fcmTokenSchema = z
  .object({
    token: z.string().min(10),
    platform: z.enum(['ios', 'android', 'unknown']).optional(),
  })
  .strict();

module.exports = { updateMeSchema, preferencesSchema, fcmTokenSchema };
