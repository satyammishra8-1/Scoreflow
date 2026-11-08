const express = require('express');
const { createAuthController } = require('../controllers/authController');
const { authenticate, authenticateOptional, requireEventAccess, requireRole, rateLimit } = require('../middleware/auth');

function createAuthRouter({ controller = createAuthController() } = {}) {
  const router = express.Router();
  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 8 });
  const registrationLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); return next(); });
  router.post('/auth/organizer/register', registrationLimit, controller.organizerRegister);
  router.post('/auth/organizer/verify', loginLimit, controller.verifyOrganizer);
  router.post('/auth/organizer/login', loginLimit, controller.organizerLogin);
  router.post('/auth/refresh', loginLimit, controller.refresh);
  router.post('/auth/logout', authenticateOptional, controller.logout);
  router.get('/auth/organizer/me', authenticate, requireRole('organizer'), controller.organizerMe);
  router.get('/auth/judge/events/:eventId', authenticate, requireEventAccess, controller.judgeEventProfile);
  return router;
}

module.exports = Object.assign(createAuthRouter(), { createAuthRouter });
