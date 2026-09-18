const { z } = require('zod');

const DEVICE_TYPES = ['box', 'doorbell', 'camera', 'tablet', 'other'];

const provisionSchema = z
  .object({
    deviceId: z.string().min(3),
    type: z.enum(DEVICE_TYPES).optional(),
    name: z.string().min(2).max(60).optional(),
  })
  .strict();

const linkDeviceSchema = z
  .object({
    qrToken: z.string().min(10),
  })
  .strict();

const updateDeviceSchema = z
  .object({
    name: z.string().min(2).max(60).optional(),
    type: z.enum(DEVICE_TYPES).optional(),
    onboardingCompleted: z.boolean().optional(),
    simpleModeEnabled: z.boolean().optional(),
    settings: z
      .object({
        wallpaperUrl: z.string().url().optional(),
        wallpaperPreset: z.string().optional(),
        fontSize: z.number().min(10).max(30).optional(),
        theme: z.string().optional(),
        language: z.string().min(2).max(20).optional(),
        timezone: z.string().min(2).max(60).optional(),
        displayName: z.string().min(2).max(80).optional(),
      })
      .optional(),
  })
  .strict();

const heartbeatSchema = z
  .object({
    status: z.enum(['online', 'offline']).optional(),
    batteryLevel: z.number().min(0).max(100).optional(),
    networkType: z.string().min(2).max(30).optional(),
    appVersion: z.string().min(1).max(30).optional(),
  })
  .strict();

const connectIntegrationSchema = z
  .object({
    provider: z.enum(['amazon', 'flipkart']),
    accountIdentifier: z.string().min(3).max(120).optional(),
    note: z.string().max(200).optional(),
  })
  .strict();

const verifyIntegrationSchema = z
  .object({
    code: z.string().min(4).max(8),
  })
  .strict();

module.exports = {
  provisionSchema,
  linkDeviceSchema,
  updateDeviceSchema,
  heartbeatSchema,
  connectIntegrationSchema,
  verifyIntegrationSchema,
};
