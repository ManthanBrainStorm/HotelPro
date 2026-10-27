const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';

exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 100000 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
});

exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 100000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in 15 minutes.' },
});
