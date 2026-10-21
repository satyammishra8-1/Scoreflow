const express = require('express');
const controller = require('../controllers/resultReportController');
const emailController = require('../controllers/resultReportEmailController');

const router = express.Router();
router.get('/events/:eventId/result-reports', controller.listReports);
router.get('/events/:eventId/result-reports/delivery-status', emailController.listDeliveryStatusByEvent);
router.post('/events/:eventId/result-reports/send', emailController.sendReportsBulk);
router.post('/events/:eventId/result-reports/:teamId/generate', controller.generateReport);
router.post('/events/:eventId/result-reports/:teamId/send', emailController.sendReport);
router.get('/events/:eventId/result-reports/:teamId', controller.getReport);

module.exports = router;
