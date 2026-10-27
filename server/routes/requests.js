// Guest service requests and customer-support tickets, handled by staff.
const router = require('express').Router();
const { body } = require('express-validator');
const ServiceRequest = require('../models/ServiceRequest');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const audit = require('../utils/audit');
const notify = require('../utils/notify');
const paginate = require('../utils/pagination');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

const populate = [
  { path: 'user', select: 'name email' }, { path: 'room', select: 'number' },
  { path: 'service', select: 'name price' }, { path: 'assignedTo', select: 'name department' },
];

// POST /api/requests - guest raises a request for a booking they hold
router.post('/', protect, validate([
  body('bookingId').isMongoId().withMessage('Choose a booking'),
  body('type').isIn(['service', 'support']).withMessage('Type must be service or support'),
  body('serviceId').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid service'),
  body('subject').optional().isString().trim().isLength({ max: 120 }).withMessage('Subject is too long'),
  body('message').optional().isString().isLength({ max: 1000 }).withMessage('Message is too long'),
]), asyncHandler(async (req, res) => {
  const { bookingId, type, serviceId, message = '' } = req.body;
  const booking = await Booking.findById(bookingId);
  if (!booking || String(booking.user) !== String(req.user._id)) throw httpError(404, 'Booking not found');
  if (!['confirmed', 'checked-in'].includes(booking.status)) throw httpError(409, 'Requests can be made for confirmed or in-house bookings');

  let subject = req.body.subject;
  if (type === 'service') {
    const svc = serviceId && await Service.findOne({ _id: serviceId, isActive: true });
    if (!svc) throw httpError(400, 'Choose a service');
    subject = svc.name;
  } else if (!subject) throw httpError(400, 'Please add a subject');

  const reqDoc = await ServiceRequest.create({ booking: booking._id, user: req.user._id, room: booking.room, type, service: type === 'service' ? serviceId : undefined, subject, message });

  const staff = await User.find({ role: { $in: ['staff', 'admin'] }, isActive: true }).select('_id');
  await Promise.all(staff.map((s) => notify(s._id, { type: 'request', title: type === 'support' ? 'New support ticket' : 'New service request', message: subject, link: '/admin' })));
  res.status(201).json(await reqDoc.populate(populate));
}));

router.get('/mine', protect, asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req.query, 10, 50);
  const filter = { user: req.user._id };
  const [total, items] = await Promise.all([
    ServiceRequest.countDocuments(filter),
    ServiceRequest.find(filter).populate(populate).sort('-createdAt').skip(skip).limit(limit),
  ]);
  res.json({ requests: items, ...meta(total) });
}));

// GET /api/requests - staff queue
router.get('/', protect, authorize('staff', 'admin'), asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req.query, 10, 100);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  const [total, items] = await Promise.all([
    ServiceRequest.countDocuments(filter),
    ServiceRequest.find(filter).populate(populate).sort('-createdAt').skip(skip).limit(limit),
  ]);
  res.json({ requests: items, ...meta(total) });
}));

// PATCH /api/requests/:id - update status, reply to the guest, assign staff
router.patch('/:id', protect, authorize('staff', 'admin'), validate([
  body('status').optional().isIn(['open', 'in-progress', 'resolved']).withMessage('Invalid status'),
  body('response').optional().isString().isLength({ max: 1000 }).withMessage('Response is too long'),
  body('assignedTo').optional({ values: 'null' }).isMongoId().withMessage('Invalid staff member'),
]), asyncHandler(async (req, res) => {
  const doc = await ServiceRequest.findById(req.params.id);
  if (!doc) throw httpError(404, 'Request not found');
  const { status, response, assignedTo } = req.body;

  if (assignedTo !== undefined) {
    // Staff may only assign to themselves; admins may assign anyone.
    if (req.user.role !== 'admin' && assignedTo && String(assignedTo) !== String(req.user._id)) throw httpError(403, 'Only admins can assign requests to other staff');
    if (assignedTo && !(await User.exists({ _id: assignedTo, role: { $in: ['staff', 'admin'] }, isActive: true }))) throw httpError(400, 'Invalid staff member');
    doc.assignedTo = assignedTo || undefined;
    if (assignedTo && String(assignedTo) !== String(req.user._id)) {
      await notify(assignedTo, { type: 'request', title: 'Request assigned to you', message: doc.subject, link: '/admin' });
      await audit(req, 'request_assigned', 'request', doc._id, { assignedTo });
    }
  }
  if (response !== undefined) doc.response = response;
  if (status) {
    doc.status = status;
    doc.resolvedAt = status === 'resolved' ? new Date() : undefined;
  }
  await doc.save();

  if (status || response) {
    await notify(doc.user, {
      type: 'request', title: `Your ${doc.type === 'support' ? 'support ticket' : 'request'} is ${doc.status}`,
      message: response || doc.subject, link: '/my-bookings',
    });
  }
  res.json(await doc.populate(populate));
}));

module.exports = router;
