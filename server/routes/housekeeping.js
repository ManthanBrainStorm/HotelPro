const router = require('express').Router();
const { body } = require('express-validator');
const HousekeepingTask = require('../models/HousekeepingTask');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const audit = require('../utils/audit');
const notify = require('../utils/notify');
const paginate = require('../utils/pagination');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('staff', 'admin'));
const populate = [{ path: 'room', select: 'number status' }, { path: 'assignedTo', select: 'name department' }];

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req.query, 10, 100);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.mine === '1') filter.assignedTo = req.user._id;
  const [total, tasks] = await Promise.all([
    HousekeepingTask.countDocuments(filter),
    HousekeepingTask.find(filter).populate(populate).sort('status -createdAt').skip(skip).limit(limit),
  ]);
  res.json({ tasks, ...meta(total) });
}));

router.post('/', validate([
  body('room').isMongoId().withMessage('Choose a room'),
  body('type').optional().isIn(['cleaning', 'maintenance', 'inspection']).withMessage('Invalid task type'),
  body('assignedTo').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid staff member'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes are too long'),
]), asyncHandler(async (req, res) => {
  if (!(await Room.exists({ _id: req.body.room }))) throw httpError(404, 'Room not found');
  if (req.body.assignedTo && req.user.role !== 'admin' && String(req.body.assignedTo) !== String(req.user._id)) {
    throw httpError(403, 'Only admins can assign tasks to other staff');
  }
  const task = await HousekeepingTask.create({ room: req.body.room, type: req.body.type, notes: req.body.notes, assignedTo: req.body.assignedTo || undefined, createdBy: req.user._id });
  if (task.assignedTo && String(task.assignedTo) !== String(req.user._id)) {
    await notify(task.assignedTo, { type: 'task', title: 'New housekeeping task', message: `${task.type} task assigned to you`, link: '/admin' });
  }
  res.status(201).json(await task.populate(populate));
}));

router.patch('/:id', validate([
  body('status').optional().isIn(['pending', 'in-progress', 'done']).withMessage('Invalid status'),
  body('assignedTo').optional({ values: 'null' }).isMongoId().withMessage('Invalid staff member'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes are too long'),
]), asyncHandler(async (req, res) => {
  const task = await HousekeepingTask.findById(req.params.id);
  if (!task) throw httpError(404, 'Task not found');
  const { status, assignedTo, notes } = req.body;

  if (assignedTo !== undefined) {
    if (req.user.role !== 'admin' && assignedTo && String(assignedTo) !== String(req.user._id)) throw httpError(403, 'Only admins can assign tasks to other staff');
    if (assignedTo && !(await User.exists({ _id: assignedTo, role: { $in: ['staff', 'admin'] }, isActive: true }))) throw httpError(400, 'Invalid staff member');
    task.assignedTo = assignedTo || undefined;
    if (assignedTo && String(assignedTo) !== String(req.user._id)) {
      await notify(assignedTo, { type: 'task', title: 'Housekeeping task assigned', message: `${task.type} task assigned to you`, link: '/admin' });
      await audit(req, 'task_assigned', 'housekeeping', task._id, { assignedTo });
    }
  }
  if (notes !== undefined) task.notes = notes;
  if (status) {
    task.status = status;
    task.completedAt = status === 'done' ? new Date() : undefined;
  }
  await task.save();

  // Finished cleaning or maintenance puts the room back on the market (unless a guest is inside).
  if (status === 'done' && ['cleaning', 'maintenance'].includes(task.type)) {
    const room = await Room.findById(task.room);
    const stillOpen = await HousekeepingTask.exists({ room: task.room, _id: { $ne: task._id }, type: { $in: ['cleaning', 'maintenance'] }, status: { $ne: 'done' } });
    const guestInside = await Booking.exists({ room: task.room, status: 'checked-in' });
    if (room && !stillOpen && !guestInside && ['cleaning', 'maintenance'].includes(room.status)) {
      room.status = 'available';
      await room.save();
    }
  }
  res.json(await task.populate(populate));
}));

module.exports = router;
