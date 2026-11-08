const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const OrganizerAccount = require('../models/OrganizerAccount');
const Judge = require('../models/Judge');
const Team = require('../models/Team');
const Evaluation = require('../models/Evaluation');
const Event = require('../models/Event');

function unauthorized(res, message = 'Authentication is required.') {
  return res.status(401).json({ success: false, error: message });
}

async function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(header);
  if (!match || !process.env.JWT_ACCESS_SECRET) return unauthorized(res);
  try {
    const claims = jwt.verify(match[1], process.env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'scoreflow', audience: 'scoreflow-api' });
    if (!['organizer', 'judge'].includes(claims.role) || !mongoose.Types.ObjectId.isValid(claims.sub)
      || (claims.role === 'judge' && claims.sessionType !== 'invitation')) return unauthorized(res);
    const user = claims.role === 'organizer'
      ? await OrganizerAccount.findById(claims.sub).select('email tokenVersion active').lean()
      : await Judge.findById(claims.sub).select('email eventId tokenVersion invitationStatus').lean();
    if (!user || user.active === false
      || (user.invitationStatus && user.invitationStatus !== 'accepted')
      || (user.tokenVersion || 0) !== (claims.ver || 0) || String(user.email).toLowerCase() !== claims.email) return unauthorized(res);
    if (claims.role === 'judge' && String(user.eventId) !== String(claims.eventId)) return unauthorized(res);
    req.auth = { sub: String(claims.sub), role: claims.role, email: claims.email, eventId: claims.eventId, sessionType: claims.sessionType, version: claims.ver || 0 };
    return next();
  } catch {
    return unauthorized(res);
  }
}

async function authenticateOptional(req, _res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(header);
  if (match && process.env.JWT_ACCESS_SECRET) {
    try {
      const claims = jwt.verify(match[1], process.env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'scoreflow', audience: 'scoreflow-api' });
      const UserModel = claims.role === 'organizer' ? OrganizerAccount : claims.role === 'judge' && claims.sessionType === 'invitation' ? Judge : null;
      const user = UserModel && mongoose.Types.ObjectId.isValid(claims.sub)
        ? await UserModel.findById(claims.sub).select('email eventId tokenVersion active invitationStatus').lean() : null;
      if (user && user.active !== false
        && (!user.invitationStatus || user.invitationStatus === 'accepted') && (user.tokenVersion || 0) === (claims.ver || 0)
        && String(user.email).toLowerCase() === claims.email
        && (claims.role !== 'judge' || String(user.eventId) === String(claims.eventId))) {
        req.auth = { sub: String(claims.sub), role: claims.role, email: claims.email, eventId: claims.eventId, sessionType: claims.sessionType, version: claims.ver || 0 };
      }
    } catch { /* Logout must also clear an expired access session using its refresh cookie. */ }
  }
  return next();
}

function requireRole(role) {
  return (req, res, next) => req.auth?.role === role
    ? next()
    : res.status(403).json({ success: false, error: 'You are not authorized to perform this action.' });
}

const requireOrganizer = [authenticate, requireRole('organizer')];

async function requireEventAccess(req, res, next) {
  const eventId = req.params.eventId || req.body?.eventId || req.query.eventId;
  if (req.auth?.role === 'organizer') return requireOwnedEvent(req, res, next, eventId);
  if (!eventId || String(eventId) !== String(req.auth?.eventId)) return res.status(403).json({ success: false, error: 'This event is outside your judge access.' });
  try {
    const judge = await Judge.findOne({ _id: req.auth.sub, eventId, email: req.auth.email, invitationStatus: 'accepted' }).lean();
    if (!judge) return res.status(403).json({ success: false, error: 'This event is outside your judge access.' });
    req.eventJudge = judge;
    return next();
  } catch {
    return res.status(500).json({ success: false, error: 'Unable to verify event access.' });
  }
}

async function requireOwnedEvent(req, res, next, eventId = req.params.eventId || req.body?.eventId || req.query.eventId) {
  if (req.auth?.role !== 'organizer') return res.status(403).json({ success: false, error: 'Organizer access is required.' });
  if (!mongoose.Types.ObjectId.isValid(eventId)) return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
  try {
    const event = await Event.findOne({ _id: eventId, ownerId: req.auth.sub }).select('_id').lean();
    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });
    req.ownedEventId = String(event._id);
    return next();
  } catch {
    return res.status(500).json({ success: false, error: 'Unable to verify event ownership.' });
  }
}

