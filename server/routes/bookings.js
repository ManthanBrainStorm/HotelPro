const router = require('express').Router();
const { body, query } = require('express-validator');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Review = require('../models/Review');
const CheckLog = require('../models/CheckLog');
const HousekeepingTask = require('../models/HousekeepingTask');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const audit = require('../utils/audit');
const notify = require('../utils/notify');
const paginate = require('../utils/pagination');
const streamInvoice = require('../utils/invoice');
const { sendCancellation } = require('../utils/email');
const { parseDay, todayUTC, nightsBetween, loadRules, quote } = require('../utils/pricing');
const validate = require('../middleware/validate');
const { protect, authorize, requireVerifiedEmail } = require('../middleware/auth');

const HOLD_MINUTES = () => Number(process.env.HOLD_MINUTES) || 15;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isStaff = (u) => ['staff', 'admin'].includes(u.role);

async function ownBooking(req) {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw httpError(404, 'Booking not found');
  if (String(booking.user) !== String(req.user._id) && !isStaff(req.user)) throw httpError(403, 'Not allowed');
  return booking;
}

// POST /api/bookings - reserve a room. The room is held while the guest pays.
router.post('/', protect, requireVerifiedEmail, validate([
  body('roomId').isMongoId().withMessage('Choose a room'),
  body('checkIn').custom((v) => !!parseDay(v)).withMessage('Check-in must be a valid date (YYYY-MM-DD)'),
  body('checkOut').custom((v) => !!parseDay(v)).withMessage('Check-out must be a valid date (YYYY-MM-DD)'),
  body('guests').isInt({ min: 1, max: 20 }).withMessage('Guests must be between 1 and 20').toInt(),
  body('specialRequests').optional().isString().isLength({ max: 500 }).withMessage('Special requests are too long'),
]), asyncHandler(async (req, res) => {
  const { roomId, specialRequests = '', guests } = req.body;
  const checkIn = parseDay(req.body.checkIn);
  const checkOut = parseDay(req.body.checkOut);

  if (checkOut <= checkIn) throw httpError(400, 'Check-out must be after check-in');
  if (checkIn < todayUTC()) throw httpError(400, 'Check-in cannot be in the past');
  if (nightsBetween(checkIn, checkOut) > 30) throw httpError(400, 'Stays are limited to 30 nights');

  const room = await Room.findById(roomId);
  if (!room || !room.isActive) throw httpError(404, 'Room not found');
  if (room.status === 'maintenance') throw httpError(409, 'This room is not available for booking right now');
  if (guests > room.capacity) throw httpError(400, `This room sleeps up to ${room.capacity} guests`);

  const overlap = { room: room._id, ...Booking.overlapping(checkIn, checkOut), $and: [Booking.blocking()] };
  if (await Booking.exists(overlap)) throw httpError(409, 'Room is already booked for those dates');

  const q = quote(room, checkIn, checkOut, await loadRules(checkIn, checkOut));
  const booking = await Booking.create({
    user: req.user._id, room: room._id, checkIn, checkOut, guests, specialRequests,
    nights: q.nights, totalPrice: q.total, status: 'pending', paymentStatus: 'pending',
    holdExpiresAt: new Date(Date.now() + HOLD_MINUTES() * 60 * 1000),
  });

  // Race guard: if two guests passed the check above at the same moment, the booking created
  // first (lower _id) keeps the room and the other is withdrawn.
  const earlier = await Booking.exists({ ...overlap, _id: { $lt: booking._id, $ne: booking._id } });
  if (earlier) {
    await Booking.deleteOne({ _id: booking._id });
    throw httpError(409, 'Room is already booked for those dates');
  }
  res.status(201).json(await booking.populate({ path: 'room', populate: { path: 'category', select: 'name' } }));
}));

// GET /api/bookings/mine?status=&page=&limit=
router.get('/mine', protect, asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req.query, 8, 50);
  const filter = { user: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const [total, bookings] = await Promise.all([
    Booking.countDocuments(filter),
    Booking.find(filter).populate({ path: 'room', populate: { path: 'category', select: 'name' } }).sort('-createdAt').skip(skip).limit(limit).lean(),
  ]);
  const reviewed = new Set((await Review.find({ booking: { $in: bookings.map((b) => b._id) } }).distinct('booking')).map(String));
  bookings.forEach((b) => { b.reviewed = reviewed.has(String(b._id)); });
  res.json({ bookings, ...meta(total) });
}));

// GET /api/bookings - staff/admin list. ?view=arrivals|departures|in-house, ?status=, ?q= guest or room
router.get('/', protect, authorize('staff', 'admin'), validate([
  query('date').optional().custom((v) => !!parseDay(v)).withMessage('Date must be YYYY-MM-DD'),
]), asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req.query, 10, 100);
  const filter = {};
  const today = parseDay(req.query.date) || todayUTC();
  const next = new Date(today.getTime() + 86400000);

  const { view, status, q } = req.query;
  if (view === 'arrivals') Object.assign(filter, { status: 'confirmed', checkIn: { $gte: today, $lt: next } });
  else if (view === 'departures') Object.assign(filter, { status: 'checked-in', checkOut: { $gte: today, $lt: next } });
  else if (view === 'in-house') filter.status = 'checked-in';
  else if (status) filter.status = status;

  if (q) {
    const re = new RegExp(escapeRe(String(q).slice(0, 60)), 'i');
    const [users, rooms] = await Promise.all([
      User.find({ $or: [{ name: re }, { email: re }] }).select('_id'),
      Room.find({ number: re }).select('_id'),
    ]);
    filter.$or = [{ user: { $in: users.map((u) => u._id) } }, { room: { $in: rooms.map((r) => r._id) } }];
  }
  const [total, bookings] = await Promise.all([
    Booking.countDocuments(filter),
    Booking.find(filter).populate({ path: 'room', populate: { path: 'category', select: 'name' } }).populate('user', 'name email phone')
      .sort(view === 'departures' ? 'checkOut' : view === 'arrivals' ? 'checkIn' : '-createdAt').skip(skip).limit(limit),
  ]);
  res.json({ bookings, ...meta(total) });
}));

