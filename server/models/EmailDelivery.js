const mongoose = require('mongoose');

const emailDeliverySchema = new mongoose.Schema({
  trackingId: { type: String, required: true, unique: true, index: true },
  category: { type: String, enum: ['judge_invitation', 'result_report', 'announcement'], required: true, index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
  contextId: { type: String, default: '', index: true },
  referenceId: { type: String, default: '', index: true },
  recipientEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, select: false },
  subject: { type: String, required: true, maxlength: 200 },
  providerMessageId: { type: String, default: '' },
  providerEventId: { type: String, default: '' },
  providerEvent: { type: String, default: '' },
  status: { type: String, enum: ['sending', 'accepted', 'sent', 'delivered', 'deferred', 'soft_bounced', 'hard_bounced', 'bounced', 'blocked', 'spam', 'invalid', 'unsubscribed', 'failed', 'unknown'], required: true, default: 'sending', index: true },
  reason: { type: String, default: '', maxlength: 1000 },
  acceptedAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  lastEventAt: { type: Date, default: null },
}, { timestamps: true });

emailDeliverySchema.index({ eventId: 1, category: 1, createdAt: -1 });
emailDeliverySchema.index({ providerMessageId: 1 }, { unique: true, partialFilterExpression: { providerMessageId: { $type: 'string', $gt: '' } } });
emailDeliverySchema.index({ recipientEmail: 1, status: 1, lastEventAt: -1 });

module.exports = mongoose.model('EmailDelivery', emailDeliverySchema);
