import rateLimit from 'express-rate-limit';

const DEV_RATE_LIMIT_BYPASS = process.env.DEV_RATE_LIMIT_BYPASS === 'true' && process.env.NODE_ENV !== 'production';

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: () => DEV_RATE_LIMIT_BYPASS,
});

// Stricter rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: { error: 'Too many login attempts from this IP, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  skip: () => DEV_RATE_LIMIT_BYPASS,
});

// Rate limiter for file uploads
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 uploads per hour
  message: { error: 'Too many upload requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => DEV_RATE_LIMIT_BYPASS,
});

// Rate limiter for subscription/payment endpoints
export const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 payment operations per hour
  message: { error: 'Too many payment requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => DEV_RATE_LIMIT_BYPASS,
});
