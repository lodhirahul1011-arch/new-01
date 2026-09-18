const express = require('express');

const requireAuth = require('../middleware/requireAuth');
const { validateBody, validateQuery } = require('../middleware/validateZod');
const authorization = require('../controllers/authorization.controller');
const {
  createAuthorizationSchema,
  listAuthorizationsQuerySchema,
  authorizationSummaryQuerySchema,
  markAuthorizationUsedSchema,
  revokeAuthorizationSchema,
} = require('../schemas/authorization.schemas');

const router = express.Router();

router.use(requireAuth);

router.get('/generate-code', authorization.generateCode);
router.get('/summary', validateQuery(authorizationSummaryQuerySchema), authorization.summary);
router.get('/activity-log', validateQuery(listAuthorizationsQuerySchema), authorization.activityLog);
router.get('/', validateQuery(listAuthorizationsQuerySchema), authorization.list);
router.post('/', validateBody(createAuthorizationSchema), authorization.create);

router.get('/:id', authorization.getOne);
router.patch('/:id/use', validateBody(markAuthorizationUsedSchema), authorization.markUsed);
router.post('/:id/use', validateBody(markAuthorizationUsedSchema), authorization.markUsed);
router.patch('/:id/revoke', validateBody(revokeAuthorizationSchema), authorization.revoke);
router.post('/:id/revoke', validateBody(revokeAuthorizationSchema), authorization.revoke);

module.exports = router;
