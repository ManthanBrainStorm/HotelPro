const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');

const sanitize = require('./middleware/sanitize');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/error');
const payments = require('./routes/payments');

const app = express();
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
const origins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim());
app.use(cors({ origin: origins }));
if (process.env.NODE_ENV !== 'test') app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Stripe needs the raw body to verify webhook signatures, so this route comes before express.json().
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), payments.webhook);

app.use(express.json({ limit: '100kb' }));
app.use(mongoSanitize());
app.use(sanitize);
app.use('/api', apiLimiter);
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));

app.get('/api/health', (req, res) => {
  const up = mongoose.connection.readyState === 1;
  res.status(up ? 200 : 503).json({ ok: up, uptime: Math.round(process.uptime()) });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/hotels', require('./routes/hotels'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/pricing', require('./routes/pricing'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', payments.router);
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/services', require('./routes/services'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/housekeeping', require('./routes/housekeeping'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/admin', require('./routes/admin'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
