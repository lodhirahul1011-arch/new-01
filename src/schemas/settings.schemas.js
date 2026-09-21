const { z } = require('zod');

const notificationSettingsSchema = z
  .object({
    doorbellAlerts: z.boolean().optional(),
    deliveryNotifications: z.boolean().optional(),
    visitorRecognition: z.boolean().optional(),
    securityAlerts: z.boolean().optional(),
    deviceStatus: z.boolean().optional(),
    weeklySummary: z.boolean().optional(),
    sound: z.string().min(1).max(50).optional(),
    vibration: z.boolean().optional(),
  })
  .strict();

const languageSchema = z
  .object({
    language: z.string().min(2).max(20),
  })
  .strict();

const supportContactSchema = z
  .object({
    channel: z.enum(['whatsapp', 'call', 'email', 'in_app']).default('in_app'),
    category: z.enum(['device', 'delivery', 'billing', 'account', 'other']).default('other'),
    subject: z.string().min(3).max(120),
    message: z.string().min(10).max(2000),
    priority: z.enum(['low', 'normal', 'high']).optional(),
    appVersion: z.string().max(40).optional(),
    devicePlatform: z.string().max(40).optional(),
  })
  .strict();

module.exports = {
  notificationSettingsSchema,
  languageSchema,
  supportContactSchema,
};
