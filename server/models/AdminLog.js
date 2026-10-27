const mongoose = require('mongoose');

const logSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorEmail: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    action: { type: String, required: true },
    entity: { type: String, default: '' },
    entityId: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

logSchema.index({ createdAt: -1 });
logSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AdminLog', logSchema);
