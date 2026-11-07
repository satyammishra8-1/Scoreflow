const express = require('express');
const { createAuthController } = require('../controllers/authController');
const { authenticate, authenticateOptional, requireEventAccess, rateLimit } = require('../middleware/auth');

const router = express.Router();
const controller = createAuthController();
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 8 });
const setupLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); return next(); });

router.post('/auth/organizer/setup', setupLimit, controller.organizerSetup);
router.post('/auth/organizer/login', loginLimit, controller.organizerLogin);
router.post('/auth/judge/login', loginLimit, controller.judgeLogin);
router.post('/auth/refresh', loginLimit, controller.refresh);
router.post('/auth/logout', authenticateOptional, controller.logout);
router.get('/auth/judge/events/:eventId', authenticate, requireEventAccess, controller.judgeEventProfile);

module.exports = router;
