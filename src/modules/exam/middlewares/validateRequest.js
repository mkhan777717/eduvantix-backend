'use strict';

const { ValidationError } = require('../errors/customErrors');

/**
 * Express middleware to validate request payloads against a Zod schema.
 * @param {object} schema - Zod Schema
 * @param {string} [source='body'] - body, query, or params
 */
const validateRequest = (schema, source = 'body') => {
  return async (req, res, next) => {
    try {
      const parsed = await schema.parseAsync(req[source]);
      req[source] = parsed; // assign sanitized value
      next();
    } catch (error) {
      if (error.name === 'ZodError') {
        const formattedErrors = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message
        }));

        return res.status(400).json({
          success: false,
          message: 'Request validation failed',
          code: 'VALIDATION_ERROR',
          errors: formattedErrors
        });
      }
      next(new ValidationError(error.message));
    }
  };
};

module.exports = validateRequest;
