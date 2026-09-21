const express = require('express');

const requireAuth = require('../middleware/requireAuth');
const requireDeviceAuth = require('../middleware/requireDeviceAuth');
const { validateBody, validateQuery } = require('../middleware/validateZod');

const {
  upcomingQuerySchema,
  deliveryDashboardQuerySchema,
  historyQuerySchema,
  historySummaryQuerySchema,
  historyFiltersQuerySchema,
  notifyArrivalSchema,
  approveSchema,
  rejectSchema,
  verifyNfcSchema,
  rateSchema,
  rescheduleSchema,
} = require('../schemas/delivery.schemas');

const delivery = require('../controllers/delivery.controller');

const router = express.Router();

router.get('/summary', requireAuth, delivery.summary);
router.get('/upcoming', requireAuth, validateQuery(upcomingQuerySchema), delivery.list);
router.get('/dashboard', requireAuth, validateQuery(deliveryDashboardQuerySchema), delivery.dashboard);
router.get('/history/summary', requireAuth, validateQuery(historySummaryQuerySchema), delivery.historySummary);
router.get('/history/filters', requireAuth, validateQuery(historyFiltersQuerySchema), delivery.historyFilters);
router.get('/history', requireAuth, validateQuery(historyQuerySchema), delivery.history);
router.get('/history/:id', requireAuth, delivery.getHistoryOne);
router.get('/recordings', requireAuth, delivery.recordings);
router.get('/:id/recording/detail', requireAuth, delivery.recordingDetail);
router.get('/:id/recording/share', requireAuth, delivery.recordingShare);
router.get('/scheduled/upcoming', requireAuth, delivery.listScheduled);
router.get('/rejection-reasons', requireAuth, delivery.rejectionReasons);

router.post('/notify-arrival', requireDeviceAuth, validateBody(notifyArrivalSchema), delivery.notifyArrival);
router.post('/verify-nfc', requireDeviceAuth, validateBody(verifyNfcSchema), delivery.verifyNfc);

router.get('/:id', requireAuth, delivery.getOne);
router.get('/:id/proof', requireAuth, delivery.proof);
router.get('/:id/recording', requireAuth, delivery.recording);
router.post('/:id/approve', requireAuth, validateBody(approveSchema), delivery.approve);
router.post('/:id/reject', requireAuth, validateBody(rejectSchema), delivery.reject);
router.post('/:id/rating', requireAuth, validateBody(rateSchema), delivery.rate);
router.post('/:id/reschedule', requireAuth, validateBody(rescheduleSchema), delivery.reschedule);

module.exports = router;
