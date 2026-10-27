const mongoose = require('mongoose');

const seasonalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    // 1.25 = +25 %, 0.9 = 10 % off
    multiplier: { type: Number, required: true, min: 0.1, max: 5 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'RoomCategory', default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

seasonalSchema.pre('validate', function (next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    return next(new Error('End date must be on or after the start date'));
  }
  next();
});
seasonalSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('SeasonalPrice', seasonalSchema);
