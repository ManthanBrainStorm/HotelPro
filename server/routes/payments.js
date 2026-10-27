const router = require('express').Router();
const { body } = require('express-validator');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Room = require('../models/Room');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const audit = require('../utils/audit');
const notify = require('../utils/notify');
const paginate = require('../utils/pagination');
const logger = require('../utils/logger');
const { getStripe, stripeEnabled, demoPaymentsAllowed } = require('../utils/stripe');
const { markPaid, executeRefund } = require('../utils/payments');
const { sendRefundUpdate } = require('../utils/email');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

const currency = () => (process.env.CURRENCY || 'inr').toLowerCase();
const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0];

async function payableBooking(req) {
  const booking = await Booking.findById(req.body.bookingId);
  if (!booking || String(booking.user) !== String(req.user._id)) throw httpError(404, 'Booking not found');
  if (booking.paymentStatus === 'paid') throw httpError(409, 'This booking is already paid');
  if (booking.status !== 'pending') throw httpError(409, `A ${booking.status} booking cannot be paid`);
  if (!booking.holdExpiresAt || booking.holdExpiresAt < new Date()) {
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    await booking.save();
    throw httpError(410, 'Your payment window expired and the room was released. Please book again.');
  }
  return booking;
}

// Stripe webhook handler. Mounted in app.js with a raw body parser.
exports.webhook = async (req, res) => {
  const stripe = getStripe();
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send('Webhook not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn('Stripe webhook signature failed:', err.message);
    return res.status(400).send('Invalid signature');
  }
  if (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') {
    const session = event.data.object;
    const payment = await Payment.findOne({ providerSessionId: session.id });
    const booking = payment && (await Booking.findById(payment.booking));
    if (payment && booking) await markPaid(booking, payment, { providerPaymentIntent: session.payment_intent });
  }
  res.json({ received: true });
};

// GET /api/payments/config - tells the client which flow to use
router.get('/config', (req, res) => {
  res.json({ provider: stripeEnabled() ? 'stripe' : demoPaymentsAllowed() ? 'demo' : 'none', currency: currency() });
});

// POST /api/payments/checkout { bookingId } - starts a payment for a held booking
router.post('/checkout', protect, validate([body('bookingId').isMongoId().withMessage('Invalid booking')]), asyncHandler(async (req, res) => {
  const booking = await payableBooking(req);
  const room = await Room.findById(booking.room);
  const provider = stripeEnabled() ? 'stripe' : demoPaymentsAllowed() ? 'demo' : null;
  if (!provider) throw httpError(503, 'Online payments are not configured');

  let payment = await Payment.findOne({ booking: booking._id, status: 'pending' });
  if (!payment) {
    payment = await Payment.create({ booking: booking._id, user: req.user._id, amount: booking.totalPrice, currency: currency(), provider });
  }
  if (provider === 'demo') return res.json({ provider: 'demo', paymentId: payment._id });

  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: req.user.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: currency(),
        unit_amount: Math.round(booking.totalPrice * 100),
        product_data: { name: `Room ${room.number} - ${booking.nights} night${booking.nights > 1 ? 's' : ''}` },
      },
    }],
    metadata: { bookingId: String(booking._id), paymentId: String(payment._id) },
    success_url: `${clientUrl()}/payment/success?booking=${booking._id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl()}/pay/${booking._id}`,
  });
  payment.providerSessionId = session.id;
  await payment.save();
  res.json({ provider: 'stripe', url: session.url });
}));

// POST /api/payments/verify { bookingId, sessionId } - confirms a Stripe payment server-side
router.post('/verify', protect, validate([
  body('bookingId').isMongoId().withMessage('Invalid booking'),
  body('sessionId').isString().notEmpty().withMessage('Missing session id'),
]), asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.body.bookingId);
  if (!booking || String(booking.user) !== String(req.user._id)) throw httpError(404, 'Booking not found');
  if (booking.paymentStatus === 'paid') return res.json({ booking, verified: true });

  const stripe = getStripe();
  if (!stripe) throw httpError(503, 'Stripe is not configured');
  const payment = await Payment.findOne({ booking: booking._id, providerSessionId: req.body.sessionId });
  if (!payment) throw httpError(404, 'Payment not found for this booking');

  const session = await stripe.checkout.sessions.retrieve(req.body.sessionId);
  if (session.metadata?.bookingId !== String(booking._id) || session.amount_total !== Math.round(booking.totalPrice * 100)) {
    throw httpError(400, 'Payment does not match this booking');
  }
  if (session.payment_status !== 'paid') throw httpError(402, 'Payment has not been completed');

  await markPaid(booking, payment, { providerPaymentIntent: session.payment_intent });
  res.json({ booking, verified: true });
}));

