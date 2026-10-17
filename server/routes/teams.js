const express = require('express');
const {
  createTeam,
  listTeamsByEvent,
  getTeam,
  updateTeam,
  deleteTeam,
} = require('../controllers/teamController');

const router = express.Router();

router.route('/teams').post(createTeam);
router.route('/events/:eventId/teams').get(listTeamsByEvent);
router.route('/teams/:teamId').get(getTeam).put(updateTeam).delete(deleteTeam);

module.exports = router;
