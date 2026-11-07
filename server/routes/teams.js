const express = require('express');
const {
  createTeam,
  listTeamsByEvent,
  getTeam,
  updateTeam,
  deleteTeam,
} = require('../controllers/teamController');
const { authenticate, requireEventAccess, requireAssignedTeam, requireOrganizer, requireOwnedEvent, requireOwnedTeam } = require('../middleware/auth');

const router = express.Router();

router.route('/teams').post(...requireOrganizer, requireOwnedEvent, createTeam);
router.route('/events/:eventId/teams').get(authenticate, requireEventAccess, listTeamsByEvent);
router.route('/teams/:teamId').get(authenticate, requireAssignedTeam, getTeam).put(...requireOrganizer, requireOwnedTeam, updateTeam).delete(...requireOrganizer, requireOwnedTeam, deleteTeam);

module.exports = router;
