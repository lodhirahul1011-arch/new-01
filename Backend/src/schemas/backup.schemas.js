const { z } = require('zod');

const emptyToUndefined = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return value;
};

const objectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/);

const optionalObjectId = z.preprocess(emptyToUndefined, objectIdSchema.optional());

const assignBackupSchema = z.object({
  guestName: z.string().trim().min(2).max(80),
  deliveryId: optionalObjectId,
  notes: z.preprocess(emptyToUndefined, z.string().trim().max(200).default('')),
});

const backupOverviewQuerySchema = z.object({
  deliveryId: optionalObjectId,
});

const listBackupAssignmentsQuerySchema = z.object({
  status: z.preprocess(
    emptyToUndefined,
    z.enum(['all', 'active', 'expired', 'revoked', 'used']).default('all')
  ),
  page: z.preprocess((value) => (value === undefined || value === '' ? 1 : value), z.coerce.number().int().min(1).max(100000)),
  limit: z.preprocess((value) => (value === undefined || value === '' ? 20 : value), z.coerce.number().int().min(1).max(100)),
  deliveryId: optionalObjectId,
});

module.exports = {
  assignBackupSchema,
  backupOverviewQuerySchema,
  listBackupAssignmentsQuerySchema,
};
