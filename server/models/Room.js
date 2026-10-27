const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    hotel: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'RoomCategory', required: true },
    number: { type: String, required: [true, 'Room number is required'], trim: true },
    pricePerNight: { type: Number, required: true, min: 0 },
    capacity: { type: Number, required: true, min: 1, max: 20 },
    description: { type: String, default: '', maxlength: 1000 },
    amenities: [{ type: String, trim: true }],
    images: [String],
    // Operational status, updated by staff. "maintenance" rooms cannot be booked.
    status: { type: String, enum: ['available', 'occupied', 'cleaning', 'maintenance'], default: 'available' },
    isActive: { type: Boolean, default: true },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

roomSchema.index({ hotel: 1, number: 1 }, { unique: true });
roomSchema.index({ category: 1, pricePerNight: 1 });
roomSchema.index({ isActive: 1, status: 1 });

module.exports = mongoose.model('Room', roomSchema);
