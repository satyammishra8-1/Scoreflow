const mongoose = require('mongoose');
const EvaluationConfiguration = require('../models/EvaluationConfiguration');
const Event = require('../models/Event');
const Evaluation = require('../models/Evaluation');
const {
  MODEL_FIELDS,
  validateModelConfig,
  normalizeCriteriaArray,
  normalizeMaterialsArray,
  normalizeCustomFieldsArray,
  validateEvaluationSubmission,
} = require('../validators/evaluationValidation');

/**
 * Builds the model-specific configuration payload for a given evaluation model.
 */
function buildConfigurationPayload(model, payload) {
  const payloadPresence = {
    criteriaBased: null,
    remoteAsync: null,
    liveDemo: null,
    custom: null,
    rankingVoting: null,
  };

  switch (model) {
    case 'criteria-based': {
      payloadPresence.criteriaBased = {
        criteria: normalizeCriteriaArray(payload.criteriaBased?.criteria),
      };
      break;
    }
    case 'open-holistic': {
      payloadPresence.openHolistic = {
        scoreMin: Number(payload.openHolistic?.scoreMin) || 0,
        scoreMax: Number(payload.openHolistic?.scoreMax) || 100,
        githubReview: Boolean(payload.openHolistic?.githubReview),
        projectReview: Boolean(payload.openHolistic?.projectReview),
        overallFeedback: Boolean(payload.openHolistic?.overallFeedback),
      };
      break;
    }
    case 'remote-async': {
      payloadPresence.remoteAsync = {
        materials: normalizeMaterialsArray(payload.remoteAsync?.materials),
      };
      break;
    }
    case 'live-demo': {
      payloadPresence.liveDemo = {
        demoEvaluation: Boolean(payload.liveDemo?.demoEvaluation),
        presentationEvaluation: Boolean(payload.liveDemo?.presentationEvaluation),
        judgeQuestions: Boolean(payload.liveDemo?.judgeQuestions),
        overallScoreFeedback: Boolean(payload.liveDemo?.overallScoreFeedback),
        criteria: normalizeCriteriaArray(payload.liveDemo?.criteria),
      };
      break;
    }
    case 'ranking-voting': {
      payloadPresence.rankingVoting = {
        ranking: Boolean(payload.rankingVoting?.ranking),
        comments: Boolean(payload.rankingVoting?.comments),
        rankCalculation: String(payload.rankingVoting?.rankCalculation || 'total'),
      };
      break;
    }
    case 'custom': {
      payloadPresence.custom = {
        fields: normalizeCustomFieldsArray(payload.custom?.fields),
      };
      break;
    }
  }

  return payloadPresence;
}

exports.getEvaluationConfiguration = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!eventId || typeof eventId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'A valid eventId is required.',
      });
    }

    const configuration = await EvaluationConfiguration.findOne({ eventId }).lean();

    if (!configuration) {
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      data: configuration,
    });
  } catch (error) {
    console.error('Failed to get evaluation configuration:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve the evaluation configuration.',
    });
  }
};

exports.createOrUpdateEvaluationConfiguration = async (req, res) => {
  try {
    const { eventId } = req.params;
    const payload = req.body || {};

    if (!eventId || typeof eventId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'A valid eventId is required.',
      });
    }

    const model = String(payload.model || '').trim().toLowerCase();
    if (!MODEL_FIELDS[model]) {
      return res.status(400).json({
        success: false,
        error: 'Please choose one of the six available evaluation models.',
      });
    }

    const { errors, criteriaBased, remoteAsync, liveDemo, custom } = validateModelConfig(model, payload);

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        error: 'The evaluation configuration did not pass validation.',
        details: errors,
      });
    }

    const normalized = {
      eventId,
      model,
      updatedAt: new Date(),
      ...buildConfigurationPayload(model, payload),
    };

    switch (model) {
      case 'criteria-based':
        normalized.criteriaBased = {
          criteria: criteriaBased,
        };
        break;
      case 'open-holistic':
        normalized.openHolistic = {
          scoreMin: Number(payload.openHolistic?.scoreMin) || 0,
          scoreMax: Number(payload.openHolistic?.scoreMax) || 100,
          githubReview: Boolean(payload.openHolistic?.githubReview),
          projectReview: Boolean(payload.openHolistic?.projectReview),
          overallFeedback: Boolean(payload.openHolistic?.overallFeedback),
        };
        break;
      case 'remote-async':
        normalized.remoteAsync = {
          materials: remoteAsync,
        };
        break;
      case 'live-demo':
        normalized.liveDemo = {
          demoEvaluation: Boolean(payload.liveDemo?.demoEvaluation),
          presentationEvaluation: Boolean(payload.liveDemo?.presentationEvaluation),
          judgeQuestions: Boolean(payload.liveDemo?.judgeQuestions),
          overallScoreFeedback: Boolean(payload.liveDemo?.overallScoreFeedback),
          criteria: liveDemo,
        };
        break;
      case 'ranking-voting':
        normalized.rankingVoting = {
          ranking: Boolean(payload.rankingVoting?.ranking),
          comments: Boolean(payload.rankingVoting?.comments),
          rankCalculation: String(payload.rankingVoting?.rankCalculation || 'total'),
        };
        break;
      case 'custom':
        normalized.custom = {
          fields: custom,
        };
        break;
    }

    const configuration = await EvaluationConfiguration.findOneAndUpdate(
      { eventId },
      normalized,
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.status(200).json({
      success: true,
      data: configuration,
    });
  } catch (error) {
    console.error('Failed to save evaluation configuration:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to save the evaluation configuration.',
    });
  }
};

