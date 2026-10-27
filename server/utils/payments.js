const crypto = require('crypto');
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const User = require('../models/User');
const notify = require('./notify');
const logger = require('./logger');
const { getStripe } = require('./stripe');
const { sendBookingConfirmation } = require('./email');

async function assignInvoiceNumber(booking) {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  for (let i = 0; i < 5; i += 1) {
    booking.invoiceNumber = `INV-${ym}-${crypto.randomInt(100000, 999999)}`;
    try {
      await booking.save();
      return;
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  throw new Error('Could not allocate an invoice number');
}

// Called once a payment is verified (Stripe session check, webhook, or demo card). Idempotent.
exports.markPaid = async (booking, payment, extra = {}) => {
  if (payment.status === 'paid') return booking;

  payment.status = 'paid';
  payment.paidAt = new Date();
  Object.assign(payment, extra);
  await payment.save();

  // The hold may have expired while the guest was paying. Re-confirm if the room is still free,
  // otherwise queue an automatic refund request so the guest is never charged for nothing.
  let conflict = null;
  if (booking.status === 'cancelled') {
    conflict = await Booking.findOne({
      _id: { $ne: booking._id },
      room: booking.room,
      ...Booking.overlapping(booking.checkIn, booking.checkOut),
      $and: [Booking.blocking()],
    });
  }

  booking.holdExpiresAt = undefined;
  if (conflict) {
    booking.paymentStatus = 'refund_requested';
    payment.status = 'refund_requested';
    payment.refundRequestedAt = new Date();
    payment.refundNote = 'Room was no longer available after payment (hold expired)';
    await payment.save();
    await booking.save();
    await notify(booking.user, {
      type: 'payment', title: 'Payment received, room unavailable',
      message: 'Your hold expired and the room was taken. A refund request has been created automatically.', link: '/my-bookings',
    });
    return booking;
  }

  booking.paymentStatus = 'paid';
  booking.status = 'confirmed';
  booking.cancelledAt = undefined;
  await booking.save();
  await assignInvoiceNumber(booking);

  const [room, user] = await Promise.all([Room.findById(booking.room), User.findById(booking.user)]);
  await notify(booking.user, {
    type: 'booking', title: 'Booking confirmed',
    message: `Room ${room?.number} is booked. Invoice ${booking.invoiceNumber} is ready.`, link: '/my-bookings',
  });
  if (user && room) sendBookingConfirmation(user, booking, room);
  return booking;
};

// Approves a refund request: refunds on Stripe when applicable, then updates payment and booking.
exports.executeRefund = async (payment, adminId) => {
  if (payment.provider === 'stripe' && payment.providerPaymentIntent) {
    const stripe = getStripe();
    if (!stripe) throw Object.assign(new Error('Stripe is not configured'), { status: 503 });
    const refund = await stripe.refunds.create({ payment_intent: payment.providerPaymentIntent });
    payment.refundId = refund.id;
  } else {
    payment.refundId = `demo_re_${crypto.randomBytes(5).toString('hex')}`;
  }
  payment.status = 'refunded';
  payment.refundedAt = new Date();
  payment.processedBy = adminId;
  await payment.save();
  await Booking.findByIdAndUpdate(payment.booking, { paymentStatus: 'refunded' });
  logger.info(`Refund ${payment.refundId} processed for payment ${payment._id}`);
  return payment;
};
