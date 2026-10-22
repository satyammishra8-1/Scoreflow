const mongoose = require('mongoose');
const { createHash } = require('node:crypto');
const Event = require('../models/Event');
const Team = require('../models/Team');
const Judge = require('../models/Judge');
const Evaluation = require('../models/Evaluation');
const EvaluationConfiguration = require('../models/EvaluationConfiguration');
const ResultReport = require('../models/ResultReport');
const ResultReportDelivery = require('../models/ResultReportDelivery');
const { sendResultReportEmail } = require('../services/emailService');
const { reportIsQualitative } = require('../services/resultReportContent');
const { buildReportEvidence, evidenceFingerprint } = require('./resultReportController');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BULK_TEAMS = 100;
const SENDING_LOCK_MAX_AGE_MS = 15 * 60 * 1000;

function validId(value) { return mongoose.Types.ObjectId.isValid(value); }
function requestIdValid(value) { return typeof value === 'string' && /^[a-zA-Z0-9._:-]{8,100}$/.test(value); }
function emailOf(value) {
  const email = String(value || '').trim();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : '';
}
function idString(value) { return String(value?._id || value || ''); }
function deliveryData(value) {
  const delivery = typeof value?.toObject === 'function' ? value.toObject() : value;
  if (!delivery) return null;
  return {
    deliveryId: idString(delivery._id),
    eventId: idString(delivery.event),
    teamId: idString(delivery.team),
    reportId: idString(delivery.report),
    requestId: delivery.requestId,
    status: delivery.status,
    members: (delivery.members || []).map((member) => ({
      memberIndex: member.memberIndex,
      memberName: member.memberName || 'Team member',
      status: member.status,
      reason: member.reason || '',
    })),
    createdAt: delivery.createdAt,
    completedAt: delivery.completedAt,
  };
}

