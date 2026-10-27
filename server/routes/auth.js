const router = require('express').Router();
const crypto = require('crypto');
const { body } = require('express-validator');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const audit = require('../utils/audit');
const notify = require('../utils/notify');
const { emailEnabled, sendVerificationEmail } = require('../utils/email');
const { protect, signToken } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const publicUser = (u) => ({
  id: u._id, name: u.name, email: u.email, phone: u.phone || '', role: u.role,
  department: u.department, emailVerified: u.emailVerified,
});

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const phoneRule = body('phone').optional({ values: 'falsy' }).matches(/^[0-9+\-\s()]{7,18}$/).withMessage('Enter a valid phone number');
const passwordRule = (field) =>
  body(field).isString().isLength({ min: 8, max: 72 }).withMessage('Password must be 8 to 72 characters')
    .matches(/[A-Za-z]/).withMessage('Password must contain a letter')
    .matches(/\d/).withMessage('Password must contain a number');

async function issueVerification(user) {
  const raw = crypto.randomBytes(32).toString('hex');
  user.verifyTokenHash = sha(raw);
  user.verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();
  const base = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0];
  await sendVerificationEmail(user, `${base}/verify-email/${raw}`);
}

// POST /api/auth/register - always creates a guest account
router.post('/register', authLimiter, validate([
  body('name').isString().trim().isLength({ min: 2, max: 60 }).withMessage('Name must be 2 to 60 characters'),
  body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail({ gmail_remove_dots: false }),
  passwordRule('password'),
  phoneRule,
]), asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (await User.findOne({ email })) throw httpError(409, 'An account with this email already exists');

  // Without an email service configured, verification cannot be delivered, so accounts are auto-verified.
  const user = await User.create({ name, email, password, phone, emailVerified: !emailEnabled() });
  if (emailEnabled()) await issueVerification(user);
  await notify(user._id, { type: 'info', title: 'Welcome to HotelPro', message: 'Browse rooms and book your stay.', link: '/' });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

// POST /api/auth/login
router.post('/login', authLimiter, validate([
  body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail({ gmail_remove_dots: false }),
  body('password').isString().notEmpty().withMessage('Password is required'),
]), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password +failedLogins +lockUntil');

  if (user?.lockUntil && user.lockUntil > new Date()) {
    throw httpError(423, 'Too many failed attempts. Try again in a few minutes.');
  }
  if (!user || !(await user.matchPassword(password))) {
    if (user) {
      user.failedLogins = (user.failedLogins || 0) + 1;
      if (user.failedLogins >= MAX_FAILED) {
        user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
        user.failedLogins = 0;
      }
      await user.save();
    }
    await audit(req, 'login_failed', 'user', user?._id, { email });
    throw httpError(401, 'Incorrect email or password');
  }
  if (!user.isActive) throw httpError(403, 'This account has been disabled');

  if (user.failedLogins || user.lockUntil) {
    user.failedLogins = 0;
    user.lockUntil = undefined;
    await user.save();
  }
  req.user = user;
  if (user.role !== 'guest') await audit(req, 'login', 'user', user._id);
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', protect, (req, res) => res.json({ user: publicUser(req.user) }));

// POST /api/auth/verify-email  { token }
router.post('/verify-email', validate([body('token').isString().isLength({ min: 20 }).withMessage('Invalid token')]),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ verifyTokenHash: sha(req.body.token), verifyExpires: { $gt: new Date() } })
      .select('+verifyTokenHash +verifyExpires');
    if (!user) throw httpError(400, 'This verification link is invalid or has expired');
    user.emailVerified = true;
    user.verifyTokenHash = undefined;
    user.verifyExpires = undefined;
    await user.save();
    res.json({ message: 'Email verified. You can now book rooms.' });
  }));

router.post('/resend-verification', protect, authLimiter, asyncHandler(async (req, res) => {
  if (req.user.emailVerified) return res.json({ message: 'Your email is already verified' });
  await issueVerification(req.user);
  res.json({ message: emailEnabled() ? 'Verification email sent' : 'Email service is not configured on this server' });
}));

// PUT /api/auth/profile
router.put('/profile', protect, validate([
  body('name').optional().isString().trim().isLength({ min: 2, max: 60 }).withMessage('Name must be 2 to 60 characters'),
  phoneRule,
]), asyncHandler(async (req, res) => {
  if (req.body.name !== undefined) req.user.name = req.body.name;
  if (req.body.phone !== undefined) req.user.phone = req.body.phone;
  await req.user.save();
  res.json({ user: publicUser(req.user) });
}));

// PUT /api/auth/password - also signs the user out everywhere else
router.put('/password', protect, authLimiter, validate([
  body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
  passwordRule('newPassword'),
]), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(req.body.currentPassword))) throw httpError(400, 'Current password is incorrect');
  user.password = req.body.newPassword;
  user.tokenVersion += 1;
  await user.save();
  await audit(req, 'password_changed', 'user', user._id);
  res.json({ token: signToken(user), message: 'Password updated. Other devices were signed out.' });
}));

// POST /api/auth/logout-all - invalidates every token issued so far
router.post('/logout-all', protect, asyncHandler(async (req, res) => {
  req.user.tokenVersion += 1;
  await req.user.save();
  res.json({ message: 'Signed out on all devices' });
}));

module.exports = router;
