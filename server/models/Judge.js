const mongoose = require('mongoose');

const judgeSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'eventId is required.'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Judge name is required.'],
      trim: true,
      maxlength: [100, 'Judge name must be at most 100 characters.'],
    },
    email: {
      type: String,
      required: [true, 'Judge email is required.'],
      trim: true,
      lowercase: true,
      maxlength: [254, 'Judge email must be at most 254 characters.'],
    },
    assignedTeamIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Team',
      default: [],
    },
    status: {
      type: String,
      enum: ['Pending', 'Active'],
      default: 'Pending',
    },
    invitationStatus: {
      type: String,
      enum: ['pending', 'accepted', 'expired'],
    },
    invitationTokenHash: {
      type: String,
      select: false,
    },
    invitationExpiresAt: Date,
    invitationAcceptedAt: Date,
  },
  {
    timestamps: true,
  },
);

judgeSchema.index({ eventId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('Judge', judgeSchema);