/**
 * GET /events/:eventId/evaluation-config
 * Returns the per-event evaluation configuration for the given event.
 * - 400: eventId missing, empty, or not a string.
 * - 404: eventId is a valid ObjectId but no such event exists.
 * - 200: configuration (or null when none exists yet).
 */
exports.getEvaluationConfigByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'A valid eventId is required.',
      });
    }

    const normalizedEventId = eventId.trim();

    // 404: a valid ObjectId that does not exist in the events collection
    if (mongoose.Types.ObjectId.isValid(normalizedEventId)) {
      const event = await Event.findById(normalizedEventId).lean();
      if (!event) {
        return res.status(404).json({
          success: false,
          error: 'Event not found.',
        });
      }
    }

    const configuration = await EvaluationConfiguration.findOne({
      eventId: normalizedEventId,
    }).lean();

    return res.status(200).json({
      success: true,
      data: configuration,
    });
  } catch (error) {
    console.error('Failed to get evaluation configuration:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve the evaluation configuration.',
    });
  }
};

/**
 * PUT /events/:eventId/evaluation-config
 * Create (or update) the per-event evaluation configuration.
 * - 400: invalid eventId, model, or configuration totals.
 * - 404: event not found.
 * - 409: duplicate configuration (race on unique index).
 * - 200: configuration created or updated.
 */
exports.createEvaluationConfig = async (req, res) => {
  try {
    const { eventId } = req.params;
    const payload = req.body || {};

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'A valid eventId is required.',
      });
    }

    const normalizedEventId = eventId.trim();

    // 404: a valid ObjectId that does not exist in the events collection
    if (mongoose.Types.ObjectId.isValid(normalizedEventId)) {
      const event = await Event.findById(normalizedEventId).lean();
      if (!event) {
        return res.status(404).json({
          success: false,
          error: 'Event not found.',
        });
      }
    }

    const model = String(payload.model || '').trim().toLowerCase();
    if (!MODEL_FIELDS[model]) {
      return res.status(400).json({
        success: false,
        error: 'Please choose one of the six available evaluation models.',
      });
    }

    const { errors } = validateModelConfig(model, payload);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        error: 'The evaluation configuration did not pass validation.',
        details: errors,
      });
    }

    const normalized = {
      eventId: normalizedEventId,
      model,
      updatedAt: new Date(),
      ...buildConfigurationPayload(model, payload),
    };

    const configuration = await EvaluationConfiguration.findOneAndUpdate(
      { eventId: normalizedEventId },
      normalized,
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.status(200).json({
      success: true,
      data: configuration,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Evaluation configuration already exists for this event.',
      });
    }
    console.error('Failed to save evaluation configuration:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to save the evaluation configuration.',
    });
  }
};

/**
 * PUT /events/:eventId/evaluation-config (strict update)
 * Updates an existing configuration. Returns 404 when the configuration
 * does not exist yet (use createEvaluationConfig to create one).
 * - 400: invalid eventId, model, or configuration totals.
 * - 404: event or configuration not found.
 * - 200: configuration updated.
 */
