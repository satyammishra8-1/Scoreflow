const express = require('express');
const {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
} = require('../controllers/eventController');
const { getEventAnalytics } = require('../controllers/eventAnalyticsController');

const router = express.Router();

router.route('/events').post(createEvent).get(listEvents);
router.get('/events/:eventId/analytics', getEventAnalytics);
router.route('/events/:eventId').get(getEvent).put(updateEvent).delete(deleteEvent);

module.exports = router;
