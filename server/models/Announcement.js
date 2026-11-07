const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  audienceType: { type: String, enum: ['judges', 'teams'], required: true },
  recipientMode: { type: String, enum: ['all', 'specific'], required: true },
  recipientIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  subject: { type: String, required: true, trim: true, maxlength: 200 },
  message: { type: String, required: true, trim: true, maxlength: 10000 },
  resolvedRecipients: { type: [String], default: [], select: false },
  sentCount: { type: Number, default: 0, min: 0 },
  failedCount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['sent', 'partial', 'failed'], required: true },
  sentAt: { type: Date, default: Date.now },
}, { timestamps: true });

announcementSchema.index({ eventId: 1, createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
