const express = require('express');
const {
  getEvaluationConfiguration,
  createOrUpdateEvaluationConfiguration,
  getEvaluationConfigByEvent,
  createEvaluationConfig,
  updateEvaluationConfig,
} = require('../controllers/evaluationController');

const router = express.Router();

router.route('/events/:eventId/evaluation').get(getEvaluationConfiguration);

router.route('/events/:eventId/evaluation').put(createOrUpdateEvaluationConfiguration);

// Event-scoped evaluation configuration API (persisted to MongoDB)
router.route('/events/:eventId/evaluation-config').get(getEvaluationConfigByEvent);

router.route('/events/:eventId/evaluation-config').put(createEvaluationConfig);

module.exports = router;
