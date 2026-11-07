const express = require('express');
const { createAnnouncement, listAnnouncementsByEvent } = require('../controllers/announcementController');
const { createEmailDraftController } = require('../controllers/emailDraftController');

const router = express.Router();
const { requireOrganizer, requireOwnedEvent } = require('../middleware/auth');
router.post('/events/:eventId/announcements/ai-draft', ...requireOrganizer, requireOwnedEvent, createEmailDraftController({ emailType: 'announcements' }));
router.route('/events/:eventId/announcements').post(...requireOrganizer, requireOwnedEvent, createAnnouncement).get(...requireOrganizer, requireOwnedEvent, listAnnouncementsByEvent);

module.exports = router;
