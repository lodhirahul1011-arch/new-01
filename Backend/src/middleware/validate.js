const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Validation error',
      error: 'Validation error',
      details: errors.array(),
    });
  }
  return next();
}

module.exports = { validate };
