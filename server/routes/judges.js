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
const { requireOrganizer, rateLimit } = require('../middleware/auth');
const inviteRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

router.get('/judge-invitations/:token', inviteRateLimit, previewJudgeInvitation);
router.post('/judge-invitations/accept', inviteRateLimit, acceptJudgeInvitation);
router.use(...requireOrganizer);
router.route('/events/:eventId/judges').post(createJudge).get(listJudgesByEvent);
router.post('/events/:eventId/judge-invitations/ai-draft', createEmailDraftController({ emailType: 'judge-invitations' }));
router.post('/judges/:judgeId/invitation/resend', resendJudgeInvitation);
router.post('/events/:eventId/judge-invitations', sendJudgeInvitations);
router.route('/judges/:judgeId/teams/:teamId').post(addJudgeTeam).delete(removeJudgeTeam);
router.route('/judges/:judgeId').get(getJudge).put(updateJudge).delete(deleteJudge);

module.exports = router;
