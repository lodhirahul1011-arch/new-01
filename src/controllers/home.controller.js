const Delivery = require('../models/Delivery');
const Device = require('../models/Device');
const FamilyMember = require('../models/FamilyMember');
const { resolveHomeId } = require('../utils/home');
const { computeOnlineStatus } = require('../services/devicePresenceMonitor.service');

exports.dashboard = async (req, res, next) => {
  try {
    const homeId = resolveHomeId(req.user);
    const [upcoming, delivered, rejected, members, devices, recentDeliveries, linkedDevices] = await Promise.all([
      Delivery.countDocuments({ homeId, status: 'upcoming' }),
      Delivery.countDocuments({ homeId, status: 'delivered' }),
      Delivery.countDocuments({ homeId, status: 'rejected' }),
      FamilyMember.countDocuments({ homeId, status: 'active' }),
      Device.countDocuments({ ownerUserId: req.user._id, isLinked: true }),
      Delivery.find({ homeId }).sort({ createdAt: -1 }).limit(5).lean(),
      Device.find({ ownerUserId: req.user._id, isLinked: true }).sort({ updatedAt: -1 }).limit(5).lean(),
    ]);

    return res.json({
      ok: true,
      message: 'Home dashboard fetched successfully',
      data: {
        summary: { upcoming, delivered, rejected, members, devices },
        recentDeliveries: recentDeliveries.map((item) => ({
          _id: item._id,
          title: item.title,
          orderId: item.orderId,
          status: item.status,
          company: item.company,
          createdAt: item.createdAt,
        })),
        linkedDevices: linkedDevices.map((item) => ({
          _id: item._id,
          deviceId: item.deviceId,
          name: item.name,
          type: item.type,
          status: computeOnlineStatus(item),
          isLinked: item.isLinked,
          lastSeenAt: item.lastSeenAt || null,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.activity = async (req, res, next) => {
  try {
    const homeId = resolveHomeId(req.user);
    const deliveries = await Delivery.find({ homeId }).sort({ updatedAt: -1 }).limit(10).lean();
    return res.json({
      ok: true,
      message: 'Home activity fetched successfully',
      data: {
        items: deliveries.map((item) => ({
          _id: item._id,
          type: 'delivery',
          title: item.title || item.orderId,
          status: item.status,
          happenedAt: item.updatedAt || item.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.deviceStatus = async (req, res, next) => {
  try {
    const devices = await Device.find({ ownerUserId: req.user._id, isLinked: true }).sort({ updatedAt: -1 }).lean();
    return res.json({
      ok: true,
      message: 'Device status fetched successfully',
      data: {
        items: devices.map((item) => ({
          _id: item._id,
          deviceId: item.deviceId,
          name: item.name,
          type: item.type,
          status: computeOnlineStatus(item),
          lastSeenAt: item.lastSeenAt || null,
          wallpaperUrl: item.settings?.wallpaperUrl || '',
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};
