const express = require('express');
const {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
} = require('../controllers/eventController');

const router = express.Router();

router.route('/events').post(createEvent).get(listEvents);
router.route('/events/:eventId').get(getEvent).put(updateEvent).delete(deleteEvent);

module.exports = router;
