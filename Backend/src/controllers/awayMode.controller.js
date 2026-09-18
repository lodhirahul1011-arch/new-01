const awayModeService = require('../services/awayMode.service');

async function overview(req, res, next) {
  try {
    const data = await awayModeService.getOverview(req.user, req.query || {});
    return res.json({ ok: true, message: 'Away mode overview fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function toggle(req, res, next) {
  try {
    const data = await awayModeService.toggleAwayMode(req.user, req.body || {});
    return res.json({ ok: true, message: 'Away mode updated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function saveSchedule(req, res, next) {
  try {
    const data = await awayModeService.saveSchedule(req.user, req.body || {});
    return res.json({ ok: true, message: 'Away mode schedule saved successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function generateTemporaryCode(req, res, next) {
  try {
    const data = await awayModeService.generateTemporaryCodeForUser(req.user, req.body || {});
    return res.json({ ok: true, message: 'Temporary code generated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function updateSafeDrop(req, res, next) {
  try {
    const data = await awayModeService.updateSafeDrop(req.user, req.body || {});
    return res.json({ ok: true, message: 'Safe drop settings updated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function updateVideoRecording(req, res, next) {
  try {
    const data = await awayModeService.updateVideoRecording(req.user, req.body || {});
    return res.json({ ok: true, message: 'Video recording settings updated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function presets(req, res, next) {
  try {
    const data = await awayModeService.getPresets();
    return res.json({ ok: true, message: 'Away mode presets fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  overview,
  toggle,
  saveSchedule,
  generateTemporaryCode,
  updateSafeDrop,
  updateVideoRecording,
  presets,
};
