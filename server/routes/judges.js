const express = require('express');
const { createEmailDraftController } = require('../controllers/emailDraftController');
const {
  createJudge,
  listJudgesByEvent,
  getJudge,
  updateJudge,
  deleteJudge,
  addJudgeTeam,
  removeJudgeTeam,
  previewJudgeInvitation,
  acceptJudgeInvitation,
  resendJudgeInvitation,
  sendJudgeInvitations,
} = require('../controllers/judgeController');

const router = express.Router();
const { requireOrganizer, requireOwnedEvent, requireOwnedJudge, rateLimit } = require('../middleware/auth');
const inviteRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

router.get('/judge-invitations/:token', inviteRateLimit, previewJudgeInvitation);
router.post('/judge-invitations/accept', inviteRateLimit, acceptJudgeInvitation);
router.route('/events/:eventId/judges').post(...requireOrganizer, requireOwnedEvent, createJudge).get(...requireOrganizer, requireOwnedEvent, listJudgesByEvent);
router.post('/events/:eventId/judge-invitations/ai-draft', ...requireOrganizer, requireOwnedEvent, createEmailDraftController({ emailType: 'judge-invitations' }));
router.post('/judges/:judgeId/invitation/resend', ...requireOrganizer, requireOwnedJudge, resendJudgeInvitation);
router.post('/events/:eventId/judge-invitations', ...requireOrganizer, requireOwnedEvent, sendJudgeInvitations);
router.route('/judges/:judgeId/teams/:teamId').post(...requireOrganizer, requireOwnedJudge, addJudgeTeam).delete(...requireOrganizer, requireOwnedJudge, removeJudgeTeam);
router.route('/judges/:judgeId').get(...requireOrganizer, requireOwnedJudge, getJudge).put(...requireOrganizer, requireOwnedJudge, updateJudge).delete(...requireOrganizer, requireOwnedJudge, deleteJudge);

module.exports = router;
