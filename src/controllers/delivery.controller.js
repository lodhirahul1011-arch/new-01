const deliveryService = require('../services/delivery.service');

async function summary(req, res, next) {
  try {
    const data = await deliveryService.getSummary(req.user, req.query || {});
    return res.json({ ok: true, message: 'Delivery summary fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function historySummary(req, res, next) {
  try {
    const data = await deliveryService.getHistorySummary(req.user, req.query);
    return res.json({ ok: true, message: 'Delivery history summary fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function historyFilters(req, res, next) {
  try {
    const data = await deliveryService.getHistoryFilters(req.user, req.query);
    return res.json({ ok: true, message: 'Delivery history filters fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function list(req, res, next) {
  try {
    const data = await deliveryService.listDeliveries(req.user, req.query);
    return res.json({ ok: true, message: 'Deliveries fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function dashboard(req, res, next) {
  try {
    const data = await deliveryService.getDashboard(req.user, req.query);
    return res.json({ ok: true, message: 'Delivery dashboard fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function history(req, res, next) {
  try {
    const data = await deliveryService.getHistory(req.user, req.query);
    return res.json({ ok: true, message: 'Delivery history fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getHistoryOne(req, res, next) {
  try {
    const data = await deliveryService.getHistoryDetail(req.user, req.params.id);
    return res.json({ ok: true, message: 'Delivery history detail fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const data = await deliveryService.getOne(req.user, req.params.id);
    return res.json({ ok: true, message: 'Delivery detail fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function approve(req, res, next) {
  try {
    const data = await deliveryService.approve(req.user, req.params.id);
    return res.json({ ok: true, message: 'Delivery approved successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function reject(req, res, next) {
  try {
    const data = await deliveryService.reject(req.user, req.params.id, req.body);
    return res.json({ ok: true, message: 'Delivery rejected successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function rate(req, res, next) {
  try {
    const data = await deliveryService.rateDelivery(req.user, req.params.id, req.body);
    return res.json({ ok: true, message: 'Delivery rated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function proof(req, res, next) {
  try {
    const wantsDownload = ['1', 'true', 'yes'].includes(String(req.query.download || '').toLowerCase());
    if (wantsDownload) {
      const file = await deliveryService.getProofDownload(req.user, req.params.id);
      if (file.redirectUrl) {
        return res.redirect(file.redirectUrl);
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      return res.send(file.buffer);
    }

    const data = await deliveryService.getProof(req.user, req.params.id);
    return res.json({ ok: true, message: 'Proof file ready', data });
  } catch (err) {
    return next(err);
  }
}

async function recording(req, res, next) {
  try {
    const wantsView = ['1', 'true', 'yes'].includes(String(req.query.view || '').toLowerCase());
    const wantsDownload = ['1', 'true', 'yes'].includes(String(req.query.download || '').toLowerCase());
    if (wantsDownload) {
      const file = await deliveryService.getRecordingDownload(req.user, req.params.id);
      return res.redirect(file.redirectUrl);
    }
    const data = await deliveryService.getRecording(req.user, req.params.id);

    if (wantsView) {
      if (!data.available || !data.streamUrl) {
        return res.status(404).json({
          ok: false,
          code: 'RECORDING_NOT_FOUND',
          message: 'Recording not available',
          error: 'Recording not available',
        });
      }
      return res.redirect(data.streamUrl);
    }

    return res.json({ ok: true, message: 'Recording fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}


async function recordings(req, res, next) {
  try {
    const data = await deliveryService.listRecordings(req.user, req.query || {});
    return res.json({ ok: true, message: 'Delivery recordings fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function recordingDetail(req, res, next) {
  try {
    const data = await deliveryService.getRecordingDetail(req.user, req.params.id);
    return res.json({ ok: true, message: 'Delivery recording detail fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function recordingShare(req, res, next) {
  try {
    const data = await deliveryService.getRecordingSharePayload(req.user, req.params.id);
    return res.json({ ok: true, message: 'Delivery recording share payload fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function rejectionReasons(req, res, next) {
  try {
    const data = await deliveryService.getRejectionReasons();
    return res.json({
      ok: true,
      message: 'Delivery rejection reasons fetched successfully',
      data,
    });
  } catch (err) {
    return next(err);
  }
}

async function listScheduled(req, res, next) {
  try {
    const data = await deliveryService.listScheduled(req.user);
    return res.json({ ok: true, message: 'Scheduled deliveries fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function reschedule(req, res, next) {
  try {
    const data = await deliveryService.rescheduleDelivery(req.user, req.params.id, req.body);
    return res.json({ ok: true, message: 'Delivery rescheduled successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function notifyArrival(req, res, next) {
  try {
    const data = await deliveryService.notifyArrival(req.device, req.body);
    return res.status(201).json({ ok: true, message: 'Delivery arrival notified successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function verifyNfc(req, res, next) {
  try {
    const data = await deliveryService.verifyNfc(req.device, req.body);
    return res.json({ ok: true, message: 'Delivery verified successfully', data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  summary,
  historySummary,
  historyFilters,
  list,
  dashboard,
  history,
  getHistoryOne,
  getOne,
  approve,
  reject,
  rate,
  proof,
  recording,
  recordings,
  recordingDetail,
  recordingShare,
  rejectionReasons,
  listScheduled,
  reschedule,
  notifyArrival,
  verifyNfc,
};
