const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    type: { type: String, enum: ['cleaning', 'maintenance', 'inspection'], default: 'cleaning' },
    status: { type: String, enum: ['pending', 'in-progress', 'done'], default: 'pending' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, default: '', maxlength: 500 },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

taskSchema.index({ status: 1, createdAt: -1 });
taskSchema.index({ assignedTo: 1, status: 1 });

module.exports = mongoose.model('HousekeepingTask', taskSchema);
