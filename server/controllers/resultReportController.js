const mongoose = require('mongoose');
const Event = require('../models/Event');
const Team = require('../models/Team');
const Judge = require('../models/Judge');
const Evaluation = require('../models/Evaluation');
const EvaluationConfiguration = require('../models/EvaluationConfiguration');
const ResultReport = require('../models/ResultReport');

const PROMPT_VERSION = 'result-report-v1';
const REPORT_FIELDS = [
  'summary',
  'strengths',
  'weaknesses',
  'improvementSuggestions',
  'priorityAreas',
  'judgeFeedbackSummary',
  'finalRemarks',
];

function validReport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.join('|') !== [...REPORT_FIELDS].sort().join('|')) return false;
  return REPORT_FIELDS.every((field) => field === 'strengths' || field === 'weaknesses'
    || field === 'improvementSuggestions' || field === 'priorityAreas'
    ? Array.isArray(value[field]) && value[field].length > 0
      && value[field].length <= (field === 'priorityAreas' ? 5 : 8)
      && value[field].every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 1000)
    : typeof value[field] === 'string' && value[field].trim().length > 0 && value[field].length <= 4000);
}

function objectIdValid(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function toReportResponse(document) {
  if (!document) return null;
  const value = typeof document.toObject === 'function' ? document.toObject() : document;
  return {
    ...value,
    reportId: String(value._id),
    eventId: String(value.event?._id || value.event),
    teamId: String(value.team?._id || value.team),
  };
}

function createResultReportController({
  EventModel = Event,
  TeamModel = Team,
  JudgeModel = Judge,
  EvaluationModel = Evaluation,
  ConfigModel = EvaluationConfiguration,
  ReportModel = ResultReport,
  fetchImpl = global.fetch,
  serviceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000',
  isValidId = objectIdValid,
} = {}) {
  async function loadVerifiedTeamResult(eventId, teamId) {
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
    }));
    const { buildEventResults } = await import('../../shared/resultsUtils.mjs');
    const result = buildEventResults({ eventId, teams: [team], judges, evaluations, config });
    const teamResult = result.teams[0];
    if (!teamResult || teamResult.status !== 'Completed' || teamResult.assignedCount < 1
        || teamResult.submittedCount !== teamResult.assignedCount || !Number.isFinite(teamResult.averageWeighted)) {
      return { error: 'A report requires completed evaluations from every assigned judge and a verified final score.', status: 409 };
    }

    const criteria = result.criteria.map((criterion) => {
      const scoreValues = teamResult.judgeRows.map(({ scores }) => scores?.criteria?.find((item) => item.id === criterion.id)?.score);
      const validScores = scoreValues.filter(Number.isFinite);
      return {
        name: criterion.name,
        maximumMarks: criterion.maxMarks,
        weight: criterion.weight,
        judgeScores: validScores,
        averageScore: validScores.length === scoreValues.length
          ? Number((validScores.reduce((sum, value) => sum + value, 0) / validScores.length).toFixed(2))
          : null,
      };
    });
    const evaluationsForPrompt = teamResult.judgeRows.map(({ judge, evaluation, scores }) => ({
      judgeName: judge.name,
      status: evaluation?.status || 'PENDING',
      criteriaScores: scores?.criteria?.map(({ name, score, maxMarks, weight }) => ({ name, score, maximumMarks: maxMarks, weight })) || [],
      feedback: evaluation?.feedback || '',
    }));

    return {
      event,
      team,
      verifiedResult: {
        eventName: event.name,
        eventType: event.type,
        teamName: team.teamName,
        teamNumber: team.teamNumber,
        finalScore: teamResult.averageWeighted,
        scoreMaximum: 100,
        criteria,
        evaluations: evaluationsForPrompt,
        evaluationStatus: teamResult.status,
      },
    };
  }

  async function generateReport(req, res) {
    try {
      const { eventId, teamId } = req.params;
      const loaded = await loadVerifiedTeamResult(eventId, teamId);
      if (loaded.error) return res.status(loaded.status).json({ success: false, error: loaded.error });

      let serviceResponse;
      try {
        serviceResponse = await fetchImpl(`${serviceUrl.replace(/\/$/, '')}/reports/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(loaded.verifiedResult),
          signal: AbortSignal.timeout(120000),
        });
      } catch (error) {
        return res.status(503).json({ success: false, error: 'AI report service is unavailable.', code: 'AI_SERVICE_UNAVAILABLE' });
      }
      if (!serviceResponse.ok) {
        let providerError;
        try {
          const body = await serviceResponse.json();
          const detail = body?.detail;
          if (detail && typeof detail === 'object' && detail.provider === 'gemini'
              && typeof detail.code === 'string' && typeof detail.reason === 'string') {
            providerError = { provider: detail.provider, type: detail.code, reason: detail.reason };
          }
        } catch {
          // Keep the established generic response when the AI service error is not structured.
        }
        if (providerError) {
          return res.status(serviceResponse.status === 503 ? 503 : 502).json({
            success: false,
            error: providerError.reason,
            code: `AI_${providerError.type.toUpperCase()}`,
            provider: providerError.provider,
            providerError,
          });
        }
        const status = serviceResponse.status === 503 ? 503 : 502;
        const detail = serviceResponse.status === 503
          ? 'AI report generation is not configured. Configure the selected AI provider for the AI service.'
          : 'AI report generation failed. Please try again later.';
        return res.status(status).json({ success: false, error: detail, code: serviceResponse.status === 503 ? 'AI_PROVIDER_UNAVAILABLE' : 'AI_PROVIDER_ERROR' });
      }

      let payload;
      try {
        payload = await serviceResponse.json();
      } catch {
        return res.status(502).json({ success: false, error: 'AI report service returned malformed JSON.', code: 'AI_INVALID_RESPONSE' });
      }
      if (!validReport(payload?.report) || typeof payload.model !== 'string' || !payload.model.trim()) {
        return res.status(502).json({ success: false, error: 'AI report service returned an invalid report structure.', code: 'AI_INVALID_RESPONSE' });
      }

      const saved = await ReportModel.findOneAndUpdate(
        { event: loaded.event._id, team: loaded.team._id },
        { $set: { report: payload.report, model: payload.model, promptVersion: payload.promptVersion || PROMPT_VERSION, generatedAt: new Date() } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
      return res.status(200).json({ success: true, data: { ...toReportResponse(saved), finalScore: loaded.verifiedResult.finalScore, scoreMaximum: loaded.verifiedResult.scoreMaximum } });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ success: false, error: 'A report for this team is already being generated. Reload and try again.', code: 'REPORT_GENERATION_CONFLICT' });
      }
      console.error('Failed to generate result report:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to generate the result report.' });
    }
  }

  async function getReport(req, res) {
    try {
      const { eventId, teamId } = req.params;
      if (!isValidId(eventId) || !isValidId(teamId)) return res.status(400).json({ success: false, error: 'A valid eventId and teamId are required.' });
      const event = await EventModel.findById(eventId).select('_id').lean();
      if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });
      const team = await TeamModel.findOne({ _id: teamId, eventId }).select('_id').lean();
      if (!team) return res.status(404).json({ success: false, error: 'Team not found for this event.' });
      const report = await ReportModel.findOne({ event: event._id, team: team._id }).lean();
      if (!report) return res.status(404).json({ success: false, error: 'No result report has been generated for this team.' });
      return res.status(200).json({ success: true, data: toReportResponse(report) });
    } catch (error) {
      console.error('Failed to retrieve result report:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to retrieve the result report.' });
    }
  }

  async function listReports(req, res) {
    try {
      const { eventId } = req.params;
      if (!isValidId(eventId)) return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
      const event = await EventModel.findById(eventId).select('_id').lean();
      if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });
      const reports = await ReportModel.find({ event: event._id }).sort({ updatedAt: -1 }).lean();
      return res.status(200).json({ success: true, data: reports.map(toReportResponse) });
    } catch (error) {
      console.error('Failed to list result reports:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to retrieve result reports.' });
    }
  }

  return { generateReport, getReport, listReports };
}

const controller = createResultReportController();
module.exports = { ...controller, createResultReportController, validReport };
