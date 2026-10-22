const mongoose = require('mongoose');

const reportContentSchema = new mongoose.Schema({
  summary: { type: String, required: true, trim: true, maxlength: 4000 },
  strengths: { type: [String], required: true, validate: (items) => items.length > 0 },
  weaknesses: { type: [String], required: true, validate: (items) => items.length > 0 },
  whyThisMatters: { type: String, required: true, trim: true, maxlength: 4000 },
  improvementSuggestions: { type: [String], required: true, validate: (items) => items.length > 0 },
  priorityAreas: { type: [String], required: true, validate: (items) => items.length > 0 },
  judgeFeedbackSummary: { type: String, required: true, trim: true, maxlength: 4000 },
  finalRemarks: { type: String, required: true, trim: true, maxlength: 4000 },
}, { _id: false });

const resultReportSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  report: { type: reportContentSchema, required: true },
  model: { type: String, required: true, trim: true },
  promptVersion: { type: String, required: true, trim: true },
  evidenceHash: { type: String, trim: true, default: '' },
  generatedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

resultReportSchema.index({ event: 1, team: 1 }, { unique: true });

module.exports = mongoose.model('ResultReport', resultReportSchema);
