const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { body, query } = require('express-validator');
const Room = require('../models/Room');
const Hotel = require('../models/Hotel');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const HousekeepingTask = require('../models/HousekeepingTask');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const audit = require('../utils/audit');
const paginate = require('../utils/pagination');
const { parseDay, todayUTC, loadRules, quote } = require('../utils/pricing');
const upload = require('../middleware/upload');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

const populateRoom = [{ path: 'category', select: 'name description' }, { path: 'hotel', select: 'name city checkInTime checkOutTime' }];
const FIELDS = ['hotel', 'category', 'number', 'pricePerNight', 'capacity', 'description', 'amenities', 'isActive'];
const pick = (b) => Object.fromEntries(FIELDS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));
const rel = (url) => path.join(upload.uploadDir, path.basename(url));

// Rooms that have a blocking booking overlapping the given stay.
const busyRoomIds = (checkIn, checkOut) =>
  Booking.find({ ...Booking.overlapping(checkIn, checkOut), $and: [Booking.blocking()] }).distinct('room');

function readStay(req) {
  const checkIn = parseDay(req.query.checkIn);
  const checkOut = parseDay(req.query.checkOut);
  if (!checkIn || !checkOut) return null;
  if (checkOut <= checkIn) throw httpError(400, 'Check-out must be after check-in');
  return { checkIn, checkOut };
}

const roomRules = (required) => [
  body('number').if(() => required).isString().trim().notEmpty().withMessage('Room number is required'),
  body('category').if(() => required).isMongoId().withMessage('Choose a room category'),
  body('hotel').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid hotel'),
  body('pricePerNight').if(() => required).isFloat({ min: 0 }).withMessage('Price must be 0 or more'),
  body('capacity').if(() => required).isInt({ min: 1, max: 20 }).withMessage('Capacity must be between 1 and 20'),
  body('description').optional().isString().isLength({ max: 1000 }).withMessage('Description is too long'),
  body('amenities').optional().isArray({ max: 20 }).withMessage('Amenities must be a list'),
];

// GET /api/rooms?checkIn&checkOut&guests&category&hotel&minPrice&maxPrice&sort&page&limit
// With dates, only rooms free for the whole stay are returned, each with a priced quote.
router.get('/', validate([
  query('guests').optional().isInt({ min: 1, max: 20 }).withMessage('Guests must be between 1 and 20'),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('Invalid minimum price'),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Invalid maximum price'),
]), asyncHandler(async (req, res) => {
  const { guests, category, hotel, minPrice, maxPrice, sort } = req.query;
  const stay = readStay(req);
  const { page, limit, skip, meta } = paginate(req.query, 8, 50);

  const filter = { isActive: true, status: { $ne: 'maintenance' } };
  if (category) filter.category = category;
  if (hotel) filter.hotel = hotel;
  if (guests) filter.capacity = { $gte: Number(guests) };
  if (minPrice || maxPrice) {
    filter.pricePerNight = {};
    if (minPrice) filter.pricePerNight.$gte = Number(minPrice);
    if (maxPrice) filter.pricePerNight.$lte = Number(maxPrice);
  }
  if (stay) filter._id = { $nin: await busyRoomIds(stay.checkIn, stay.checkOut) };

  const sortBy = { price_asc: 'pricePerNight', price_desc: '-pricePerNight', rating: '-ratingAvg' }[sort] || 'pricePerNight';
  const [total, rooms, rules] = await Promise.all([
    Room.countDocuments(filter),
    Room.find(filter).populate(populateRoom).sort(sortBy).skip(skip).limit(limit).lean(),
    stay ? loadRules(stay.checkIn, stay.checkOut) : [],
  ]);
  if (stay) rooms.forEach((r) => { r.quote = quote(r, stay.checkIn, stay.checkOut, rules); });
  res.json({ rooms, ...meta(total) });
}));

// GET /api/rooms/manage/list - every active room incl. maintenance (staff dashboard)
router.get('/manage/list', protect, authorize('staff', 'admin'), asyncHandler(async (req, res) => {
  res.json(await Room.find({ isActive: true }).populate(populateRoom).sort('number').lean());
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const room = await Room.findById(req.params.id).populate(populateRoom).lean();
  if (!room || !room.isActive) throw httpError(404, 'Room not found');
  res.json(room);
}));

// GET /api/rooms/:id/quote?checkIn&checkOut&guests - live availability + price for one room
router.get('/:id/quote', asyncHandler(async (req, res) => {
  const room = await Room.findById(req.params.id).lean();
  if (!room || !room.isActive) throw httpError(404, 'Room not found');
  const stay = readStay(req);
  if (!stay) throw httpError(400, 'Choose valid check-in and check-out dates');

  let reason = null;
  if (stay.checkIn < todayUTC()) reason = 'Check-in cannot be in the past';
  else if (room.status === 'maintenance') reason = 'This room is under maintenance';
  else if (req.query.guests && Number(req.query.guests) > room.capacity) reason = `This room sleeps up to ${room.capacity} guests`;
  else if (await Booking.exists({ room: room._id, ...Booking.overlapping(stay.checkIn, stay.checkOut), $and: [Booking.blocking()] })) {
    reason = 'Room is already booked for those dates';
  }
  const q = quote(room, stay.checkIn, stay.checkOut, await loadRules(stay.checkIn, stay.checkOut));
  res.json({ available: !reason, reason, ...q });
}));

