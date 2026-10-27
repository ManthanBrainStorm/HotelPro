const AdminLog = require('../models/AdminLog');
const logger = require('./logger');

// Activity log used for auditing and security monitoring.
module.exports = async function audit(req, action, entity = '', entityId = '', details = {}) {
  try {
    await AdminLog.create({
      actor: req.user?._id,
      actorEmail: req.user?.email || details.email || '',
      actorRole: req.user?.role || '',
      action,
      entity,
      entityId: entityId ? String(entityId) : '',
      details,
      ip: req.ip,
    });
  } catch (err) {
    logger.error('Audit log failed:', err.message);
  }
};
