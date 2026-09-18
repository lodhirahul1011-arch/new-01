const service = require('../services/deliveryAccess.service');

async function methods(req, res, next) {
  try {
    const data = await service.methods(req.user);
    return res.json({ ok: true, message: 'Delivery access methods fetched successfully', data });
  } catch (err) { next(err); }
}

async function verifyContext(req, res, next) {
  try {
    const data = await service.verifyContext(req.user, req.params.deliveryId);
    return res.json({ ok: true, message: 'Delivery verify context fetched successfully', data });
  } catch (err) { next(err); }
}

async function zones(req, res, next) {
  try {
    const data = await service.listZones(req.user, req.query || {});
    return res.json({ ok: true, message: 'Drop zones fetched successfully', data });
  } catch (err) { next(err); }
}

async function createZone(req, res, next) {
  try {
    const data = await service.createZone(req.user, req.body || {});
    return res.status(201).json({ ok: true, message: 'New zone created successfully', data });
  } catch (err) { next(err); }
}

async function selectZone(req, res, next) {
  try {
    const data = await service.selectZone(req.user, req.params.deliveryId, req.body || {});
    return res.json({ ok: true, message: 'Drop zone confirmed successfully', data });
  } catch (err) { next(err); }
}

async function selectVerificationMethod(req, res, next) {
  try {
    const data = await service.selectVerificationMethod(req.user, req.params.deliveryId, req.body || {});
    return res.json({ ok: true, message: 'Verification method selected successfully', data });
  } catch (err) { next(err); }
}

async function zoneStatus(req, res, next) {
  try {
    const data = await service.getZoneStatus(req.user, req.params.zoneId);
    return res.json({ ok: true, message: 'Drop zone status fetched successfully', data });
  } catch (err) { next(err); }
}

module.exports = { methods, verifyContext, zones, createZone, selectZone, selectVerificationMethod, zoneStatus };
