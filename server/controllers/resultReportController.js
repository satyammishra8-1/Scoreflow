const mongoose = require('mongoose');
const Event = require('../models/Event');
const Team = require('../models/Team');
const Judge = require('../models/Judge');
const Evaluation = require('../models/Evaluation');
const EvaluationConfiguration = require('../models/EvaluationConfiguration');
const ResultReport = require('../models/ResultReport');
const { validReport, reportIsQualitative, hasNumericEvaluationContent } = require('../services/resultReportContent');

const PROMPT_VERSION = 'result-report-v1';
const EVALUATION_TYPES = new Set(['criteria-based', 'open-holistic', 'remote-async', 'live-demo', 'ranking-voting', 'custom']);
function safeQualitativeText(value) {
  if (typeof value !== 'string') return '';
  return value.split(/(?<=[.!?])\s+/u)
    .filter((sentence) => !hasNumericEvaluationContent(sentence))
    .join(' ').trim().slice(0, 4000);
}

function textAnswersOf(evaluation) {
  const source = evaluation.textAnswers instanceof Map ? Object.fromEntries(evaluation.textAnswers) : evaluation.textAnswers;
  return source && typeof source === 'object' ? source : {};
}

function buildReportEvidence({ event, team, config, judgeRows }) {
  config ||= {};
  const evaluationType = EVALUATION_TYPES.has(config?.model) ? config.model : 'custom';
  const evaluationAreas = [];
  const projectMaterials = [];
  if (evaluationType === 'criteria-based') {
    (config.criteriaBased?.criteria || []).forEach(({ name }) => evaluationAreas.push(safeQualitativeText(name)));
  } else if (evaluationType === 'open-holistic') {
    if (config.openHolistic?.projectReview !== false) evaluationAreas.push('Project review');
    if (config.openHolistic?.githubReview !== false && team.githubUrl) projectMaterials.push('GitHub project material submitted');
    evaluationAreas.push('Overall qualitative feedback');
  } else if (evaluationType === 'remote-async') {
    (config.remoteAsync?.materials || []).forEach(({ label }) => {
      if (label) projectMaterials.push(safeQualitativeText(label));
    });
    if (team.githubUrl) projectMaterials.push('GitHub project material submitted');
    if (team.demoUrl) projectMaterials.push('Demo material submitted');
    evaluationAreas.push('Remote project and documentation review');
  } else if (evaluationType === 'live-demo') {
    if (config.liveDemo?.demoEvaluation !== false) evaluationAreas.push('Live demonstration');
    if (config.liveDemo?.presentationEvaluation !== false) evaluationAreas.push('Presentation');
    if (config.liveDemo?.judgeQuestions !== false) evaluationAreas.push('Responses to judge questions');
    (config.liveDemo?.criteria || []).forEach(({ name }) => evaluationAreas.push(safeQualitativeText(name)));
  } else if (evaluationType === 'ranking-voting') {
    evaluationAreas.push('Qualitative judge observations');
  } else {
    (config.custom?.fields || []).forEach(({ type, label }, index) => {
      if (label && type) evaluationAreas.push(safeQualitativeText(label) || 'Custom evaluation area');
    });
  }

  return {
    eventName: String(event.name || '').trim().slice(0, 200),
    eventType: String(event.type || '').trim().slice(0, 100),
    teamName: String(team.teamName || '').trim().slice(0, 200),
    evaluationType,
    projectDescription: safeQualitativeText(team.project),
    projectMaterials: [...new Set(projectMaterials.filter(Boolean))],
    evaluationAreas: [...new Set(evaluationAreas.filter(Boolean))],
    evaluations: judgeRows.map(({ evaluation }) => {
      const answers = textAnswersOf(evaluation);
      const flags = evaluation?.flags instanceof Map ? Object.fromEntries(evaluation.flags) : evaluation?.flags || {};
      const observations = [];
      if (evaluationType === 'custom') {
        (config.custom?.fields || []).forEach(({ type, label }, index) => {
          if (['question', 'feedback'].includes(type)) {
            const response = safeQualitativeText(answers[`field-${index}`]);
            if (response) observations.push({ area: safeQualitativeText(label) || 'Custom evaluation', response });
          } else if (type === 'material' && typeof flags[`field-${index}`] === 'boolean') {
            observations.push({ area: safeQualitativeText(label) || 'Custom project material', response: flags[`field-${index}`] ? 'Reviewed' : 'Not reviewed' });
          }
        });
      } else {
        Object.entries(answers).forEach(([area, response]) => {
          const text = safeQualitativeText(response);
          if (text) observations.push({ area: safeQualitativeText(area), response: text });
        });
      }
      if (evaluationType === 'open-holistic') {
        if (typeof flags.githubReviewed === 'boolean') observations.push({ area: 'GitHub review', response: flags.githubReviewed ? 'Reviewed' : 'Not reviewed' });
        if (typeof flags.projectReviewed === 'boolean') observations.push({ area: 'Project review', response: flags.projectReviewed ? 'Reviewed' : 'Not reviewed' });
      }
      if (evaluationType === 'remote-async') {
        (config.remoteAsync?.materials || []).forEach(({ label }, index) => {
          if (typeof flags[`material-${index}`] === 'boolean') observations.push({
            area: safeQualitativeText(label) || 'Submitted project material',
            response: flags[`material-${index}`] ? 'Reviewed' : 'Not reviewed',
          });
        });
      }
      return {
        feedback: safeQualitativeText(evaluation?.feedback),
        observations,
      };
    }),
  };
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
      flags: evaluation.flags instanceof Map ? Object.fromEntries(evaluation.flags) : evaluation.flags,
    }));
    const { buildEventResults } = await import('../../shared/resultsUtils.mjs');
    const result = buildEventResults({ eventId, teams: [team], judges, evaluations, config });
    const teamResult = result.teams[0];
    if (!teamResult || teamResult.status !== 'Completed' || teamResult.assignedCount < 1
        || teamResult.submittedCount !== teamResult.assignedCount) {
      return { error: 'A report requires completed evaluations from every assigned judge.', status: 409 };
    }

    return {
      event,
      team,
      verifiedResult: buildReportEvidence({ event, team, config, judgeRows: teamResult.judgeRows }),
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
      if (!validReport(payload?.report) || !reportIsQualitative(payload.report) || typeof payload.model !== 'string' || !payload.model.trim()) {
        return res.status(502).json({ success: false, error: 'AI report service returned an invalid report structure.', code: 'AI_INVALID_RESPONSE' });
      }

      const saved = await ReportModel.findOneAndUpdate(
        { event: loaded.event._id, team: loaded.team._id },
        { $set: { report: payload.report, model: payload.model, promptVersion: payload.promptVersion || PROMPT_VERSION, generatedAt: new Date() } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
      return res.status(200).json({ success: true, data: toReportResponse(saved) });
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
module.exports = { ...controller, createResultReportController, validReport, reportIsQualitative, buildReportEvidence, safeQualitativeText };
