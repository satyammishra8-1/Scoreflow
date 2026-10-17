const mongoose = require('mongoose');
const Team = require('../models/Team');
const Event = require('../models/Event');

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function toTeamResponse(team) {
  if (!team) return null;
  const obj = typeof team.toObject === 'function' ? team.toObject() : team;
  return {
    ...obj,
    eventId: obj.eventId != null ? String(obj.eventId) : obj.eventId,
    teamId: obj._id != null ? String(obj._id) : undefined,
  };
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMembers(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((member) => member && typeof member === 'object')
    .map((member) => ({
      name: normalizeString(member.name),
      email: normalizeString(member.email),
      usn: normalizeString(member.usn),
      section: normalizeString(member.section),
      github: normalizeString(member.github),
      demo: normalizeString(member.demo),
    }))
    .filter((member) => member.name);
}

function validateTeamPayload(payload = {}) {
  const errors = {};
  const teamNumber = normalizeString(payload.teamNumber ?? payload.number);
  const teamName = normalizeString(payload.teamName ?? payload.name);
  const project = normalizeString(payload.project);
  const githubUrl = normalizeString(payload.githubUrl ?? payload.github);
  const demoUrl = normalizeString(payload.demoUrl ?? payload.demo);
  const status = normalizeString(payload.status) || 'Pending';
  const members = normalizeMembers(payload.members);
  const judges = Array.isArray(payload.judges)
    ? payload.judges.filter((judge) => typeof judge === 'string').map((judge) => judge.trim()).filter(Boolean)
    : [];

  if (!teamNumber) errors.teamNumber = 'Enter a team number.';
  if (!teamName) errors.teamName = 'Enter a team name.';
  if (!['Pending', 'Complete'].includes(status)) errors.status = 'Status must be Pending or Complete.';
  if (members.length === 0) errors.members = 'Add at least one team member.';

  return {
    errors,
    normalized: { teamNumber, teamName, project, members, githubUrl, demoUrl, judges, status },
  };
}

async function ensureEventExists(eventId) {
  if (!isValidObjectId(eventId)) return { valid: false };
  const event = await Event.findById(eventId).select('_id').lean();
  if (!event) return { valid: true, exists: false };
  return { valid: true, exists: true };
}

function handleDuplicateKeyError(error) {
  if (error && error.code === 11000) {
    return { success: false, error: 'A team with this team number already exists for the event.' };
  }
  return null;
}
exports.createTeam = async (req, res) => {
  try {
    const payload = req.body || {};
    const rawEventId = payload.eventId != null ? String(payload.eventId) : '';
    const check = await ensureEventExists(rawEventId);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
    }
    if (!check.exists) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    const { errors, normalized } = validateTeamPayload(payload);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        error: 'The team did not pass validation.',
        details: errors,
      });
    }

    const team = await Team.create({ ...normalized, eventId: rawEventId });
    return res.status(201).json({ success: true, data: toTeamResponse(team) });
  } catch (error) {
    console.error('Failed to create team:', error);
    const duplicate = handleDuplicateKeyError(error);
    if (duplicate) return res.status(409).json(duplicate);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: 'Failed to create the team.' });
  }
};

exports.listTeamsByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const check = await ensureEventExists(eventId);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
    }
    if (!check.exists) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    const teams = await Team.find({ eventId }).sort({ teamNumber: 1, createdAt: 1 }).lean();
    return res.status(200).json({ success: true, data: teams.map(toTeamResponse) });
  } catch (error) {
    console.error('Failed to list teams:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve teams.' });
  }
};
exports.getTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ success: false, error: 'A valid teamId is required.' });
    }
    const team = await Team.findById(teamId).lean();
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }
    return res.status(200).json({ success: true, data: toTeamResponse(team) });
  } catch (error) {
    console.error('Failed to get team:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve the team.' });
  }
};

exports.deleteTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ success: false, error: 'A valid teamId is required.' });
    }
    const team = await Team.findByIdAndDelete(teamId).lean();
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }
    return res.status(200).json({ success: true, data: toTeamResponse(team) });
  } catch (error) {
    console.error('Failed to delete team:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete the team.' });
  }
};
exports.updateTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ success: false, error: 'A valid teamId is required.' });
    }

    const { errors, normalized } = validateTeamPayload(req.body || {});
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        error: 'The team did not pass validation.',
        details: errors,
      });
    }

    const team = await Team.findByIdAndUpdate(teamId, normalized, {
      new: true,
      runValidators: true,
    }).lean();
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }
    return res.status(200).json({ success: true, data: toTeamResponse(team) });
  } catch (error) {
    console.error('Failed to update team:', error);
    const duplicate = handleDuplicateKeyError(error);
    if (duplicate) return res.status(409).json(duplicate);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: 'Failed to update the team.' });
  }
};
