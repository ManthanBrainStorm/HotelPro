const mongoose = require('mongoose');
const logger = require('../utils/logger');

module.exports = async function connectDB(uri = process.env.MONGO_URI) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
};
