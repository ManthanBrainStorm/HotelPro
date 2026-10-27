const router = require('express').Router();
const { body } = require('express-validator');
const RoomCategory = require('../models/RoomCategory');
const Room = require('../models/Room');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const audit = require('../utils/audit');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

const pick = (b) => Object.fromEntries(['name', 'description', 'isActive'].filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));

router.get('/', asyncHandler(async (req, res) => {
  res.json(await RoomCategory.find({ isActive: true }).sort('name').lean());
}));

router.post('/', protect, authorize('admin'), validate([body('name').isString().trim().notEmpty().withMessage('Category name is required')]),
  asyncHandler(async (req, res) => {
    const cat = await RoomCategory.create(pick(req.body));
    await audit(req, 'category_created', 'category', cat._id, { name: cat.name });
    res.status(201).json(cat);
  }));

router.put('/:id', protect, authorize('admin'), validate([body('name').optional().isString().trim().notEmpty().withMessage('Category name is required')]),
  asyncHandler(async (req, res) => {
    const cat = await RoomCategory.findByIdAndUpdate(req.params.id, pick(req.body), { new: true, runValidators: true });
    if (!cat) throw httpError(404, 'Category not found');
    await audit(req, 'category_updated', 'category', cat._id, pick(req.body));
    res.json(cat);
  }));

router.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  if (await Room.exists({ category: req.params.id, isActive: true })) throw httpError(409, 'Some rooms still use this category');
  const cat = await RoomCategory.findByIdAndUpdate(req.params.id, { isActive: false });
  if (!cat) throw httpError(404, 'Category not found');
  await audit(req, 'category_removed', 'category', cat._id, { name: cat.name });
  res.json({ message: 'Category removed' });
}));

module.exports = router;
