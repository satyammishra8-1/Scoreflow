const mongoose = require('mongoose');
const Event = require('../models/Event');
const Team = require('../models/Team');
const Judge = require('../models/Judge');
const EvaluationConfiguration = require('../models/EvaluationConfiguration');
const Evaluation = require('../models/Evaluation');

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function toEventResponse(event) {
  if (!event) return null;
  const obj = typeof event.toObject === 'function' ? event.toObject() : event;
  let date = obj.date;
  if (date instanceof Date) {
    date = date.toISOString().slice(0, 10);
  } else if (typeof date === 'string') {
    date = date.slice(0, 10);
  }
  return {
    ...obj,
    eventId: String(obj._id),
    date,
  };
}

function validateEventPayload(payload = {}) {
  const errors = {};
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const type = typeof payload.type === 'string' ? payload.type.trim() : '';
  const venue = typeof payload.venue === 'string' ? payload.venue.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  const rawDate = typeof payload.date === 'string' ? payload.date.trim() : payload.date;

  if (!name) errors.name = 'Enter an event name.';
  if (!['Hackathon', 'Mini Project Exhibition', 'Project Competition', 'Other'].includes(type)) {
    errors.type = 'Choose an event type.';
  }
  if (!rawDate || Number.isNaN(new Date(rawDate).getTime())) {
    errors.date = 'Choose an event date.';
  }
  if (!venue) errors.venue = 'Enter a venue.';
  if (!description) errors.description = 'Enter an event description.';

  return {
    errors,
    normalized: {
      name,
      type,
      date: rawDate ? new Date(rawDate) : rawDate,
      venue,
      description,
    },
  };
}

exports.createEvent = async (req, res) => {
  try {
    const { errors, normalized } = validateEventPayload(req.body || {});
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        error: 'The event did not pass validation.',
        details: errors,
      });
    }

    const event = await Event.create(normalized);
    return res.status(201).json({ success: true, data: toEventResponse(event) });
  } catch (error) {
    console.error('Failed to create event:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: 'Failed to create the event.' });
  }
};

exports.listEvents = async (_req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json({
      success: true,
      data: events.map(toEventResponse),
    });
  } catch (error) {
    console.error('Failed to list events:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve events.' });
  }
};

exports.getEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
    }

    const event = await Event.findById(eventId).lean();
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }
    return res.status(200).json({ success: true, data: toEventResponse(event) });
  } catch (error) {
    console.error('Failed to get event:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve the event.' });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
    }

    const { errors, normalized } = validateEventPayload(req.body || {});
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        error: 'The event did not pass validation.',
        details: errors,
      });
    }

    const event = await Event.findByIdAndUpdate(eventId, normalized, {
      new: true,
      runValidators: true,
    }).lean();
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }
    return res.status(200).json({ success: true, data: toEventResponse(event) });
  } catch (error) {
    console.error('Failed to update event:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: 'Failed to update the event.' });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
    }

    const event = await Event.findById(eventId).select('_id').lean();
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    const scopedEventId = event._id;
    await Team.deleteMany({ eventId: scopedEventId });
    await Judge.deleteMany({ eventId: scopedEventId });
    await EvaluationConfiguration.deleteMany({ eventId: String(scopedEventId) });
    await Evaluation.deleteMany({ eventId: scopedEventId });

    const deletedEvent = await Event.findByIdAndDelete(scopedEventId).select('_id').lean();
    if (!deletedEvent) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    return res.status(200).json({
      success: true,
      data: { eventId: String(deletedEvent._id) },
    });
  } catch (error) {
    console.error('Failed to delete event and associated data:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete the event and its associated data.' });
  }
};
