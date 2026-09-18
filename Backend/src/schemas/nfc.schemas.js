const { z } = require('zod');

const objectIdLike = z.string().trim().min(1);
const nfcCardNumber = z.string().trim().regex(/^\d{10}$/, 'NFC card number must be exactly 10 digits');

const createNfcCardSchema = z
  .object({
    label: z.string().trim().min(2).max(60),
    uid: nfcCardNumber,
    assignedToMemberId: objectIdLike.optional().nullable(),
    cardType: z.enum(['access', 'delivery', 'member']).optional().default('access'),
    meta: z
      .object({
        source: z.string().trim().min(2).max(50).optional(),
        registrationMethod: z.string().trim().min(2).max(50).optional(),
        deviceId: objectIdLike.optional().nullable(),
        notes: z.string().trim().max(200).optional(),
      })
      .optional(),
  })
  .strict();

const updateNfcCardSchema = z
  .object({
    label: z.string().trim().min(2).max(60).optional(),
    assignedToMemberId: objectIdLike.optional().nullable(),
    cardType: z.enum(['access', 'delivery', 'member']).optional(),
    status: z.enum(['active', 'inactive', 'blocked']).optional(),
    meta: z
      .object({
        notes: z.string().trim().max(200).optional(),
      })
      .optional(),
  })
  .strict();

const verifyNfcAccessSchema = z
  .object({
    uid: nfcCardNumber,
    flow: z.enum(['delivery_access', 'member_access', 'settings_test']).optional().default('delivery_access'),
    deliveryId: objectIdLike.optional().nullable(),
    deviceId: objectIdLike.optional().nullable(),
    authorizationId: objectIdLike.optional().nullable(),
  })
  .strict();

module.exports = { createNfcCardSchema, updateNfcCardSchema, verifyNfcAccessSchema };
