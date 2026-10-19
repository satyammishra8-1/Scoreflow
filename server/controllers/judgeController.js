const mongoose = require('mongoose');
const Judge = require('../models/Judge');
const Event = require('../models/Event');
const Team = require('../models/Team');

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function toJudgeResponse(judge) {
  if (!judge) return null;
  const obj = typeof judge.toObject === 'function' ? judge.toObject() : judge;
  return {
    ...obj,
    eventId: obj.eventId != null ? String(obj.eventId) : obj.eventId,
    judgeId: obj._id != null ? String(obj._id) : undefined,
    assignedTeamIds: Array.isArray(obj.assignedTeamIds)
      ? obj.assignedTeamIds.map((id) => String(id))
      : [],
  };
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAssignedTeamIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => (id != null ? String(id).trim() : '')))];
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function validateJudgePayload(payload = {}) {
  const errors = {};
  const name = normalizeString(payload.name);
  const email = normalizeString(payload.email).toLowerCase();
  const assignedTeamIds = normalizeAssignedTeamIds(
    payload.assignedTeamIds ?? payload.teamIds,
  );
  const statusInput = normalizeString(payload.status);
  const status = statusInput || (assignedTeamIds.length > 0 ? 'Active' : 'Pending');

  if (!name) errors.name = 'Enter the judge name.';
  else if (name.length > 100) errors.name = 'Judge name must be at most 100 characters.';
  if (!email) errors.email = 'Enter the judge email address.';
  else if (email.length > 254) errors.email = 'Judge email must be at most 254 characters.';
  else if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';
  if (assignedTeamIds.some((id) => !isValidObjectId(id))) {
    errors.assignedTeamIds = 'Assigned team IDs must be valid.';
  }
  if (status && !['Pending', 'Active'].includes(status)) {
    errors.status = 'Status must be Pending or Active.';
  }

  return { errors, normalized: { name, email, assignedTeamIds, status: status || 'Pending' } };
}

async function ensureEventExists(eventId) {
  if (!isValidObjectId(eventId)) return { valid: false };
  const event = await Event.findById(eventId).select('_id').lean();
  if (!event) return { valid: true, exists: false };
  return { valid: true, exists: true };
}

async function ensureTeamsBelongToEvent(eventId, assignedTeamIds) {
  if (assignedTeamIds.length === 0) return { ok: true };
  const count = await Team.countDocuments({
    _id: { $in: assignedTeamIds },
    eventId,
  });
  if (count !== assignedTeamIds.length) {
    return { ok: false, error: 'One or more assigned teams do not belong to this event.' };
  }
  return { ok: true };
}

function handleDuplicateKeyError(error) {
  if (error && error.code === 11000) {
    return { success: false, error: 'A judge with this email address already exists for this event.' };
  }
  return null;
}
exports.createJudge = async (req, res) => {
  try {
    const { eventId } = req.params;
    const check = await ensureEventExists(eventId);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
    }
    if (!check.exists) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    const { errors, normalized } = validateJudgePayload(req.body || {});
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        error: 'The judge did not pass validation.',
        details: errors,
      });
    }

    const teamsCheck = await ensureTeamsBelongToEvent(eventId, normalized.assignedTeamIds);
    if (!teamsCheck.ok) {
      return res.status(400).json({ success: false, error: teamsCheck.error });
    }

    const judge = await Judge.create({ ...normalized, eventId });
    return res.status(201).json({ success: true, data: toJudgeResponse(judge) });
  } catch (error) {
    console.error('Failed to create judge:', error);
    const duplicate = handleDuplicateKeyError(error);
    if (duplicate) return res.status(409).json(duplicate);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: 'Failed to create the judge.' });
  }
};

exports.addJudgeTeam = async (req, res) => {
  try {
    const { judgeId, teamId } = req.params;
    if (!isValidObjectId(judgeId)) return res.status(400).json({ success: false, error: 'A valid judgeId is required.' });
    if (!isValidObjectId(teamId)) return res.status(400).json({ success: false, error: 'A valid teamId is required.' });
    const judge = await Judge.findById(judgeId).select('eventId').lean();
    if (!judge) return res.status(404).json({ success: false, error: 'Judge not found.' });
    const team = await Team.findOne({ _id: teamId, eventId: judge.eventId }).select('_id').lean();
    if (!team) return res.status(400).json({ success: false, error: 'The team does not belong to this judge\'s event.' });
    const updated = await Judge.findByIdAndUpdate(judgeId, { $addToSet: { assignedTeamIds: teamId }, $set: { status: 'Active' } }, { new: true, runValidators: true }).lean();
    return res.status(200).json({ success: true, data: toJudgeResponse(updated) });
  } catch (error) {
    console.error('Failed to assign team:', error);
    return res.status(500).json({ success: false, error: 'Failed to assign the team.' });
  }
};

