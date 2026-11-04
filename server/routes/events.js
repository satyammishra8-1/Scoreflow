const express = require('express');
const {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
} = require('../controllers/eventController');
const { getEventAnalytics } = require('../controllers/eventAnalyticsController');
const { authenticate, requireOrganizer, requireEventAccess } = require('../middleware/auth');

const router = express.Router();

router.route('/events').post(...requireOrganizer, createEvent).get(...requireOrganizer, listEvents);
router.get('/events/:eventId/analytics', ...requireOrganizer, getEventAnalytics);
router.route('/events/:eventId').get(authenticate, requireEventAccess, getEvent).put(...requireOrganizer, updateEvent).delete(...requireOrganizer, deleteEvent);

module.exports = router;
