// Seasonal pricing rules (admin). Read access for staff so they can see why a rate differs.
const router = require('express').Router();
const { body } = require('express-validator');
const SeasonalPrice = require('../models/SeasonalPrice');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const audit = require('../utils/audit');
const { parseDay } = require('../utils/pricing');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

const rules = (required) => [
  body('name').if(() => required).isString().trim().notEmpty().withMessage('Name is required'),
  body('startDate').if(() => required).custom((v) => !!parseDay(String(v).slice(0, 10))).withMessage('Start date must be YYYY-MM-DD'),
  body('endDate').if(() => required).custom((v) => !!parseDay(String(v).slice(0, 10))).withMessage('End date must be YYYY-MM-DD'),
  body('multiplier').if(() => required).isFloat({ min: 0.1, max: 5 }).withMessage('Multiplier must be between 0.1 and 5'),
];

const pick = (b) => {
  const out = {};
  if (b.name !== undefined) out.name = b.name;
  if (b.startDate) out.startDate = parseDay(String(b.startDate).slice(0, 10));
  if (b.endDate) out.endDate = parseDay(String(b.endDate).slice(0, 10));
  if (b.multiplier !== undefined) out.multiplier = Number(b.multiplier);
  if (b.category !== undefined) out.category = b.category || null;
  if (b.isActive !== undefined) out.isActive = b.isActive;
  return out;
};

router.get('/', protect, authorize('staff', 'admin'), asyncHandler(async (req, res) => {
  res.json(await SeasonalPrice.find().populate('category', 'name').sort('-startDate').lean());
}));

router.post('/', protect, authorize('admin'), validate(rules(true)), asyncHandler(async (req, res) => {
  const rule = await SeasonalPrice.create(pick(req.body));
  await audit(req, 'seasonal_price_created', 'pricing', rule._id, { name: rule.name, multiplier: rule.multiplier });
  res.status(201).json(rule);
}));

router.put('/:id', protect, authorize('admin'), validate(rules(false)), asyncHandler(async (req, res) => {
  const rule = await SeasonalPrice.findById(req.params.id);
  if (!rule) throw httpError(404, 'Pricing rule not found');
  rule.set(pick(req.body));
  await rule.save();
  await audit(req, 'seasonal_price_updated', 'pricing', rule._id, pick(req.body));
  res.json(rule);
}));

router.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const rule = await SeasonalPrice.findByIdAndDelete(req.params.id);
  if (!rule) throw httpError(404, 'Pricing rule not found');
  await audit(req, 'seasonal_price_deleted', 'pricing', rule._id, { name: rule.name });
  res.json({ message: 'Pricing rule deleted' });
}));

module.exports = router;
