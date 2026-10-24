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

router.route('/events/:eventId/judges').post(createJudge).get(listJudgesByEvent);
router.get('/judge-invitations/:token', previewJudgeInvitation);
router.post('/judge-invitations/accept', acceptJudgeInvitation);
router.post('/events/:eventId/judge-invitations/ai-draft', createEmailDraftController({ emailType: 'judge-invitations' }));
router.post('/judges/:judgeId/invitation/resend', resendJudgeInvitation);
router.post('/events/:eventId/judge-invitations', sendJudgeInvitations);
router.route('/judges/:judgeId/teams/:teamId').post(addJudgeTeam).delete(removeJudgeTeam);
router.route('/judges/:judgeId').get(getJudge).put(updateJudge).delete(deleteJudge);

module.exports = router;
