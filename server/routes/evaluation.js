const express = require('express');
const {
  getEvaluationConfiguration,
  createOrUpdateEvaluationConfiguration,
  getEvaluationConfigByEvent,
  createEvaluationConfig,
  updateEvaluationConfig,
  createEvaluation,
  getEvaluation,
  listEvaluationsByEvent,
  getEvaluationByJudgeTeam,
} = require('../controllers/evaluationController');

const router = express.Router();

router.route('/events/:eventId/evaluation').get(getEvaluationConfiguration);

router.route('/events/:eventId/evaluation').put(createOrUpdateEvaluationConfiguration);

// Event-scoped evaluation configuration API (persisted to MongoDB)
router.route('/events/:eventId/evaluation-config').get(getEvaluationConfigByEvent);

router.route('/events/:eventId/evaluation-config').put(createEvaluationConfig);

// Judge evaluation submissions (persisted to MongoDB)
router.route('/evaluations').post(createEvaluation);
router.route('/evaluations/:evaluationId').get(getEvaluation);
router.route('/events/:eventId/evaluations').get(listEvaluationsByEvent);
router.route('/events/:eventId/judges/:judgeId/teams/:teamId/evaluation').get(getEvaluationByJudgeTeam);

module.exports = router;
