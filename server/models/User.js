const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { encrypt, decrypt } = require('../utils/crypto');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: 2, maxlength: 60 },
    email: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: [8, 'Password must be at least 8 characters'], select: false },
    // Phone numbers are encrypted at rest (AES-256-GCM) and decrypted when read.
    phone: { type: String, trim: true, set: encrypt, get: decrypt },
    role: { type: String, enum: ['guest', 'staff', 'admin'], default: 'guest' },
    department: { type: String, enum: ['', 'front-desk', 'housekeeping', 'support', 'management'], default: '' },
    isActive: { type: Boolean, default: true },
    emailVerified: { type: Boolean, default: false },
    verifyTokenHash: { type: String, select: false },
    verifyExpires: { type: Date, select: false },
    // Bumping tokenVersion invalidates every JWT issued earlier (logout everywhere, password change).
    tokenVersion: { type: Number, default: 0 },
    failedLogins: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      transform: (doc, ret) => {
        delete ret.password; delete ret.verifyTokenHash; delete ret.verifyExpires;
        delete ret.failedLogins; delete ret.lockUntil; delete ret.tokenVersion; delete ret.__v;
        delete ret.id;
        return ret;
      },
    },
  }
);

userSchema.index({ role: 1, isActive: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