router.get('/:id', protect, asyncHandler(async (req, res) => {
  const booking = await ownBooking(req);
  await booking.populate([{ path: 'room', populate: { path: 'category', select: 'name' } }, { path: 'user', select: 'name email phone' }]);
  res.json(booking);
}));

// PATCH /api/bookings/:id/cancel - owner or staff/admin. A paid booking creates a refund request.
router.patch('/:id/cancel', protect, asyncHandler(async (req, res) => {
  const booking = await ownBooking(req);
  if (!['pending', 'confirmed'].includes(booking.status)) {
    throw httpError(400, 'Only pending or confirmed bookings can be cancelled');
  }
  const owner = String(booking.user) === String(req.user._id);
  if (owner && booking.status === 'confirmed' && booking.checkIn < todayUTC()) {
    throw httpError(400, 'This stay has already started. Please contact the front desk.');
  }

  const wasPaid = booking.paymentStatus === 'paid';
  booking.status = 'cancelled';
  booking.cancelledAt = new Date();
  booking.cancelledBy = req.user._id;
  booking.holdExpiresAt = undefined;

  const payment = await Payment.findOne({ booking: booking._id }).sort('-createdAt');
  if (wasPaid && payment) {
    booking.paymentStatus = 'refund_requested';
    payment.status = 'refund_requested';
    payment.refundRequestedAt = new Date();
    await payment.save();
  } else if (payment && payment.status === 'pending') {
    payment.status = 'failed';
    await payment.save();
  }
  await booking.save();

  const [room, guest] = await Promise.all([Room.findById(booking.room), User.findById(booking.user)]);
  await notify(booking.user, {
    type: 'booking', title: 'Booking cancelled',
    message: wasPaid ? 'Your refund request has been sent for review.' : `Your booking for room ${room?.number} was cancelled.`,
    link: '/my-bookings',
  });
  if (guest && room) sendCancellation(guest, booking, room, wasPaid);
  if (!owner) await audit(req, 'booking_cancelled', 'booking', booking._id, { by: req.user.email });
  res.json(booking);
}));

// PATCH /api/bookings/:id/status - staff check-in / check-out (enforced state machine)
router.patch('/:id/status', protect, authorize('staff', 'admin'), validate([
  body('status').isIn(['checked-in', 'checked-out']).withMessage('Status must be checked-in or checked-out'),
]), asyncHandler(async (req, res) => {
  const { status } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw httpError(404, 'Booking not found');

  const allowed = { 'checked-in': 'confirmed', 'checked-out': 'checked-in' };
  if (booking.status !== allowed[status]) {
    throw httpError(409, `Cannot move a ${booking.status} booking to ${status}`);
  }
  if (status === 'checked-in') {
    if (booking.paymentStatus !== 'paid') throw httpError(409, 'This booking has not been paid');
    if (booking.checkOut <= todayUTC()) throw httpError(409, 'The scheduled check-out date has already passed');
    const room = await Room.findById(booking.room);
    if (room?.status === 'maintenance') throw httpError(409, 'This room is under maintenance');
    if (room?.status === 'occupied') throw httpError(409, 'The room is still occupied by another guest');
  }

  booking.status = status;
  await booking.save();
  await CheckLog.create({ booking: booking._id, room: booking.room, guest: booking.user, staff: req.user._id, type: status === 'checked-in' ? 'check-in' : 'check-out' });

  const room = await Room.findById(booking.room);
  if (status === 'checked-in') {
    room.status = 'occupied';
    await notify(booking.user, { type: 'stay', title: 'Welcome!', message: `You are checked in to room ${room.number}.`, link: '/my-bookings' });
  } else {
    room.status = 'cleaning';
    await HousekeepingTask.create({ room: room._id, booking: booking._id, type: 'cleaning', createdBy: req.user._id, notes: `Turnover after check-out of booking ${booking._id}` });
    await notify(booking.user, { type: 'stay', title: 'Thanks for staying with us', message: 'How was your stay? Leave a review from My bookings.', link: '/my-bookings' });
  }
  await room.save();
  await audit(req, status === 'checked-in' ? 'check_in' : 'check_out', 'booking', booking._id, { room: room.number });
  res.json(booking);
}));

// GET /api/bookings/:id/invoice - PDF
router.get('/:id/invoice', protect, asyncHandler(async (req, res) => {
  const booking = await ownBooking(req);
  const payment = await Payment.findOne({ booking: booking._id, paidAt: { $exists: true } }).sort('-paidAt');
  if (!booking.invoiceNumber || !payment) throw httpError(404, 'No invoice yet. It is created once the booking is paid.');
  const [room, guest] = await Promise.all([
    Room.findById(booking.room).populate('category', 'name').populate('hotel'),
    User.findById(booking.user),
  ]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${booking.invoiceNumber}.pdf"`);
  streamInvoice(res, { booking, room, guest, hotel: room.hotel, payment });
}));

module.exports = router;
