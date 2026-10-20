const express = require('express');
const controller = require('../controllers/resultReportController');

const router = express.Router();
router.get('/events/:eventId/result-reports', controller.listReports);
router.post('/events/:eventId/result-reports/:teamId/generate', controller.generateReport);
router.get('/events/:eventId/result-reports/:teamId', controller.getReport);

module.exports = router;