// GET /api/rooms/:id/availability - upcoming blocked date ranges (no personal data)
router.get('/:id/availability', asyncHandler(async (req, res) => {
  const from = todayUTC();
  const to = new Date(from.getTime() + 180 * 86400000);
  const booked = await Booking.find({
    room: req.params.id, ...Booking.overlapping(from, to), $and: [Booking.blocking()],
  }).select('checkIn checkOut').sort('checkIn').lean();
  res.json(booked);
}));

router.get('/:id/reviews', asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req.query, 5, 20);
  const filter = { room: req.params.id, isVisible: true };
  const [total, items] = await Promise.all([
    Review.countDocuments(filter),
    Review.find(filter).populate('user', 'name').sort('-createdAt').skip(skip).limit(limit),
  ]);
  const reviews = items.map((r) => {
    const [first, ...rest] = (r.user?.name || 'Guest').split(' ');
    return { _id: r._id, rating: r.rating, comment: r.comment, createdAt: r.createdAt, guest: rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first };
  });
  res.json({ reviews, ...meta(total) });
}));

// ---- Staff: operational status ----
router.patch('/:id/status', protect, authorize('staff', 'admin'),
  validate([body('status').isIn(['available', 'occupied', 'cleaning', 'maintenance']).withMessage('Invalid status')]),
  asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id);
    if (!room || !room.isActive) throw httpError(404, 'Room not found');
    const { status } = req.body;
    if (status === 'maintenance') {
      const inHouse = await Booking.exists({ room: room._id, status: 'checked-in' });
      if (inHouse) throw httpError(409, 'A guest is currently checked in to this room');
    }
    room.status = status;
    await room.save();
    if (['cleaning', 'maintenance'].includes(status)) {
      const open = await HousekeepingTask.exists({ room: room._id, type: status === 'cleaning' ? 'cleaning' : 'maintenance', status: { $ne: 'done' } });
      if (!open) {
        await HousekeepingTask.create({ room: room._id, type: status === 'cleaning' ? 'cleaning' : 'maintenance', createdBy: req.user._id, notes: 'Created from room status change' });
      }
    }
    await audit(req, 'room_status_changed', 'room', room._id, { number: room.number, status });
    res.json(room);
  }));

// ---- Admin: inventory management ----
router.post('/', protect, authorize('admin'), validate(roomRules(true)), asyncHandler(async (req, res) => {
  const data = pick(req.body);
  if (!data.hotel) {
    const first = await Hotel.findOne({ isActive: true }).sort('createdAt');
    if (!first) throw httpError(400, 'Create a hotel first');
    data.hotel = first._id;
  }
  const room = await Room.create(data);
  await audit(req, 'room_created', 'room', room._id, { number: room.number });
  res.status(201).json(room);
}));

router.put('/:id', protect, authorize('admin'), validate(roomRules(false)), asyncHandler(async (req, res) => {
  const room = await Room.findByIdAndUpdate(req.params.id, pick(req.body), { new: true, runValidators: true });
  if (!room) throw httpError(404, 'Room not found');
  await audit(req, 'room_updated', 'room', room._id, pick(req.body));
  res.json(room);
}));

router.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const upcoming = await Booking.exists({ room: req.params.id, status: { $in: ['confirmed', 'checked-in'] }, checkOut: { $gt: new Date() } });
  if (upcoming) throw httpError(409, 'This room has upcoming or in-house bookings. Cancel or complete them first.');
  const room = await Room.findByIdAndUpdate(req.params.id, { isActive: false });
  if (!room) throw httpError(404, 'Room not found');
  await audit(req, 'room_removed', 'room', room._id, { number: room.number });
  res.json({ message: 'Room removed from listings' });
}));

// POST /api/rooms/:id/images  (multipart, field "images", up to 5 files, 2 MB each)
router.post('/:id/images', protect, authorize('admin'), upload.array('images', 5), asyncHandler(async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!room) {
    (req.files || []).forEach((f) => fs.unlink(f.path, () => {}));
    throw httpError(404, 'Room not found');
  }
  if (!req.files?.length) throw httpError(400, 'Choose at least one image');
  if (room.images.length + req.files.length > 8) {
    req.files.forEach((f) => fs.unlink(f.path, () => {}));
    throw httpError(400, 'A room can have at most 8 images');
  }
  room.images.push(...req.files.map((f) => `/uploads/${f.filename}`));
  await room.save();
  await audit(req, 'room_images_added', 'room', room._id, { count: req.files.length });
  res.json(room);
}));

router.delete('/:id/images', protect, authorize('admin'), validate([body('url').isString().notEmpty().withMessage('Image url is required')]),
  asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id);
    if (!room) throw httpError(404, 'Room not found');
    if (!room.images.includes(req.body.url)) throw httpError(404, 'Image not found on this room');
    room.images = room.images.filter((u) => u !== req.body.url);
    await room.save();
    fs.unlink(rel(req.body.url), () => {});
    res.json(room);
  }));

module.exports = router;
