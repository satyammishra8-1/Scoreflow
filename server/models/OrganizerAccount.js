const mongoose = require('mongoose');

const organizerAccountSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 100, default: '' },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['organizer'], default: 'organizer', immutable: true },
  tokenVersion: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('OrganizerAccount', organizerAccountSchema);
