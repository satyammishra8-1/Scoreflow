const EvaluationConfiguration = require('../models/EvaluationConfiguration');
const {
  MODEL_FIELDS,
  validateModelConfig,
} = require('../validators/evaluationValidation');

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