exports.updateEvaluationConfig = async (req, res) => {
  try {
    const { eventId } = req.params;
    const payload = req.body || {};

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'A valid eventId is required.',
      });
    }

    const normalizedEventId = eventId.trim();

    // 404: a valid ObjectId that does not exist in the events collection
    if (mongoose.Types.ObjectId.isValid(normalizedEventId)) {
      const event = await Event.findById(normalizedEventId).lean();
      if (!event) {
        return res.status(404).json({
          success: false,
          error: 'Event not found.',
        });
      }
    }

    const configuration = await EvaluationConfiguration.findOne({
      eventId: normalizedEventId,
    }).lean();

    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'Evaluation configuration not found for this event.',
      });
    }

    const model = String(payload.model || '').trim().toLowerCase();
    if (!MODEL_FIELDS[model]) {
      return res.status(400).json({
        success: false,
        error: 'Please choose one of the six available evaluation models.',
      });
    }

    const { errors } = validateModelConfig(model, payload);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        error: 'The evaluation configuration did not pass validation.',
        details: errors,
      });
    }

    const normalized = {
      eventId: normalizedEventId,
      model,
      updatedAt: new Date(),
      ...buildConfigurationPayload(model, payload),
    };

    const updated = await EvaluationConfiguration.findOneAndUpdate(
      { eventId: normalizedEventId },
      normalized,
      { new: true },
    );

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Evaluation configuration already exists for this event.',
      });
    }
    console.error('Failed to update evaluation configuration:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update the evaluation configuration.',
    });
  }
};

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function toPlainObject(value) {
  if (value instanceof Map) return Object.fromEntries(value);
  return value || {};
}

function toEvaluationResponse(evaluation) {
  if (!evaluation) return null;
  const obj = typeof evaluation.toObject === 'function' ? evaluation.toObject() : evaluation;
  const dateToTimestamp = (value) =>
    value != null ? new Date(value).getTime() : null;
  return {
    ...obj,
    id: obj._id != null ? String(obj._id) : undefined,
    eventId: obj.eventId != null ? String(obj.eventId) : obj.eventId,
    judgeId: obj.judgeId != null ? String(obj.judgeId) : obj.judgeId,
    teamId: obj.teamId != null ? String(obj.teamId) : obj.teamId,
    scores: toPlainObject(obj.scores),
    totalScore: Number(obj.totalScore || 0),
    weightedScore: Number(obj.weightedScore || 0),
    feedback: typeof obj.feedback === 'string' ? obj.feedback : '',
    status: obj.status || 'NOT_STARTED',
    attendance: obj.attendance || 'Present',
    startedAt: dateToTimestamp(obj.startedAt),
    completedAt: dateToTimestamp(obj.completedAt),
    duration: Number(obj.duration || 0),
    memberAttendance: toPlainObject(obj.memberAttendance),
    textAnswers: toPlainObject(obj.textAnswers),
    flags: toPlainObject(obj.flags),
    createdAt: obj.createdAt != null ? new Date(obj.createdAt).toISOString() : undefined,
    updatedAt: obj.updatedAt != null ? new Date(obj.updatedAt).toISOString() : undefined,
  };
}

function normalizeEvaluationScores(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized = {};
  for (const key of Object.keys(value)) {
    const numberValue = Number(value[key]);
    normalized[key] = Number.isFinite(numberValue) ? numberValue : 0;
  }
  return normalized;
}

