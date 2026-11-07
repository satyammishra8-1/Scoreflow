const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Member name is required.'],
      trim: true,
    },
    email: { type: String, trim: true, default: '' },
    usn: { type: String, trim: true, default: '' },
    section: { type: String, trim: true, default: '' },
    github: { type: String, trim: true, default: '' },
    demo: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const teamSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'eventId is required.'],
      index: true,
    },
    teamNumber: {
      type: String,
      required: [true, 'Team number is required.'],
      trim: true,
    },
    teamName: {
      type: String,
      required: [true, 'Team name is required.'],
      trim: true,
    },
    members: {
      type: [memberSchema],
      default: [],
    },
    project: { type: String, trim: true, default: '' },
    githubUrl: { type: String, trim: true, default: '' },
    demoUrl: { type: String, trim: true, default: '' },
    judges: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['Pending', 'Complete'],
      default: 'Pending',
    },
  },
  {
    timestamps: true,
  },
);

teamSchema.index({ eventId: 1, teamNumber: 1 }, { unique: true });

module.exports = mongoose.model('Team', teamSchema);
