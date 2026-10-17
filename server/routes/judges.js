const express = require('express');
const {
  createJudge,
  listJudgesByEvent,
  getJudge,
  updateJudge,
  deleteJudge,
} = require('../controllers/judgeController');

const router = express.Router();

router.route('/events/:eventId/judges').post(createJudge).get(listJudgesByEvent);
router.route('/judges/:judgeId').get(getJudge).put(updateJudge).delete(deleteJudge);

module.exports = router;
