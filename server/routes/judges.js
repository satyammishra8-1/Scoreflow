const express = require('express');
const {
  createJudge,
  listJudgesByEvent,
  getJudge,
  updateJudge,
  deleteJudge,
  addJudgeTeam,
  removeJudgeTeam,
} = require('../controllers/judgeController');

const router = express.Router();

router.route('/events/:eventId/judges').post(createJudge).get(listJudgesByEvent);
router.route('/judges/:judgeId/teams/:teamId').post(addJudgeTeam).delete(removeJudgeTeam);
router.route('/judges/:judgeId').get(getJudge).put(updateJudge).delete(deleteJudge);

module.exports = router;
