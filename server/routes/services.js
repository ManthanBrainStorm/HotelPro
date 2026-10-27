// Catalogue of extra services (admin managed, visible to logged-in users)
const router = require('express').Router();
const { body } = require('express-validator');
const Service = require('../models/Service');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const audit = require('../utils/audit');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

const pick = (b) => Object.fromEntries(['name', 'description', 'price', 'isActive'].filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));
const rules = (required) => [
  body('name').if(() => required).isString().trim().notEmpty().withMessage('Service name is required'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be 0 or more'),
];

router.get('/', protect, asyncHandler(async (req, res) => {
  res.json(await Service.find({ isActive: true }).sort('name').lean());
}));

router.post('/', protect, authorize('admin'), validate(rules(true)), asyncHandler(async (req, res) => {
  const svc = await Service.create(pick(req.body));
  await audit(req, 'service_created', 'service', svc._id, { name: svc.name });
  res.status(201).json(svc);
}));

router.put('/:id', protect, authorize('admin'), validate(rules(false)), asyncHandler(async (req, res) => {
  const svc = await Service.findByIdAndUpdate(req.params.id, pick(req.body), { new: true, runValidators: true });
  if (!svc) throw httpError(404, 'Service not found');
  await audit(req, 'service_updated', 'service', svc._id, pick(req.body));
  res.json(svc);
}));

router.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const svc = await Service.findByIdAndUpdate(req.params.id, { isActive: false });
  if (!svc) throw httpError(404, 'Service not found');
  await audit(req, 'service_removed', 'service', svc._id, { name: svc.name });
  res.json({ message: 'Service removed' });
}));

module.exports = router;
