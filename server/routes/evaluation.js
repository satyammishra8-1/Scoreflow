const express = require('express');
const {
  getEvaluationConfiguration,
  createOrUpdateEvaluationConfiguration,
} = require('../controllers/evaluationController');

const router = express.Router();

router.route('/events/:eventId/evaluation').get(getEvaluationConfiguration);

router.route('/events/:eventId/evaluation').put(createOrUpdateEvaluationConfiguration);

module.exports = router;
