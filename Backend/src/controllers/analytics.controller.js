const analyticsService = require('../services/analytics.service');

async function monthlyReport(req, res, next) {
  try {
    const data = await analyticsService.getMonthlyReport(req.user, req.query.month, req.query.category);
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

async function exportPdf(req, res, next) {
  try {
    const { filename, buffer } = await analyticsService.exportMonthlyPdf(req.user, req.query.month, req.query.category);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
}

async function exportExcel(req, res, next) {
  try {
    const { filename, buffer } = await analyticsService.exportMonthlyExcel(req.user, req.query.month, req.query.category);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
}

async function sharePayload(req, res, next) {
  try {
    const data = await analyticsService.getSharePayload(req.user, req.query.month, req.query.category);
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = { monthlyReport, exportPdf, exportExcel, sharePayload };
