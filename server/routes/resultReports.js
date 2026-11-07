const express = require('express');
const controller = require('../controllers/resultReportController');
const emailController = require('../controllers/resultReportEmailController');

const router = express.Router();
const { requireOrganizer, requireOwnedEvent } = require('../middleware/auth');
router.get('/events/:eventId/result-reports', ...requireOrganizer, requireOwnedEvent, controller.listReports);
router.get('/events/:eventId/result-reports/delivery-status', ...requireOrganizer, requireOwnedEvent, emailController.listDeliveryStatusByEvent);
router.post('/events/:eventId/result-reports/send', ...requireOrganizer, requireOwnedEvent, emailController.sendReportsBulk);
router.post('/events/:eventId/result-reports/:teamId/generate', ...requireOrganizer, requireOwnedEvent, controller.generateReport);
router.post('/events/:eventId/result-reports/:teamId/send', ...requireOrganizer, requireOwnedEvent, emailController.sendReport);
router.get('/events/:eventId/result-reports/:teamId', ...requireOrganizer, requireOwnedEvent, controller.getReport);

module.exports = router;
