const { z } = require('zod');

const inviteSchema = z
  .object({
    name: z.string().min(2).max(80),
    phone: z.string().min(7).max(20),
    channel: z.enum(['sms', 'whatsapp']).optional().default('sms'),
  })
  .strict();

const acceptInviteSchema = z
  .object({
    token: z.string().min(10),
  })
  .strict();

const patchMemberSchema = z
  .object({
    name: z.string().min(2).max(80).optional(),
    role: z.enum(['admin', 'member']).optional(),
    accessLevel: z.enum(['full', 'simple', 'nfc_only']).optional(),
  })
  .strict();

module.exports = { inviteSchema, acceptInviteSchema, patchMemberSchema };
