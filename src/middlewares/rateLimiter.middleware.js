const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for authentication endpoints to mitigate brute-force attacks
 * Limits requests to 20 per 15 minutes per IP address.
 * Bypassed during automated tests (NODE_ENV === 'test').
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 attempts per window
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes',
  },
  skip: () => process.env.NODE_ENV === 'test',
});

module.exports = {
  authRateLimiter,
};
