// Dashboard numbers (staff + admin) and analytics (admin).
const router = require('express').Router();
const { query } = require('express-validator');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const ServiceRequest = require('../models/ServiceRequest');
const HousekeepingTask = require('../models/HousekeepingTask');
const Review = require('../models/Review');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const { parseDay, todayUTC, DAY } = require('../utils/pricing');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('staff', 'admin'));

const REVENUE_STATES = ['paid', 'refund_requested', 'refund_rejected', 'refunded'];
const sum = (arr) => (arr[0] ? arr[0].total : 0);

// GET /api/reports/summary - headline numbers for the dashboard
router.get('/summary', asyncHandler(async (req, res) => {
  const today = todayUTC();
  const tomorrow = new Date(today.getTime() + DAY);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  const [rooms, occupied, active, arrivals, departures, grossAll, refundedAll, grossMonth, pendingRefunds, openRequests, openTasks, ratingTotal, ratingCount] = await Promise.all([
    Room.countDocuments({ isActive: true }),
    Booking.countDocuments({ status: 'checked-in' }),
    Booking.countDocuments({ status: { $in: ['confirmed', 'checked-in'] } }),
    Booking.countDocuments({ status: 'confirmed', checkIn: { $gte: today, $lt: tomorrow } }),
    Booking.countDocuments({ status: 'checked-in', checkOut: { $gte: today, $lt: tomorrow } }),
    Payment.aggregate([{ $match: { status: { $in: REVENUE_STATES } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payment.aggregate([{ $match: { status: 'refunded' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payment.aggregate([{ $match: { status: { $in: REVENUE_STATES }, paidAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payment.countDocuments({ status: 'refund_requested' }),
    ServiceRequest.countDocuments({ status: { $ne: 'resolved' } }),
    HousekeepingTask.countDocuments({ status: { $ne: 'done' } }),
    Review.aggregate([{ $match: { isVisible: true } }, { $group: { _id: null, total: { $sum: '$rating' } } }]),
    Review.countDocuments({ isVisible: true }),
  ]);

  const roomStatus = await Room.aggregate([{ $match: { isActive: true } }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
  res.json({
    rooms,
    occupiedRooms: occupied,
    occupancy: rooms ? Math.round((occupied / rooms) * 100) : 0,
    activeBookings: active,
    arrivalsToday: arrivals,
    departuresToday: departures,
    revenue: sum(grossAll) - sum(refundedAll),
    revenueThisMonth: sum(grossMonth),
    pendingRefunds,
    openRequests,
    openTasks,
    avgRating: ratingCount && ratingTotal[0] ? Math.round((ratingTotal[0].total / ratingCount) * 10) / 10 : 0,
    roomStatus: Object.fromEntries(roomStatus.map((r) => [r._id, r.count])),
  });
}));

// GET /api/reports/overview?from=YYYY-MM-DD&to=YYYY-MM-DD (admin) - analytics for charts
router.get('/overview', authorize('admin'), validate([
  query('from').optional().custom((v) => !!parseDay(v)).withMessage('from must be YYYY-MM-DD'),
  query('to').optional().custom((v) => !!parseDay(v)).withMessage('to must be YYYY-MM-DD'),
]), asyncHandler(async (req, res) => {
  const to = parseDay(req.query.to) || todayUTC();
  const from = parseDay(req.query.from) || new Date(to.getTime() - 29 * DAY);
  if (to < from) throw httpError(400, '"to" must not be before "from"');
  const days = Math.round((to - from) / DAY) + 1;
  if (days > 120) throw httpError(400, 'Choose a range of 120 days or less');
  const end = new Date(to.getTime() + DAY); // exclusive upper bound

  const [payments, bookingsInRange, statusCounts, roomCount] = await Promise.all([
    Payment.find({ status: { $in: REVENUE_STATES }, paidAt: { $gte: from, $lt: end } }).select('amount status paidAt').lean(),
    Booking.find({ status: { $in: ['confirmed', 'checked-in', 'checked-out'] }, checkIn: { $lt: end }, checkOut: { $gt: from } })
      .populate({ path: 'room', select: 'category', populate: { path: 'category', select: 'name' } }).select('room checkIn checkOut totalPrice nights').lean(),
    Booking.aggregate([{ $match: { createdAt: { $gte: from, $lt: end } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Room.countDocuments({ isActive: true }),
  ]);

  // Daily revenue + occupancy series
  const series = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(from.getTime() + i * DAY);
    const next = new Date(day.getTime() + DAY);
    const revenue = payments.filter((p) => p.paidAt >= day && p.paidAt < next).reduce((s, p) => s + p.amount, 0);
    const occupiedRooms = bookingsInRange.filter((b) => b.checkIn < next && b.checkOut > day).length;
    series.push({ date: day.toISOString().slice(0, 10), revenue, occupancy: roomCount ? Math.min(100, Math.round((occupiedRooms / roomCount) * 100)) : 0 });
  }

  // Revenue by room category (from the booking value of stays in range)
  const byCat = {};
  bookingsInRange.forEach((b) => {
    const name = b.room?.category?.name || 'Other';
    byCat[name] = (byCat[name] || 0) + b.totalPrice;
  });

  const refunded = payments.filter((p) => p.status === 'refunded').reduce((s, p) => s + p.amount, 0);
  const gross = payments.reduce((s, p) => s + p.amount, 0);
  const statusMap = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
  const totalCreated = Object.values(statusMap).reduce((a, b) => a + b, 0);

  res.json({
    range: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), days },
    totals: {
      grossRevenue: gross,
      refunds: refunded,
      netRevenue: gross - refunded,
      bookings: totalCreated,
      cancellationRate: totalCreated ? Math.round(((statusMap.cancelled || 0) / totalCreated) * 100) : 0,
      avgOccupancy: series.length ? Math.round(series.reduce((s, d) => s + d.occupancy, 0) / series.length) : 0,
    },
    series,
    byCategory: Object.entries(byCat).map(([name, revenue]) => ({ name, revenue })),
    byStatus: Object.entries(statusMap).map(([name, count]) => ({ name, count })),
  });
}));

module.exports = router;
