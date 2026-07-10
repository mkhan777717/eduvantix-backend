// Pass-through middleware to disable rate limiting completely
const noOpLimiter = (req, res, next) => next();

module.exports = {
  apiLimiter: noOpLimiter,
  authLimiter: noOpLimiter,
  submissionLimiter: noOpLimiter
};
