const mongoose = require('mongoose');

// Guest service requests and customer-support tickets share one collection (type tells them apart).
const requestSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    type: { type: String, enum: ['service', 'support'], default: 'service' },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, default: '', maxlength: 1000 },
    status: { type: String, enum: ['open', 'in-progress', 'resolved'], default: 'open' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    response: { type: String, default: '', maxlength: 1000 },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

requestSchema.index({ status: 1, createdAt: -1 });
requestSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('ServiceRequest', requestSchema);