async function requireOwnedResource(req, res, next, Model, id, label) {
  if (req.auth?.role !== 'organizer') return next();
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, error: `A valid ${label} is required.` });
  try {
    const resource = await Model.findById(id).select('eventId').lean();
    if (!resource) return res.status(404).json({ success: false, error: `${label[0].toUpperCase()}${label.slice(1)} not found.` });
    const event = await Event.findOne({ _id: resource.eventId, ownerId: req.auth.sub }).select('_id').lean();
    if (!event) return res.status(404).json({ success: false, error: `${label[0].toUpperCase()}${label.slice(1)} not found.` });
    const requestedEventId = req.params.eventId || req.body?.eventId || req.query.eventId;
    if (requestedEventId && String(requestedEventId) !== String(resource.eventId)) return res.status(404).json({ success: false, error: `${label[0].toUpperCase()}${label.slice(1)} not found.` });
    req.ownedEventId = String(event._id);
    return next();
  } catch {
    return res.status(500).json({ success: false, error: `Unable to verify ${label} ownership.` });
  }
}

function requireOwnedTeam(req, res, next) {
  return requireOwnedResource(req, res, next, Team, req.params.teamId, 'team');
}

function requireOwnedJudge(req, res, next) {
  return requireOwnedResource(req, res, next, Judge, req.params.judgeId, 'judge');
}

function requireOwnedEvaluation(req, res, next) {
  return requireOwnedResource(req, res, next, Evaluation, req.params.evaluationId, 'evaluation');
}

async function requireAssignedTeam(req, res, next) {
  if (req.auth?.role === 'organizer') return requireOwnedTeam(req, res, next);
  try {
    const teamId = req.params.teamId || req.params.teamIdValue || req.params.team;
    const eventId = req.params.eventId || req.auth.eventId;
    const judge = await Judge.findOne({ _id: req.auth.sub, eventId, email: req.auth.email, invitationStatus: 'accepted', assignedTeamIds: teamId }).lean();
    if (req.params.judgeId && String(req.params.judgeId) !== req.auth.sub) return res.status(403).json({ success: false, error: 'This judge account is outside your access.' });
    const team = mongoose.Types.ObjectId.isValid(teamId) ? await Team.findOne({ _id: teamId, eventId }).select('_id').lean() : null;
    if (!judge || !team) return res.status(403).json({ success: false, error: 'This team is not assigned to your judge account.' });
    req.eventJudge = judge;
    return next();
  } catch {
    return res.status(500).json({ success: false, error: 'Unable to verify team access.' });
  }
}

async function authorizeEvaluationSubmission(req, res, next) {
  if (req.auth?.role === 'organizer') return next();
  const { eventId, teamId } = req.body || {};
  if (String(eventId) !== String(req.auth?.eventId) || !mongoose.Types.ObjectId.isValid(teamId)) {
    return res.status(403).json({ success: false, error: 'This evaluation is outside your judge access.' });
  }
  try {
    const judge = await Judge.findOne({ _id: req.auth.sub, eventId, email: req.auth.email, invitationStatus: 'accepted', assignedTeamIds: teamId }).select('_id').lean();
    if (!judge) return res.status(403).json({ success: false, error: 'This team is not assigned to your judge account.' });
    req.body.judgeId = String(judge._id);
    return next();
  } catch {
    return res.status(500).json({ success: false, error: 'Unable to verify evaluation access.' });
  }
}

async function authorizeEvaluationId(req, res, next) {
  if (req.auth?.role === 'organizer') return next();
  try {
    const evaluation = await Evaluation.findById(req.params.evaluationId).select('eventId judgeId teamId').lean();
    if (!evaluation || String(evaluation.eventId) !== String(req.auth.eventId) || String(evaluation.judgeId) !== req.auth.sub) {
      return res.status(403).json({ success: false, error: 'This evaluation is outside your judge access.' });
    }
    const judge = await Judge.findOne({ _id: req.auth.sub, eventId: req.auth.eventId, assignedTeamIds: evaluation.teamId }).select('_id').lean();
    if (!judge) return res.status(403).json({ success: false, error: 'This evaluation is outside your judge access.' });
    return next();
  } catch {
    return res.status(500).json({ success: false, error: 'Unable to verify evaluation access.' });
  }
}

function rateLimit({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > 10000) for (const [oldKey, value] of buckets) if (value.resetAt <= now) buckets.delete(oldKey);
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, error: 'Too many attempts. Try again later.' });
    }
    return next();
  };
}

module.exports = { authenticate, authenticateOptional, requireRole, requireOrganizer, requireEventAccess, requireOwnedEvent, requireOwnedTeam, requireOwnedJudge, requireOwnedEvaluation, requireAssignedTeam, authorizeEvaluationSubmission, authorizeEvaluationId, rateLimit };
