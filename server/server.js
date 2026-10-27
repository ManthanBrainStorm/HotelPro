require('dotenv').config();

if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
  console.error('Missing MONGO_URI or JWT_SECRET. Copy server/.env.example to server/.env and fill them in.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters in production.');
  process.exit(1);
}

const app = require('./app');
const connectDB = require('./config/db');
const jobs = require('./jobs');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  jobs.start();
  app.listen(PORT, () => logger.info(`API running on port ${PORT}`));
});

process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err));
