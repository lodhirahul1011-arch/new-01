const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { validateBody } = require('../middleware/validateZod');
const { inviteSchema, acceptInviteSchema, patchMemberSchema } = require('../schemas/family.schemas');
const family = require('../controllers/family.controller');

const router = express.Router();

router.get('/members', requireAuth, family.list);
router.get('/roles', requireAuth, family.roles);
router.post('/invite', requireAuth, validateBody(inviteSchema), family.invite);
router.post('/accept-invite', requireAuth, validateBody(acceptInviteSchema), family.acceptInvite);
router.patch('/members/:memberId', requireAuth, validateBody(patchMemberSchema), family.patchMember);
router.delete('/members/:memberId', requireAuth, family.remove);

module.exports = router;
