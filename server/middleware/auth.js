const jwt = require('jsonwebtoken');
const User = require('../models/User');
const httpError = require('../utils/httpError');
const { emailEnabled } = require('../utils/email');

exports.signToken = (user) =>
  jwt.sign({ id: user._id, tv: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });

exports.protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;
    if (!token) throw httpError(401, 'Please log in to continue');

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw httpError(401, 'Session expired. Please log in again');
    }
    const user = await User.findById(decoded.id);
    if (!user) throw httpError(401, 'Account no longer exists');
    if (!user.isActive) throw httpError(401, 'This account has been disabled');
    if ((decoded.tv || 0) !== (user.tokenVersion || 0)) throw httpError(401, 'Session ended. Please log in again');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(httpError(403, 'You do not have permission to do that'));
  }
  next();
};

// When real email is configured, guests must verify their address before booking.
exports.requireVerifiedEmail = (req, res, next) => {
  if (emailEnabled() && req.user.role === 'guest' && !req.user.emailVerified) {
    return next(httpError(403, 'Please verify your email address before booking'));
  }
  next();
};
