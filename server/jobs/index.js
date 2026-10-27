// Lightweight background jobs (no extra infrastructure needed).
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Room = require('../models/Room');
const User = require('../models/User');
const notify = require('../utils/notify');
const logger = require('../utils/logger');
const { sendCheckInReminder } = require('../utils/email');
const { todayUTC, DAY } = require('../utils/pricing');

// Release rooms whose payment window ran out.
async function expirePendingBookings() {
  const expired = await Booking.find({ status: 'pending', holdExpiresAt: { $lt: new Date() } }).select('_id');
  if (!expired.length) return 0;
  const ids = expired.map((b) => b._id);
  await Booking.updateMany({ _id: { $in: ids } }, { status: 'cancelled', cancelledAt: new Date(), $unset: { holdExpiresAt: 1 } });
  await Payment.updateMany({ booking: { $in: ids }, status: 'pending' }, { status: 'failed' });
  logger.info(`Released ${ids.length} expired booking hold(s)`);
  return ids.length;
}

// Remind guests the day before they arrive.
async function sendReminders() {
  const tomorrow = new Date(todayUTC().getTime() + DAY);
  const dayAfter = new Date(tomorrow.getTime() + DAY);
  const due = await Booking.find({ status: 'confirmed', paymentStatus: 'paid', reminderSent: false, checkIn: { $gte: tomorrow, $lt: dayAfter } });
  for (const b of due) {
    const [user, room] = await Promise.all([User.findById(b.user), Room.findById(b.room)]);
    await notify(b.user, { type: 'stay', title: 'Your stay starts tomorrow', message: `Room ${room?.number} is ready for you.`, link: '/my-bookings' });
    if (user && room) sendCheckInReminder(user, b, room);
    b.reminderSent = true;
    await b.save();
  }
  return due.length;
}

const safe = (name, fn) => async () => {
  try { await fn(); } catch (err) { logger.error(`Job ${name} failed:`, err.message); }
};

exports.start = () => {
  const timers = [
    setInterval(safe('expirePendingBookings', expirePendingBookings), 60 * 1000),
    setInterval(safe('sendReminders', sendReminders), 60 * 60 * 1000),
  ];
  timers.forEach((t) => t.unref());
  safe('expirePendingBookings', expirePendingBookings)();
  return () => timers.forEach(clearInterval);
};

exports.expirePendingBookings = expirePendingBookings;
exports.sendReminders = sendReminders;
