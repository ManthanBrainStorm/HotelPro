const router = require('express').Router();
const { body } = require('express-validator');
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const audit = require('../utils/audit');
const paginate = require('../utils/pagination');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

async function refreshRating(roomId) {
  const [agg, count] = await Promise.all([
    Review.aggregate([{ $match: { room: roomId, isVisible: true } }, { $group: { _id: '$room', total: { $sum: '$rating' } } }]),
    Review.countDocuments({ room: roomId, isVisible: true }),
  ]);
  await Room.findByIdAndUpdate(roomId, { ratingAvg: count && agg[0] ? Math.round((agg[0].total / count) * 10) / 10 : 0, ratingCount: count });
}

// POST /api/reviews - only the guest, only after check-out, once per booking
router.post('/', protect, validate([
  body('bookingId').isMongoId().withMessage('Invalid booking'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1 to 5').toInt(),
  body('comment').optional().isString().isLength({ max: 1000 }).withMessage('Comment is too long'),
]), asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.body.bookingId);
  if (!booking || String(booking.user) !== String(req.user._id)) throw httpError(404, 'Booking not found');
  if (booking.status !== 'checked-out') throw httpError(409, 'You can review a room after your stay is completed');
  if (await Review.exists({ booking: booking._id })) throw httpError(409, 'You already reviewed this stay');

  const review = await Review.create({ booking: booking._id, user: req.user._id, room: booking.room, rating: req.body.rating, comment: req.body.comment || '' });
  await refreshRating(booking.room);
  res.status(201).json(review);
}));

// ---- Admin moderation ----
router.get('/', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req.query, 10, 50);
  const [total, reviews] = await Promise.all([
    Review.countDocuments(),
    Review.find().populate('user', 'name email').populate('room', 'number').sort('-createdAt').skip(skip).limit(limit),
  ]);
  res.json({ reviews, ...meta(total) });
}));

router.patch('/:id/visibility', protect, authorize('admin'), validate([body('isVisible').isBoolean().withMessage('isVisible must be true or false').toBoolean()]),
  asyncHandler(async (req, res) => {
    const review = await Review.findByIdAndUpdate(req.params.id, { isVisible: req.body.isVisible }, { new: true });
    if (!review) throw httpError(404, 'Review not found');
    await refreshRating(review.room);
    await audit(req, review.isVisible ? 'review_shown' : 'review_hidden', 'review', review._id);
    res.json(review);
  }));

module.exports = router;
