const router = require('express').Router();
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const paginate = require('../utils/pagination');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req.query, 10, 50);
  const filter = { user: req.user._id };
  if (req.query.unread === '1') filter.read = false;
  const [total, items, unread] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  res.json({ items, unread, ...meta(total) });
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  res.json({ unread: await Notification.countDocuments({ user: req.user._id, read: false }) });
}));

router.patch('/read-all', asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ message: 'All notifications marked as read' });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { read: true }, { new: true });
  if (!n) throw httpError(404, 'Notification not found');
  res.json(n);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!n) throw httpError(404, 'Notification not found');
  res.json({ message: 'Deleted' });
}));

module.exports = router;
