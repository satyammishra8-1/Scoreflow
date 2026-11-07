const mongoose = require('mongoose');

const refreshSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  role: { type: String, enum: ['organizer', 'judge'], required: true },
  sessionType: { type: String, enum: ['organizer', 'invitation'], default: 'organizer' },
  tokenHash: { type: String, required: true, unique: true },
  familyId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('RefreshSession', refreshSessionSchema);
