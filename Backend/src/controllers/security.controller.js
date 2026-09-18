const SecurityEvent = require('../models/SecurityEvent');
const Delivery = require('../models/Delivery');
const { resolveHomeId } = require('../utils/home');

exports.overview = async (req, res, next) => {
  try {
    const homeId = resolveHomeId(req.user);
    const [events, recordings] = await Promise.all([
      SecurityEvent.find({ homeId }).sort({ createdAt: -1 }).limit(10).lean(),
      Delivery.find({ homeId, recordingUrl: { $ne: '' } }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    return res.json({
      ok: true,
      message: 'Security overview fetched successfully',
      data: {
        recentEvents: events,
        recentRecordings: recordings.map((r) => ({
          _id: r._id,
          orderId: r.orderId,
          title: r.title,
          recordingUrl: r.recordingUrl,
          thumbnailUrl: r.recordingThumbnailUrl || r.packageImageUrl,
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.events = async (req, res, next) => {
  try {
    const homeId = resolveHomeId(req.user);
    const items = await SecurityEvent.find({ homeId }).sort({ createdAt: -1 }).lean();
    return res.json({ ok: true, message: 'Security events fetched successfully', data: { items } });
  } catch (err) {
    next(err);
  }
};

exports.getEvent = async (req, res, next) => {
  try {
    const homeId = resolveHomeId(req.user);
    const item = await SecurityEvent.findOne({ _id: req.params.id, homeId }).lean();
    if (!item) {
      return res.status(404).json({ ok: false, code: 'SECURITY_EVENT_NOT_FOUND', message: 'Security event not found', error: 'Security event not found' });
    }
    return res.json({ ok: true, message: 'Security event fetched successfully', data: item });
  } catch (err) {
    next(err);
  }
};

exports.recordings = async (req, res, next) => {
  try {
    const homeId = resolveHomeId(req.user);
    const items = await Delivery.find({ homeId, recordingUrl: { $ne: '' } }).sort({ createdAt: -1 }).lean();
    return res.json({
      ok: true,
      message: 'Recordings fetched successfully',
      data: {
        items: items.map((r) => ({
          _id: r._id,
          orderId: r.orderId,
          title: r.title,
          recordingUrl: r.recordingUrl,
          thumbnailUrl: r.recordingThumbnailUrl || r.packageImageUrl,
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getRecording = async (req, res, next) => {
  try {
    const homeId = resolveHomeId(req.user);
    const item = await Delivery.findOne({ _id: req.params.id, homeId }).lean();
    if (!item || !item.recordingUrl) {
      return res.status(404).json({ ok: false, code: 'RECORDING_NOT_FOUND', message: 'Recording not found', error: 'Recording not found' });
    }
    return res.json({
      ok: true,
      message: 'Recording fetched successfully',
      data: {
        _id: item._id,
        title: item.title,
        streamUrl: item.recordingUrl,
        thumbnailUrl: item.recordingThumbnailUrl || item.packageImageUrl,
      },
    });
  } catch (err) {
    next(err);
  }
};
