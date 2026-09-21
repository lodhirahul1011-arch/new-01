const settingsService = require('../services/settings.service');

exports.faqs = async (req, res, next) => {
  try {
    const data = await settingsService.getHelpSupport(req.user._id);
    return res.json({ ok: true, message: 'FAQs fetched successfully', data: data.faqs });
  } catch (err) {
    next(err);
  }
};

exports.contact = async (req, res, next) => {
  try {
    const data = await settingsService.createSupportTicket(req.user._id, req.body);
    return res.status(201).json({ ok: true, message: 'Support request submitted successfully', data });
  } catch (err) {
    next(err);
  }
};
