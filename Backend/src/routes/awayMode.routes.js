const express = require('express');

const requireAuth = require('../middleware/requireAuth');
const { validateBody, validateQuery } = require('../middleware/validateZod');
const awayMode = require('../controllers/awayMode.controller');
const {
  toggleAwayModeSchema,
  updateAwayModeScheduleSchema,
  generateTemporaryCodeSchema,
  updateSafeDropSchema,
  updateVideoRecordingSchema,
  awayModeOverviewQuerySchema,
} = require('../schemas/awayMode.schemas');

const router = express.Router();

router.use(requireAuth);

router.get('/overview', validateQuery(awayModeOverviewQuerySchema), awayMode.overview);
router.patch('/toggle', validateBody(toggleAwayModeSchema), awayMode.toggle);
router.put('/schedule', validateBody(updateAwayModeScheduleSchema), awayMode.saveSchedule);
router.post('/temporary-code', validateBody(generateTemporaryCodeSchema), awayMode.generateTemporaryCode);
router.put('/safe-drop', validateBody(updateSafeDropSchema), awayMode.updateSafeDrop);
router.put('/video-recording', validateBody(updateVideoRecordingSchema), awayMode.updateVideoRecording);
router.get('/presets', awayMode.presets);

module.exports = router;
