// Admin-only: user & staff management, activity log, security monitoring, system health.
const router = require('express').Router();
const mongoose = require('mongoose');
const os = require('os');
const { body } = require('express-validator');
const User = require('../models/User');
const AdminLog = require('../models/AdminLog');
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const Payment = require('../models/Payment');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const audit = require('../utils/audit');
const paginate = require('../utils/pagination');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DEPARTMENTS = ['', 'front-desk', 'housekeeping', 'support', 'management'];

// GET /api/admin/staff - active staff, used by assignment dropdowns (staff + admin may read)
router.get('/staff', protect, authorize('staff', 'admin'), asyncHandler(async (req, res) => {
  const staff = await User.find({ role: { $in: ['staff', 'admin'] }, isActive: true }).select('name role department').sort('name');
  res.json(staff);
}));

router.use(protect, authorize('admin'));

router.get('/users', asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req.query, 10, 100);
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.q) {
    const re = new RegExp(escapeRe(String(req.query.q).slice(0, 60)), 'i');
    filter.$or = [{ name: re }, { email: re }];
  }
  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort('-createdAt').skip(skip).limit(limit),
  ]);
  res.json({ users, ...meta(total) });
}));

// POST /api/admin/users - create a staff or admin account
router.post('/users', validate([
  body('name').isString().trim().isLength({ min: 2, max: 60 }).withMessage('Name must be 2 to 60 characters'),
  body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail({ gmail_remove_dots: false }),
  body('password').isString().isLength({ min: 8, max: 72 }).withMessage('Password must be 8 to 72 characters')
    .matches(/[A-Za-z]/).withMessage('Password must contain a letter').matches(/\d/).withMessage('Password must contain a number'),
  body('role').isIn(['guest', 'staff', 'admin']).withMessage('Invalid role'),
  body('department').optional().isIn(DEPARTMENTS).withMessage('Invalid department'),
]), asyncHandler(async (req, res) => {
  const { name, email, password, role, department = '', phone } = req.body;
  if (await User.findOne({ email })) throw httpError(409, 'An account with this email already exists');
  const user = await User.create({ name, email, password, role, department, phone, emailVerified: true });
  await audit(req, 'user_created', 'user', user._id, { email, role });
  res.status(201).json(user);
}));

// PATCH /api/admin/users/:id - change role/department, enable or disable an account
router.patch('/users/:id', validate([
  body('role').optional().isIn(['guest', 'staff', 'admin']).withMessage('Invalid role'),
  body('department').optional().isIn(DEPARTMENTS).withMessage('Invalid department'),
  body('isActive').optional().isBoolean().withMessage('isActive must be true or false').toBoolean(),
  body('name').optional().isString().trim().isLength({ min: 2, max: 60 }).withMessage('Name must be 2 to 60 characters'),
]), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw httpError(404, 'User not found');
  const self = String(user._id) === String(req.user._id);
  if (self && (req.body.isActive === false || (req.body.role && req.body.role !== 'admin'))) {
    throw httpError(400, 'You cannot disable or demote your own account');
  }
  const security = req.body.isActive === false || (req.body.role && req.body.role !== user.role);
  ['name', 'role', 'department', 'isActive'].forEach((k) => { if (req.body[k] !== undefined) user[k] = req.body[k]; });
  if (security) user.tokenVersion += 1; // forces re-login with the new permissions
  await user.save();
  await audit(req, 'user_updated', 'user', user._id, { email: user.email, changes: req.body });
  res.json(user);
}));

router.get('/logs', asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req.query, 15, 100);
  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  const [total, logs] = await Promise.all([
    AdminLog.countDocuments(filter),
    AdminLog.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(),
  ]);
  res.json({ logs, ...meta(total) });
}));

// GET /api/admin/security - failed logins, locked accounts, recent privileged activity
router.get('/security', asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [failed24h, lockedAccounts, disabledAccounts, recentFailures, adminLogins] = await Promise.all([
    AdminLog.countDocuments({ action: 'login_failed', createdAt: { $gte: since } }),
    User.countDocuments({ lockUntil: { $gt: new Date() } }),
    User.countDocuments({ isActive: false }),
    AdminLog.find({ action: 'login_failed' }).sort('-createdAt').limit(8).lean(),
    AdminLog.find({ action: 'login' }).sort('-createdAt').limit(8).lean(),
  ]);
  res.json({ failed24h, lockedAccounts, disabledAccounts, recentFailures, adminLogins });
}));

// GET /api/admin/health - system health snapshot
router.get('/health', asyncHandler(async (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const started = Date.now();
  let dbPingMs = null;
  try { await mongoose.connection.db.admin().ping(); dbPingMs = Date.now() - started; } catch { /* reported below */ }
  const mem = process.memoryUsage();
  const [users, rooms, bookings, payments] = await Promise.all([
    User.countDocuments(), Room.countDocuments({ isActive: true }), Booking.countDocuments(), Payment.countDocuments(),
  ]);
  res.json({
    status: dbPingMs === null ? 'degraded' : 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
    database: { state: states[mongoose.connection.readyState], pingMs: dbPingMs },
    memory: { rssMB: Math.round(mem.rss / 1048576), heapUsedMB: Math.round(mem.heapUsed / 1048576) },
    loadAvg: os.loadavg().map((n) => Math.round(n * 100) / 100),
    counts: { users, rooms, bookings, payments },
  });
}));

module.exports = router;
