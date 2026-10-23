const express = require('express');
const { createEvaluationSchemaController } = require('../controllers/evaluationSchemaController');

const {
  getEvaluationConfiguration,
  createOrUpdateEvaluationConfiguration,
  getEvaluationConfigByEvent,
  createEvaluationConfig,
  getEvaluation,
  createEvaluation,
  listEvaluationsByEvent,
  getEvaluationByJudgeTeam,
} = require('../controllers/evaluationController');

const router = express.Router();

router.post('/events/:eventId/evaluation/ai-generate', createEvaluationSchemaController());

// Evaluation configuration
router
  .route('/events/:eventId/evaluation')
  .get(getEvaluationConfiguration)
  .put(createOrUpdateEvaluationConfiguration);

router
  .route('/events/:eventId/evaluation-config')
  .get(getEvaluationConfigByEvent)
  .put(createEvaluationConfig);

// Judge evaluations
router
  .route('/evaluations')
  .post(createEvaluation);

router
  .route('/evaluations/:evaluationId')
  .get(getEvaluation);

router
  .route('/events/:eventId/evaluations')
  .get(listEvaluationsByEvent);

router
  .route('/events/:eventId/judges/:judgeId/teams/:teamId/evaluation')
  .get(getEvaluationByJudgeTeam);

module.exports = router;
