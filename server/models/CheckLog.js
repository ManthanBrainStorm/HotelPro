const mongoose = require('mongoose');

// One row per check-in / check-out performed by staff.
const checkLogSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    guest: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['check-in', 'check-out'], required: true },
  },
  { timestamps: true }
);

checkLogSchema.index({ booking: 1, createdAt: 1 });

module.exports = mongoose.model('CheckLog', checkLogSchema);
