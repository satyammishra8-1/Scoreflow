const express = require('express');
const { authenticate, requireOwnedEvent, requireRole } = require('../middleware/auth');
const { receiveBrevoEvent, listByEvent } = require('../controllers/emailDeliveryController');

const router = express.Router();
router.post('/email/webhooks/brevo', receiveBrevoEvent);
router.get('/events/:eventId/email-deliveries', authenticate, requireRole('organizer'), requireOwnedEvent, listByEvent);

module.exports = router;
