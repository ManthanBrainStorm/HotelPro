const logger = require('../utils/logger');

exports.notFound = (req, res) => res.status(404).json({ message: 'Route not found' });

// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(', ') });
  }
  if (err.name === 'CastError') return res.status(400).json({ message: `Invalid ${err.path}` });
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    return res.status(409).json({ message: `That ${field} is already in use` });
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 2 MB or smaller' : err.message });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body' });

  const status = err.status || 500;
  if (status >= 500) logger.error(`${req.method} ${req.originalUrl}`, err);
  res.status(status).json({
    message: status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
};
