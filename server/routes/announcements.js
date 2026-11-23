const express = require('express');
const { createAnnouncement, listAnnouncementsByEvent } = require('../controllers/announcementController');

const router = express.Router();
const { requireOrganizer, requireOwnedEvent } = require('../middleware/auth');
router.route('/events/:eventId/announcements').post(...requireOrganizer, requireOwnedEvent, createAnnouncement).get(...requireOrganizer, requireOwnedEvent, listAnnouncementsByEvent);

module.exports = router;