function createResultReportEmailController({
  EventModel = Event,
  TeamModel = Team,
  JudgeModel = Judge,
  EvaluationModel = Evaluation,
  ConfigModel = EvaluationConfiguration,
  ReportModel = ResultReport,
  DeliveryModel = ResultReportDelivery,
  sendEmail = sendResultReportEmail,
  isValidId = validId,
} = {}) {
  async function getEligibility(eventId, teamId) {
    if (!isValidId(eventId) || !isValidId(teamId)) return { error: 'A valid eventId and teamId are required.', status: 400 };
    const event = await EventModel.findById(eventId).lean();
    if (!event) return { error: 'Event not found.', status: 404 };
    const team = await TeamModel.findOne({ _id: teamId, eventId }).lean();
    if (!team) return { error: 'Team not found for this event.', status: 404 };
    const [judges, evaluationRows, config] = await Promise.all([
      JudgeModel.find({ eventId }).lean(),
      EvaluationModel.find({ eventId, teamId }).lean(),
      ConfigModel.findOne({ eventId: String(eventId) }).lean(),
    ]);
    const evaluations = evaluationRows.map((evaluation) => ({
      ...evaluation,
      scores: evaluation.scores instanceof Map ? Object.fromEntries(evaluation.scores) : evaluation.scores,
      textAnswers: evaluation.textAnswers instanceof Map ? Object.fromEntries(evaluation.textAnswers) : evaluation.textAnswers,
      flags: evaluation.flags instanceof Map ? Object.fromEntries(evaluation.flags) : evaluation.flags,
    }));
    const teamKey = String(team._id);
    const assigned = judges.filter((judge) => Array.isArray(judge.assignedTeamIds)
      && judge.assignedTeamIds.map(String).includes(teamKey));
    const completed = assigned.length > 0 && assigned.every((judge) => evaluations.some((evaluation) =>
      String(evaluation.eventId) === String(eventId)
      && String(evaluation.teamId) === teamKey
      && String(evaluation.judgeId) === String(judge._id)
      && evaluation.status === 'COMPLETED'));
    if (!completed) return { error: 'A result report can only be sent after all assigned judges complete their evaluations.', status: 409 };

    const report = await ReportModel.findOne({ event: event._id, team: team._id }).lean();
    if (!report) return { error: 'Generate and save this team’s result report before sending it.', status: 404 };
    if (!reportIsQualitative(report.report)) return { error: 'This saved report is invalid and cannot be emailed. Regenerate it first.', status: 409 };
    if (!report.evidenceHash) return { error: 'This saved report is stale. Regenerate it before sending.', status: 409 };
    const { buildEventResults } = await import('../../shared/resultsUtils.mjs');
    const result = buildEventResults({ eventId, teams: [team], judges, evaluations, config });
    const teamResult = result.teams[0];
    if (!teamResult || teamResult.status !== 'Completed' || teamResult.assignedCount < 1
        || teamResult.submittedCount !== teamResult.assignedCount) {
      return { error: 'A result report can only be sent after all assigned judges complete their evaluations.', status: 409 };
    }
    const currentEvidence = teamResult && buildReportEvidence({ event, team, config, judgeRows: teamResult.judgeRows });
    if (!currentEvidence || report.evidenceHash !== evidenceFingerprint(currentEvidence)) {
      return { error: 'This saved report is stale. Regenerate it before sending.', status: 409 };
    }
    return { event, team, report };
  }

  async function priorRequest(eventId, teamId, requestId) {
    const previous = await DeliveryModel.findOne({ event: eventId, team: teamId, requestId }).lean();
    if (previous) return { success: true, data: deliveryData(previous), replayed: true };
    return null;
  }

  async function activeRequest(eventId, teamId) {
    return DeliveryModel.findOne({ event: eventId, team: teamId, status: 'Sending' }).lean();
  }

  async function sendOne(eventId, teamId, requestId) {
    const loaded = await getEligibility(eventId, teamId);
    if (loaded.error) return { teamId: String(teamId), success: false, status: 'Failed', error: loaded.error };

    let delivery;
    const active = await activeRequest(loaded.event._id, loaded.team._id);
    if (active) {
      const age = Date.now() - new Date(active.createdAt || 0).getTime();
      if (Number.isFinite(age) && age >= SENDING_LOCK_MAX_AGE_MS) {
        await DeliveryModel.findOneAndUpdate(
          { _id: active._id, status: 'Sending' },
          { $set: { status: 'Failed', completedAt: new Date(), members: active.members || [] } },
          { new: true, runValidators: true },
        ).lean();
      } else {
        return { success: true, teamId: String(teamId), status: 'Sending', data: deliveryData(active), replayed: true };
      }
    }
    try {
      delivery = await DeliveryModel.create({
        event: loaded.event._id,
        team: loaded.team._id,
        report: loaded.report._id,
        requestId,
        status: 'Sending',
        members: [],
      });
    } catch (error) {
      if (error?.code === 11000) {
        const replay = await priorRequest(loaded.event._id, loaded.team._id, requestId);
        if (replay) return { ...replay, teamId: String(teamId), status: replay.data.status };
        const inProgress = await activeRequest(loaded.event._id, loaded.team._id);
        if (inProgress) return { success: true, teamId: String(teamId), status: 'Sending', data: deliveryData(inProgress), replayed: true };
      }
      throw error;
    }

    const members = Array.isArray(loaded.team.members) ? loaded.team.members : [];
    const results = [];
    for (const [memberIndex, member] of members.entries()) {
      const memberName = String(member?.name || 'Team member').trim().slice(0, 200) || 'Team member';
      const email = emailOf(member?.email);
      if (!email) {
        results.push({ memberIndex, memberName, status: 'Failed', reason: 'This team member does not have a valid email address.' });
        continue;
      }
      try {
        const outcome = await sendEmail({
          recipientEmail: email,
          recipientName: memberName,
          teamName: loaded.team.teamName,
          eventName: loaded.event.name,
          report: loaded.report.report,
        });
        results.push(outcome?.sent
          ? { memberIndex, memberName, status: 'Sent', reason: '' }
          : { memberIndex, memberName, status: 'Failed', reason: outcome?.message || 'Email delivery failed. Please try again.' });
      } catch {
        results.push({ memberIndex, memberName, status: 'Failed', reason: 'The email service is temporarily unavailable.' });
      }
    }
    if (members.length === 0) {
      results.push({ memberIndex: 0, memberName: 'Team member', status: 'Failed', reason: 'No team members are registered for this team.' });
    }

    const sentCount = results.filter((member) => member.status === 'Sent').length;
    const status = sentCount === 0 ? 'Failed' : sentCount === results.length ? 'Sent' : 'Partially Sent';
    const completedAt = new Date();
    const saved = await DeliveryModel.findOneAndUpdate(
      { _id: delivery._id },
      { $set: { status, members: results, completedAt } },
      { new: true, runValidators: true },
    ).lean();
    return { success: true, teamId: String(teamId), status, data: deliveryData(saved || { ...delivery, status, members: results, completedAt }) };
  }

  async function sendReport(req, res) {
    try {
      const { eventId, teamId } = req.params;
      const { requestId } = req.body || {};
      if (!isValidId(eventId) || !isValidId(teamId)) return res.status(400).json({ success: false, error: 'A valid eventId and teamId are required.' });
      if (!requestIdValid(requestId)) return res.status(400).json({ success: false, error: 'A unique requestId is required for safe email delivery.' });
      const result = await sendOne(eventId, teamId, requestId);
      if (!result.success) return res.status(loadedErrorStatus(result.error)).json(result);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Failed to send result report email:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to process this report delivery. Please try again.' });
    }
  }

  async function sendReportsBulk(req, res) {
    try {
      const { eventId } = req.params;
      const { teamIds, requestId } = req.body || {};
      if (!isValidId(eventId)) return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
      if (!requestIdValid(requestId)) return res.status(400).json({ success: false, error: 'A unique requestId is required for safe email delivery.' });
      if (!Array.isArray(teamIds) || teamIds.length === 0 || teamIds.length > MAX_BULK_TEAMS) {
        return res.status(400).json({ success: false, error: `Select between one and ${MAX_BULK_TEAMS} teams.` });
      }
      const event = await EventModel.findById(eventId).select('_id').lean();
      if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });
      const selected = [...new Set(teamIds.map(String))];
      const results = [];
      for (const teamId of selected) {
        if (!isValidId(teamId)) {
          results.push({ teamId, success: false, status: 'Failed', error: 'Invalid team selection.' });
          continue;
        }
        try {
          const teamRequestId = createHash('sha256').update(`${requestId}:${teamId}`).digest('hex');
          const result = await sendOne(eventId, teamId, teamRequestId);
          results.push(result.success ? result : { ...result, error: result.error || 'Report delivery failed.' });
        } catch (error) {
          console.error('Failed to send a selected team result report:', error.message);
          results.push({ teamId, success: false, status: 'Failed', error: 'This team’s report could not be sent. Other teams were processed.' });
        }
      }
      return res.status(200).json({ success: true, data: results });
    } catch (error) {
      console.error('Failed to process result report email selection:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to process the selected report deliveries.' });
    }
  }

  async function listDeliveryStatusByEvent(req, res) {
    try {
      const { eventId } = req.params;
      if (!isValidId(eventId)) return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
      const event = await EventModel.findById(eventId).select('_id').lean();
      if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });
      const records = await DeliveryModel.find({ event: event._id }).sort({ createdAt: -1, _id: -1 }).lean();
      const latest = new Map();
      records.forEach((record) => { if (!latest.has(String(record.team))) latest.set(String(record.team), deliveryData(record)); });
      return res.status(200).json({ success: true, data: Object.fromEntries(latest) });
    } catch (error) {
      console.error('Failed to retrieve result report delivery status:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to retrieve report delivery status.' });
    }
  }

  return { sendReport, sendReportsBulk, listDeliveryStatusByEvent };
}

function loadedErrorStatus(error) {
  if (/not found|belongs to this event|report before sending/i.test(error || '')) return 404;
  if (/complete their evaluations|invalid and cannot be emailed|report is stale/i.test(error || '')) return 409;
  return 422;
}

const controller = createResultReportEmailController();
module.exports = { ...controller, createResultReportEmailController, emailOf, requestIdValid, deliveryData };
