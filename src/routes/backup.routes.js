const express = require('express');

const requireAuth = require('../middleware/requireAuth');
const { validateBody, validateQuery } = require('../middleware/validateZod');
const backup = require('../controllers/backup.controller');
const {
  assignBackupSchema,
  backupOverviewQuerySchema,
  listBackupAssignmentsQuerySchema,
} = require('../schemas/backup.schemas');

const router = express.Router();

router.use(requireAuth);

router.get('/overview', validateQuery(backupOverviewQuerySchema), backup.overview);
router.post('/assign', validateBody(assignBackupSchema), backup.assign);
router.get('/assignments', validateQuery(listBackupAssignmentsQuerySchema), backup.list);
router.delete('/assignments/:id', backup.revoke);

module.exports = router;