exports.removeJudgeTeam = async (req, res) => {
  try {
    const { judgeId, teamId } = req.params;
    if (!isValidObjectId(judgeId)) return res.status(400).json({ success: false, error: 'A valid judgeId is required.' });
    if (!isValidObjectId(teamId)) return res.status(400).json({ success: false, error: 'A valid teamId is required.' });
    const judge = await Judge.findByIdAndUpdate(judgeId, { $pull: { assignedTeamIds: teamId } }, { new: true }).lean();
    if (!judge) return res.status(404).json({ success: false, error: 'Judge not found.' });
    return res.status(200).json({ success: true, data: toJudgeResponse(judge) });
  } catch (error) {
    console.error('Failed to remove team assignment:', error);
    return res.status(500).json({ success: false, error: 'Failed to remove the team assignment.' });
  }
};

exports.listJudgesByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const check = await ensureEventExists(eventId);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
    }
    if (!check.exists) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    const judges = await Judge.find({ eventId }).sort({ createdAt: 1 }).lean();
    return res.status(200).json({ success: true, data: judges.map(toJudgeResponse) });
  } catch (error) {
    console.error('Failed to list judges:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve judges.' });
  }
};
exports.getJudge = async (req, res) => {
  try {
    const { judgeId } = req.params;
    if (!isValidObjectId(judgeId)) {
      return res.status(400).json({ success: false, error: 'A valid judgeId is required.' });
    }
    const judge = await Judge.findById(judgeId).lean();
    if (!judge) {
      return res.status(404).json({ success: false, error: 'Judge not found.' });
    }
    return res.status(200).json({ success: true, data: toJudgeResponse(judge) });
  } catch (error) {
    console.error('Failed to get judge:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve the judge.' });
  }
};

exports.updateJudge = async (req, res) => {
  try {
    const { judgeId } = req.params;
    if (!isValidObjectId(judgeId)) {
      return res.status(400).json({ success: false, error: 'A valid judgeId is required.' });
    }

    const existing = await Judge.findById(judgeId).select('eventId name email assignedTeamIds').lean();
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Judge not found.' });
    }

    const payload = req.body || {};
    const merged = {
      name: typeof payload.name === 'string' ? payload.name : existing.name,
      email: typeof payload.email === 'string' ? payload.email : existing.email,
      assignedTeamIds: Array.isArray(payload.assignedTeamIds)
        ? payload.assignedTeamIds
        : (Array.isArray(payload.teamIds) ? payload.teamIds : existing.assignedTeamIds),
      status: typeof payload.status === 'string' ? payload.status : undefined,
    };
    const { errors, normalized } = validateJudgePayload(merged);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        error: 'The judge did not pass validation.',
        details: errors,
      });
    }

    const teamsCheck = await ensureTeamsBelongToEvent(existing.eventId, normalized.assignedTeamIds);
    if (!teamsCheck.ok) {
      return res.status(400).json({ success: false, error: teamsCheck.error });
    }

    const update = {
      name: normalized.name,
      email: normalized.email,
      status: normalized.status,
    };
    if (Array.isArray(payload.assignedTeamIds) || Array.isArray(payload.teamIds)) {
      update.assignedTeamIds = normalized.assignedTeamIds;
    }
    const judge = await Judge.findByIdAndUpdate(judgeId, update, {
      new: true,
      runValidators: true,
    }).lean();
    return res.status(200).json({ success: true, data: toJudgeResponse(judge) });
  } catch (error) {
    console.error('Failed to update judge:', error);
    const duplicate = handleDuplicateKeyError(error);
    if (duplicate) return res.status(409).json(duplicate);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: 'Failed to update the judge.' });
  }
};

exports.deleteJudge = async (req, res) => {
  try {
    const { judgeId } = req.params;
    if (!isValidObjectId(judgeId)) {
      return res.status(400).json({ success: false, error: 'A valid judgeId is required.' });
    }
    const judge = await Judge.findByIdAndDelete(judgeId).lean();
    if (!judge) {
      return res.status(404).json({ success: false, error: 'Judge not found.' });
    }
    await Team.updateMany(
      { eventId: judge.eventId },
      { $pull: { judges: { $in: [String(judge._id), judge.name] } } },
    );
    return res.status(200).json({ success: true, data: toJudgeResponse(judge) });
  } catch (error) {
    console.error('Failed to delete judge:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete the judge.' });
  }
};
