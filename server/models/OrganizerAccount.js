const mongoose = require('mongoose');

const organizerAccountSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  tokenVersion: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('OrganizerAccount', organizerAccountSchema);