function validateEvaluationPayload(payload = {}) {
  const errors = {};
  const eventId = typeof payload.eventId === 'string' ? payload.eventId.trim() : '';
  const judgeId = typeof payload.judgeId === 'string' ? payload.judgeId.trim() : '';
  const teamId = typeof payload.teamId === 'string' ? payload.teamId.trim() : '';
  const scores = normalizeEvaluationScores(payload.scores);
  const totalScore = Number(payload.totalScore);
  const feedback = typeof payload.feedback === 'string' ? payload.feedback.trim() : '';
  const status = typeof payload.status === 'string' ? payload.status.trim() : 'NOT_STARTED';
  const attendance = typeof payload.attendance === 'string' ? payload.attendance.trim() : 'Present';
  const duration = Number(payload.duration);
  const memberAttendance =
    typeof payload.memberAttendance === 'object' && payload.memberAttendance !== null
      ? payload.memberAttendance
      : {};
  const textAnswers =
    typeof payload.textAnswers === 'object' && payload.textAnswers !== null
      ? payload.textAnswers
      : {};
  const flags =
    typeof payload.flags === 'object' && payload.flags !== null ? payload.flags : {};

  if (!eventId || !isValidObjectId(eventId)) errors.eventId = 'A valid eventId is required.';
  if (!judgeId || !isValidObjectId(judgeId)) errors.judgeId = 'A valid judgeId is required.';
  if (!teamId || !isValidObjectId(teamId)) errors.teamId = 'A valid teamId is required.';
  if (!Number.isFinite(totalScore) || totalScore < 0) {
    errors.totalScore = 'Enter a valid total score.';
  }
  if (!['NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'].includes(status)) {
    errors.status = 'Status must be NOT_STARTED, IN_PROGRESS, PAUSED or COMPLETED.';
  }
  if (!Number.isFinite(duration) || duration < 0) {
    errors.duration = 'Enter a valid duration.';
  }

  return {
    errors,
    normalized: {
      eventId,
      judgeId,
      teamId,
      scores,
      totalScore,
      feedback,
      status,
      attendance,
      duration,
      memberAttendance,
      textAnswers,
      flags,
      startedAt: payload.startedAt != null ? new Date(payload.startedAt) : null,
      completedAt: payload.completedAt != null ? new Date(payload.completedAt) : null,
    },
  };
}



/**
 * GET /api/events/:eventId/evaluations
 */
exports.listEvaluationsByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
    }
    const evaluations = await Evaluation.find({ eventId })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();
    return res.status(200).json({
      success: true,
      data: evaluations.map(toEvaluationResponse),
    });
  } catch (error) {
    console.error('Failed to list evaluations:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve evaluations.' });
  }
};

/**
 * GET /api/events/:eventId/judges/:judgeId/teams/:teamId/evaluation
 */
exports.getEvaluationByJudgeTeam = async (req, res) => {
  try {
    const { eventId, judgeId, teamId } = req.params;
    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
    }
    if (!isValidObjectId(judgeId)) {
      return res.status(400).json({ success: false, error: 'A valid judgeId is required.' });
    }
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ success: false, error: 'A valid teamId is required.' });
    }
    const evaluation = await Evaluation.findOne({ eventId, judgeId, teamId }).lean();
    if (!evaluation) {
      return res.status(404).json({
        success: false,
        error: 'No evaluation found for this judge and team.',
      });
    }
    return res.status(200).json({ success: true, data: toEvaluationResponse(evaluation) });
  } catch (error) {
    console.error('Failed to get the evaluation:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve the evaluation.' });
  }
};


/**
 * POST /api/evaluations
 * Create or update a judge evaluation.
 */
exports.createEvaluation = async (req, res) => {
  try {
    const { errors: schemaErrors, normalized } = validateEvaluationPayload(req.body);

    if (Object.keys(schemaErrors).length > 0) {
      return res.status(400).json({
        success: false,
        error: 'The evaluation payload is invalid.',
        details: schemaErrors,
      });
    }

    const { errors: referentialErrors } = await validateEvaluationSubmission(req.body);

    if (Object.keys(referentialErrors).length > 0) {
      return res.status(400).json({
        success: false,
        error: 'The evaluation could not be validated against the database.',
        details: referentialErrors,
      });
    }

    const evaluation = await Evaluation.findOneAndUpdate(
      {
        eventId: normalized.eventId,
        judgeId: normalized.judgeId,
        teamId: normalized.teamId,
      },
      normalized,
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.status(200).json({
      success: true,
      data: toEvaluationResponse(evaluation),
    });
  } catch (error) {
    console.error('Failed to save evaluation:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to save the evaluation.',
    });
  }
};

/**
 * GET /api/evaluations/:evaluationId
 */
exports.getEvaluation = async (req, res) => {
  try {
    const { evaluationId } = req.params;

    if (!isValidObjectId(evaluationId)) {
      return res.status(400).json({
        success: false,
        error: 'A valid evaluationId is required.',
      });
    }

    const evaluation = await Evaluation.findById(evaluationId).lean();

    if (!evaluation) {
      return res.status(404).json({
        success: false,
        error: 'Evaluation not found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: toEvaluationResponse(evaluation),
    });
  } catch (error) {
    console.error('Failed to get evaluation:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve the evaluation.',
    });
  }
};