const express = require('express');
const { createAnnouncement, listAnnouncementsByEvent } = require('../controllers/announcementController');

const router = express.Router();
router.route('/events/:eventId/announcements').post(createAnnouncement).get(listAnnouncementsByEvent);

module.exports = router;
