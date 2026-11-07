const mongoose = require('mongoose');

const EVENT_TYPES = [
  'Hackathon',
  'Mini Project Exhibition',
  'Project Competition',
  'Other',
];

const eventSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Event name is required.'],
      trim: true,
      maxlength: [200, 'Event name must be at most 200 characters.'],
    },
    type: {
      type: String,
      required: [true, 'Event type is required.'],
      trim: true,
      enum: {
        values: EVENT_TYPES,
        message: 'Event type must be one of: Hackathon, Mini Project Exhibition, Project Competition, Other.',
      },
    },
    date: {
      type: Date,
      required: [true, 'Event date is required.'],
    },
    venue: {
      type: String,
      required: [true, 'Venue is required.'],
      trim: true,
      maxlength: [300, 'Venue must be at most 300 characters.'],
    },
    description: {
      type: String,
      required: [true, 'Event description is required.'],
      trim: true,
      maxlength: [5000, 'Description must be at most 5000 characters.'],
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Event', eventSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
