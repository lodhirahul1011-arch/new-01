const { ZodError } = require('zod');

/**
 * Validate request body with a Zod schema.
 * Keeps new modules clean & consistent without rewriting older express-validator routes.
 */
function validateBody(schema) {
  return function (req, res, next) {
    try {
      const parsed = schema.parse(req.body);
      req.body = parsed;
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          ok: false,
          code: 'VALIDATION_ERROR',
          message: 'Validation error',
          error: 'Validation error',
          details: err.issues,
        });
      }
      return next(err);
    }
  };
}

/**
 * Validate querystring with a Zod schema.
 */
function validateQuery(schema) {
  return function (req, res, next) {
    try {
      const parsed = schema.parse(req.query);
      req.query = parsed;
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          ok: false,
          code: 'VALIDATION_ERROR',
          message: 'Validation error',
          error: 'Validation error',
          details: err.issues,
        });
      }
      return next(err);
    }
  };
}

module.exports = { validateBody, validateQuery };
