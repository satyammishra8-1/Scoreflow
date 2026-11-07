const mongoose = require('mongoose');

const memberDeliverySchema = new mongoose.Schema({
  memberIndex: { type: Number, required: true, min: 0 },
  memberName: { type: String, trim: true, default: 'Team member' },
  status: { type: String, enum: ['Sent', 'Failed'], required: true },
  reason: { type: String, trim: true, default: '' },
}, { _id: false });

const resultReportDeliverySchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  report: { type: mongoose.Schema.Types.ObjectId, ref: 'ResultReport', required: true },
  requestId: { type: String, required: true, maxlength: 100 },
  status: { type: String, enum: ['Sending', 'Sent', 'Partially Sent', 'Failed'], required: true, default: 'Sending' },
  members: { type: [memberDeliverySchema], default: [] },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

resultReportDeliverySchema.index({ event: 1, team: 1, requestId: 1 }, { unique: true });
resultReportDeliverySchema.index(
  { event: 1, team: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'Sending' } },
);
resultReportDeliverySchema.index({ event: 1, createdAt: -1 });

module.exports = mongoose.model('ResultReportDelivery', resultReportDeliverySchema);
