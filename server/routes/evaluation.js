const express = require('express');
const { createEvaluationSchemaController, createEvaluationSchemaValidationController } = require('../controllers/evaluationSchemaController');

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
const { authenticate, requireOrganizer, requireEventAccess, requireAssignedTeam, authorizeEvaluationSubmission, authorizeEvaluationId } = require('../middleware/auth');

router.post('/events/:eventId/evaluation/ai-generate', ...requireOrganizer, createEvaluationSchemaController());
router.post('/events/:eventId/evaluation/ai-validate', ...requireOrganizer, createEvaluationSchemaValidationController());

// Evaluation configuration
router
  .route('/events/:eventId/evaluation')
  .get(authenticate, requireEventAccess, getEvaluationConfiguration)
  .put(...requireOrganizer, createOrUpdateEvaluationConfiguration);

router
  .route('/events/:eventId/evaluation-config')
  .get(authenticate, requireEventAccess, getEvaluationConfigByEvent)
  .put(...requireOrganizer, createEvaluationConfig);

// Judge evaluations
router
  .route('/evaluations')
  .post(authenticate, authorizeEvaluationSubmission, createEvaluation);

router
  .route('/evaluations/:evaluationId')
  .get(authenticate, authorizeEvaluationId, getEvaluation);

router
  .route('/events/:eventId/evaluations')
  .get(authenticate, requireEventAccess, listEvaluationsByEvent);

router
  .route('/events/:eventId/judges/:judgeId/teams/:teamId/evaluation')
  .get(authenticate, requireEventAccess, requireAssignedTeam, getEvaluationByJudgeTeam);

module.exports = router;