// POST /api/payments/demo-pay { bookingId, cardNumber } - simulated card payment (no Stripe keys needed)
router.post('/demo-pay', protect, validate([
  body('bookingId').isMongoId().withMessage('Invalid booking'),
  body('cardNumber').isString().custom((v) => /^\d{13,19}$/.test(v.replace(/\s/g, ''))).withMessage('Enter a valid card number'),
]), asyncHandler(async (req, res) => {
  if (!demoPaymentsAllowed()) throw httpError(403, 'Demo payments are disabled');
  const booking = await payableBooking(req);
  const digits = req.body.cardNumber.replace(/\s/g, '');
  const payment = (await Payment.findOne({ booking: booking._id, status: 'pending', provider: 'demo' }))
    || (await Payment.create({ booking: booking._id, user: req.user._id, amount: booking.totalPrice, currency: currency(), provider: 'demo' }));

  // Test cards, mirroring Stripe: 4242... succeeds, 4000 0000 0000 0002 is declined.
  if (digits === '4000000000000002') {
    payment.status = 'failed';
    await payment.save();
    throw httpError(402, 'Your card was declined. Try the test card 4242 4242 4242 4242.');
  }
  await markPaid(booking, payment, { cardLast4: digits.slice(-4), providerSessionId: `demo_${payment._id}` });
  res.json({ booking, verified: true });
}));

// ---- Admin: payment tracking and refunds ----
router.get('/', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req.query, 10, 100);
  const filter = req.query.status ? { status: req.query.status } : {};
  const [total, payments] = await Promise.all([
    Payment.countDocuments(filter),
    Payment.find(filter).populate('user', 'name email').populate({ path: 'booking', select: 'checkIn checkOut invoiceNumber status room', populate: { path: 'room', select: 'number' } })
      .sort('-createdAt').skip(skip).limit(limit),
  ]);
  res.json({ payments, ...meta(total) });
}));

router.post('/:id/refund', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) throw httpError(404, 'Payment not found');
  if (payment.status !== 'refund_requested') throw httpError(409, 'There is no pending refund request on this payment');
  await executeRefund(payment, req.user._id);
  const [booking, guest] = await Promise.all([Booking.findById(payment.booking), User.findById(payment.user)]);
  await notify(payment.user, { type: 'payment', title: 'Refund processed', message: `INR ${payment.amount.toLocaleString('en-IN')} has been refunded.`, link: '/my-bookings' });
  if (guest && booking) sendRefundUpdate(guest, booking, true);
  await audit(req, 'refund_approved', 'payment', payment._id, { amount: payment.amount, refundId: payment.refundId });
  res.json(payment);
}));

router.post('/:id/refund/reject', protect, authorize('admin'), validate([body('reason').optional().isString().isLength({ max: 300 })]),
  asyncHandler(async (req, res) => {
    const payment = await Payment.findById(req.params.id);
    if (!payment) throw httpError(404, 'Payment not found');
    if (payment.status !== 'refund_requested') throw httpError(409, 'There is no pending refund request on this payment');
    payment.status = 'refund_rejected';
    payment.refundNote = req.body.reason || '';
    payment.processedBy = req.user._id;
    await payment.save();
    const [booking, guest] = await Promise.all([
      Booking.findByIdAndUpdate(payment.booking, { paymentStatus: 'refund_rejected' }, { new: true }),
      User.findById(payment.user),
    ]);
    await notify(payment.user, { type: 'payment', title: 'Refund not approved', message: req.body.reason || 'Please contact the front desk for details.', link: '/my-bookings' });
    if (guest && booking) sendRefundUpdate(guest, booking, false, req.body.reason);
    await audit(req, 'refund_rejected', 'payment', payment._id, { reason: req.body.reason || '' });
    res.json(payment);
  }));

module.exports.router = router;
