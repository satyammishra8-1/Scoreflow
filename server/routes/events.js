const express = require('express');
const {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
} = require('../controllers/eventController');
const { getEventAnalytics } = require('../controllers/eventAnalyticsController');
const { authenticate, requireOrganizer, requireEventAccess, requireOwnedEvent } = require('../middleware/auth');

const router = express.Router();

router.route('/events').post(...requireOrganizer, createEvent).get(...requireOrganizer, listEvents);
router.get('/events/:eventId/analytics', ...requireOrganizer, requireOwnedEvent, getEventAnalytics);
router.route('/events/:eventId').get(authenticate, requireEventAccess, getEvent).put(...requireOrganizer, requireOwnedEvent, updateEvent).delete(...requireOrganizer, requireOwnedEvent, deleteEvent);

module.exports = router;
