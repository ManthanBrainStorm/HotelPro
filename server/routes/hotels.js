const router = require('express').Router();
const { body } = require('express-validator');
const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const audit = require('../utils/audit');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

const FIELDS = ['name', 'address', 'city', 'phone', 'email', 'description', 'checkInTime', 'checkOutTime', 'isActive'];
const pick = (src) => Object.fromEntries(FIELDS.filter((k) => src[k] !== undefined).map((k) => [k, src[k]]));
const rules = [body('name').optional().isString().trim().notEmpty().withMessage('Hotel name is required')];

router.get('/', asyncHandler(async (req, res) => {
  res.json(await Hotel.find({ isActive: true }).sort('name').lean());
}));

router.post('/', protect, authorize('admin'), validate([body('name').isString().trim().notEmpty().withMessage('Hotel name is required')]),
  asyncHandler(async (req, res) => {
    const hotel = await Hotel.create(pick(req.body));
    await audit(req, 'hotel_created', 'hotel', hotel._id, { name: hotel.name });
    res.status(201).json(hotel);
  }));

router.put('/:id', protect, authorize('admin'), validate(rules), asyncHandler(async (req, res) => {
  const hotel = await Hotel.findByIdAndUpdate(req.params.id, pick(req.body), { new: true, runValidators: true });
  if (!hotel) throw httpError(404, 'Hotel not found');
  await audit(req, 'hotel_updated', 'hotel', hotel._id, pick(req.body));
  res.json(hotel);
}));

router.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  if (await Room.exists({ hotel: req.params.id, isActive: true })) {
    throw httpError(409, 'Remove or move this hotel\'s rooms first');
  }
  const hotel = await Hotel.findByIdAndUpdate(req.params.id, { isActive: false });
  if (!hotel) throw httpError(404, 'Hotel not found');
  await audit(req, 'hotel_removed', 'hotel', hotel._id, { name: hotel.name });
  res.json({ message: 'Hotel removed' });
}));

module.exports = router;
