const express = require('express');
const { createAnnouncement, listAnnouncementsByEvent } = require('../controllers/announcementController');
const { createEmailDraftController } = require('../controllers/emailDraftController');

const router = express.Router();
router.post('/events/:eventId/announcements/ai-draft', createEmailDraftController({ emailType: 'announcements' }));
router.route('/events/:eventId/announcements').post(createAnnouncement).get(listAnnouncementsByEvent);

module.exports = router;
