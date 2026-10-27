const Notification = require('../models/Notification');
const logger = require('./logger');

// In-app notification. Failures are logged, never thrown.
module.exports = async function notify(userId, { type = 'info', title, message, link = '' }) {
  try {
    if (!userId) return null;
    return await Notification.create({ user: userId, type, title, message, link });
  } catch (err) {
    logger.error('Notification failed:', err.message);
    return null;
  }
};
