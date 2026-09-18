const { z } = require('zod');

const earlyAccessRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(7).max(20),
    email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
    address: z.string().trim().min(1).max(500),
    livingIn: z.enum(['Apartment', 'Villa', 'Other']),
    livesWith: z.enum(['Family', 'Friends', 'Alone', 'Other']),
    houseOwnership: z.enum(['Rented', 'Owned', 'Other']),
  })
  .strict();

const earlyAccessListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['new', 'contacted', 'converted']).optional(),
    search: z.string().trim().max(120).optional(),
  })
  .strict();

module.exports = { earlyAccessRequestSchema, earlyAccessListQuerySchema };
