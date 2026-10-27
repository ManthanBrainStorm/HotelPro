const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    guests: { type: Number, required: true, min: 1 },
    nights: { type: Number, required: true, min: 1 },
    totalPrice: { type: Number, required: true, min: 0 },
    specialRequests: { type: String, default: '', maxlength: 500 },
    // pending = room is held while the guest pays (holdExpiresAt); confirmed = paid.
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'],
      default: 'pending',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refund_requested', 'refunded', 'refund_rejected'],
      default: 'pending',
    },
    holdExpiresAt: { type: Date },
    invoiceNumber: { type: String },
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

bookingSchema.index({ room: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ status: 1, checkIn: 1 });
bookingSchema.index({ invoiceNumber: 1 }, { unique: true, partialFilterExpression: { invoiceNumber: { $type: 'string' } } });

// A booking blocks its room while it is confirmed / checked-in, or pending with a live payment hold.
bookingSchema.statics.blocking = function (now = new Date()) {
  return {
    $or: [
      { status: { $in: ['confirmed', 'checked-in'] } },
      { status: 'pending', holdExpiresAt: { $gt: now } },
    ],
  };
};

bookingSchema.statics.overlapping = function (checkIn, checkOut) {
  return { checkIn: { $lt: checkOut }, checkOut: { $gt: checkIn } };
};

module.exports = mongoose.model('Booking', bookingSchema);
