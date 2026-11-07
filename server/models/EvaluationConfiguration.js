const mongoose = require('mongoose');

const criterionSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  description: { type: String, trim: true },
  maxMarks: { type: Number, min: 0.000001 },
  weight: { type: Number, min: 0 },
});

const materialSchema = new mongoose.Schema({
  label: { type: String, trim: true },
  url: { type: String, trim: true },
});

const customFieldSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['criteria', 'marks', 'weight', 'question', 'material', 'feedback'],
    required: true,
  },
  label: { type: String, trim: true },
  required: { type: Boolean, default: false },
});

const evaluationConfigurationSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    model: {
      type: String,
      required: true,
      enum: [
        'criteria-based',
        'open-holistic',
        'remote-async',
        'live-demo',
        'ranking-voting',
        'custom',
      ],
    },
    // --- Criteria-Based ---
    criteriaBased: {
      criteria: [criterionSchema],
    },
    // --- Open / Holistic ---
    openHolistic: {
      scoreMin: { type: Number, min: 0, default: 0 },
      scoreMax: { type: Number, min: 1, default: 100 },
      githubReview: { type: Boolean, default: true },
      projectReview: { type: Boolean, default: true },
      overallFeedback: { type: Boolean, default: true },
    },
    // --- Remote / Asynchronous ---
    remoteAsync: {
      materials: [materialSchema],
    },
    // --- Live Demo & Presentation ---
    liveDemo: {
      demoEvaluation: { type: Boolean, default: true },
      presentationEvaluation: { type: Boolean, default: true },
      judgeQuestions: { type: Boolean, default: true },
      overallScoreFeedback: { type: Boolean, default: true },
      criteria: [criterionSchema],
    },
    // --- Ranking / Voting ---
    rankingVoting: {
      ranking: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      rankCalculation: {
        type: String,
        enum: ['total', 'average', 'points', 'composite'],
        default: 'total',
      },
    },
    // --- Custom ---
    custom: {
      fields: [customFieldSchema],
    },
    dynamicSchema: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('EvaluationConfiguration', evaluationConfigurationSchema);
