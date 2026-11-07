const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'eventId is required.'],
      index: true,
    },
    judgeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Judge',
      required: [true, 'judgeId is required.'],
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: [true, 'teamId is required.'],
      index: true,
    },
    scores: {
      type: Map,
      of: Number,
      default: {},
    },
    totalScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    weightedScore: {
      type: Number,
      default: 0,
    },
    feedback: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'],
      default: 'NOT_STARTED',
    },
    attendance: {
      type: String,
      trim: true,
      default: 'Present',
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },
    memberAttendance: {
      type: Map,
      of: String,
      default: {},
    },
    textAnswers: {
      type: Map,
      of: String,
      default: {},
    },
    flags: {
      type: Map,
      of: Boolean,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// One evaluation per judge per team per event; repeat submissions update
// the existing record instead of creating duplicates.
evaluationSchema.index({ eventId: 1, judgeId: 1, teamId: 1 }, { unique: true });

module.exports = mongoose.model('Evaluation', evaluationSchema);
