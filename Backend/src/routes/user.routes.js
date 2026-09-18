const express = require('express');
const multer = require('multer');

const requireAuth = require('../middleware/requireAuth');
const { validateBody } = require('../middleware/validateZod');
const { updateMeSchema, preferencesSchema, fcmTokenSchema } = require('../schemas/user.schemas');
const user = require('../controllers/user.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image uploads are allowed'));
    cb(null, true);
  },
});

const router = express.Router();

router.get('/me', requireAuth, user.getMe);
router.post('/google-profile', requireAuth, user.googleProfile);
router.patch('/me', requireAuth, validateBody(updateMeSchema), user.patchMe);
router.put('/me/photo', requireAuth, upload.single('photo'), user.putPhoto);
router.delete('/me/photo', requireAuth, user.deletePhoto);

router.get('/me/preferences', requireAuth, user.getPreferences);
router.put('/me/preferences', requireAuth, validateBody(preferencesSchema), user.putPreferences);

router.post('/me/fcm-token', requireAuth, validateBody(fcmTokenSchema), user.saveFcmToken);
router.delete('/me/fcm-token', requireAuth, user.removeFcmToken);
router.delete('/account', requireAuth, user.deleteAccount);

module.exports = router;
