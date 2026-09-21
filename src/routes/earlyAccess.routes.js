const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { validateBody, validateQuery } = require('../middleware/validateZod');
const controller = require('../controllers/earlyAccess.controller');
const {
  earlyAccessRequestSchema,
  earlyAccessListQuerySchema,
} = require('../schemas/earlyAccess.schemas');

const router = express.Router();

router.post('/', validateBody(earlyAccessRequestSchema), controller.create);
router.get('/', requireAuth, validateQuery(earlyAccessListQuerySchema), controller.list);
router.get('/:id', requireAuth, controller.getById);

module.exports = router;
