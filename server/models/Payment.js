const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'inr' },
    provider: { type: String, enum: ['stripe', 'demo'], required: true },
    providerSessionId: { type: String },
    providerPaymentIntent: { type: String },
    cardLast4: { type: String },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refund_requested', 'refunded', 'refund_rejected'],
      default: 'pending',
    },
    paidAt: { type: Date },
    refundRequestedAt: { type: Date },
    refundedAt: { type: Date },
    refundId: { type: String },
    refundNote: { type: String },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

paymentSchema.index({ booking: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ providerSessionId: 1 }, { sparse: true });

module.exports = mongoose.model('Payment', paymentSchema);
