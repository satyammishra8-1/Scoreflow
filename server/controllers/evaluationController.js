const mongoose = require('mongoose');
const EvaluationConfiguration = require('../models/EvaluationConfiguration');
const Event = require('../models/Event');
const {
  MODEL_FIELDS,
  validateModelConfig,
  normalizeCriteriaArray,
  normalizeMaterialsArray,
  normalizeCustomFieldsArray,
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
