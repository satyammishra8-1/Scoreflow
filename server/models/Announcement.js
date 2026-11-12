const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  requestId: { type: String, trim: true, maxlength: 100, default: '' },
  audienceType: { type: String, enum: ['judges', 'teams'], required: true },
  recipientMode: { type: String, enum: ['all', 'specific'], required: true },
  recipientIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  subject: { type: String, required: true, trim: true, maxlength: 200 },
  message: { type: String, required: true, trim: true, maxlength: 10000 },
  resolvedRecipients: { type: [String], default: [], select: false },
  sentCount: { type: Number, default: 0, min: 0 },
  acceptedCount: { type: Number, default: 0, min: 0 },
  deliveredCount: { type: Number, default: 0, min: 0 },
  failedCount: { type: Number, default: 0, min: 0 },
  deliveryResults: [{
    recipientEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    status: { type: String, enum: ['sending', 'accepted', 'sent', 'delivered', 'deferred', 'soft_bounced', 'hard_bounced', 'bounced', 'blocked', 'spam', 'invalid', 'unsubscribed', 'suppressed', 'failed', 'unknown'], required: true },
    trackingId: { type: String, default: '' },
    providerMessageId: { type: String, default: '' },
    reason: { type: String, default: '', maxlength: 500 },
  }],
  status: { type: String, enum: ['sending', 'accepted', 'partial_accepted', 'failed', 'sent', 'partial'], required: true },
  sentAt: { type: Date, default: Date.now },
}, { timestamps: true });

announcementSchema.index({ eventId: 1, createdAt: -1 });
announcementSchema.index({ eventId: 1, requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string', $gt: '' } } });

module.exports = mongoose.model('Announcement', announcementSchema);
