let client = null;

exports.stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

exports.getStripe = () => {
  if (!exports.stripeEnabled()) return null;
  if (!client) client = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return client;
};

// Demo mode lets the project run end-to-end without Stripe keys (never enable in production).
exports.demoPaymentsAllowed = () =>
  !exports.stripeEnabled() && process.env.DEMO_PAYMENTS !== 'false';
