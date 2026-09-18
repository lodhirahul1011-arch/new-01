const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { validateQuery } = require('../middleware/validateZod');
const { analyticsMonthQuerySchema } = require('../schemas/delivery.schemas');
const analytics = require('../controllers/analytics.controller');

const router = express.Router();

router.get('/monthly-report', requireAuth, validateQuery(analyticsMonthQuerySchema), analytics.monthlyReport);
router.get('/export/pdf', requireAuth, validateQuery(analyticsMonthQuerySchema), analytics.exportPdf);
router.get('/export/excel', requireAuth, validateQuery(analyticsMonthQuerySchema), analytics.exportExcel);
router.get('/share/whatsapp', requireAuth, validateQuery(analyticsMonthQuerySchema), analytics.sharePayload);

module.exports = router;
