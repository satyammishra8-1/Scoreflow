const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const OrganizerAccount = require('../models/OrganizerAccount');
const RefreshSession = require('../models/RefreshSession');
const Judge = require('../models/Judge');

const ACCESS_TTL = '10m';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'scoreflow_refresh';
const COOKIE_PATH = '/api/auth';

function normalizedAllowlist(value = process.env.ORGANIZER_EMAIL_ALLOWLIST || '') {
  return [...new Set(value.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function refreshTokenFromRequest(req) {
  const rawCookie = req.headers.cookie || '';
  const entry = rawCookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${COOKIE_NAME}=`));
  return entry ? decodeURIComponent(entry.slice(COOKIE_NAME.length + 1)) : '';
}

function refreshCookie(token, maxAge = Math.floor(REFRESH_TTL_MS / 1000)) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=${COOKIE_PATH}; Max-Age=${maxAge}; SameSite=Strict${secure}`;
}

function clearRefreshCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; HttpOnly; Path=${COOKIE_PATH}; Max-Age=0; SameSite=Strict${secure}`;
}

function authConfigurationReady() {
  return Boolean(process.env.JWT_ACCESS_SECRET && process.env.JWT_REFRESH_SECRET);
}

function hashRefreshToken(token) {
  if (!process.env.JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET is not configured.');
  return crypto.createHmac('sha256', process.env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

function createAuthController({ OrganizerModel = OrganizerAccount, JudgeModel = Judge, RefreshModel = RefreshSession } = {}) {
  function signAccess(user, role, email, eventId) {
    return jwt.sign({ sub: String(user._id), role, email, ver: user.tokenVersion || 0, ...(eventId ? { eventId: String(eventId) } : {}) }, process.env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256', expiresIn: ACCESS_TTL, issuer: 'scoreflow', audience: 'scoreflow-api',
    });
  }

  async function issueSession(user, role, email, eventId, res, familyId = crypto.randomUUID()) {
    if (!authConfigurationReady()) throw new Error('Authentication secrets are not configured.');
    const refresh = crypto.randomBytes(48).toString('base64url');
    await RefreshModel.create({ userId: user._id, role, tokenHash: hashRefreshToken(refresh), familyId, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) });
    res.append('Set-Cookie', refreshCookie(refresh));
    return { accessToken: signAccess(user, role, email, eventId), tokenType: 'Bearer', expiresIn: 600, role, email, ...(eventId ? { eventId, judgeId: String(user._id) } : {}) };
  }

  async function organizerSetup(req, res) {
    try {
      if (!authConfigurationReady()) return res.status(503).json({ success: false, error: 'Authentication is not configured.' });
      const allowed = normalizedAllowlist();
      if (allowed.length !== 2 || !allowed.every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        return res.status(503).json({ success: false, error: 'Organizer setup is not configured.' });
      }
      const setupSecret = process.env.ORGANIZER_SETUP_TOKEN || '';
      if (setupSecret.length < 32 || !safeEqual(req.get('x-organizer-setup-token'), setupSecret)) {
        return res.status(403).json({ success: false, error: 'Organizer setup authorization failed.' });
      }
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!allowed.includes(email)) return res.status(403).json({ success: false, error: 'This email is not authorized to create an organizer account.' });
      if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ success: false, error: 'Use a password of at least 12 characters and no more than 72 UTF-8 bytes.' });
      const createdCount = await OrganizerModel.countDocuments({ email: { $in: allowed } });
      if (createdCount >= allowed.length) return res.status(410).json({ success: false, error: 'Initial organizer setup is closed.' });
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await OrganizerModel.create({ email, passwordHash });
      const data = await issueSession(user, 'organizer', email, null, res);
      return res.status(201).json({ success: true, data });
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ success: false, error: 'An account for this authorized email already exists.' });
      console.error('Organizer setup failed:', error.message);
      return res.status(500).json({ success: false, error: 'Organizer account setup failed.' });
    }
  }

  async function organizerLogin(req, res) {
    try {
      if (!authConfigurationReady()) return res.status(503).json({ success: false, error: 'Authentication is not configured.' });
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!normalizedAllowlist().includes(email)) return res.status(401).json({ success: false, error: 'Email or password is incorrect.' });
      const user = await OrganizerModel.findOne({ email, active: true }).select('+passwordHash');
      if (!user || !await bcrypt.compare(password, user.passwordHash)) return res.status(401).json({ success: false, error: 'Email or password is incorrect.' });
      return res.status(200).json({ success: true, data: await issueSession(user, 'organizer', email, null, res) });
    } catch (error) {
      console.error('Organizer login failed:', error.message);
      return res.status(500).json({ success: false, error: 'Unable to sign in right now.' });
    }
  }

  async function judgeLogin(req, res) {
    try {
      if (!authConfigurationReady()) return res.status(503).json({ success: false, error: 'Authentication is not configured.' });
      const email = String(req.body?.email || '').trim().toLowerCase();
      const eventId = String(req.body?.eventId || '').trim();
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!mongoose.Types.ObjectId.isValid(eventId)) return res.status(400).json({ success: false, error: 'Enter a valid event ID.' });
      const judge = await JudgeModel.findOne({ eventId, email, invitationStatus: 'accepted' }).select('+passwordHash');
      if (!judge?.passwordHash || !await bcrypt.compare(password, judge.passwordHash)) return res.status(401).json({ success: false, error: 'Email, password or event ID is incorrect.' });
      return res.status(200).json({ success: true, data: await issueSession(judge, 'judge', email, eventId, res) });
    } catch (error) {
      console.error('Judge login failed:', error.message);
      return res.status(500).json({ success: false, error: 'Unable to sign in right now.' });
    }
  }

  async function refresh(req, res) {
    try {
      const raw = refreshTokenFromRequest(req);
      if (!raw || !authConfigurationReady()) return res.status(401).json({ success: false, error: 'Sign in again to continue.' });
      const tokenHash = hashRefreshToken(raw);
      const existing = await RefreshModel.findOne({ tokenHash });
      if (!existing || existing.expiresAt <= new Date()) return res.status(401).json({ success: false, error: 'Sign in again to continue.' });
      if (existing.revokedAt) {
        await RefreshModel.updateMany({ familyId: existing.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
        return res.status(401).json({ success: false, error: 'Refresh token reuse was detected. Sign in again.' });
      }
      const claimed = await RefreshModel.findOneAndUpdate({ _id: existing._id, revokedAt: null, expiresAt: { $gt: new Date() } }, { $set: { revokedAt: new Date() } }, { new: true });
      if (!claimed) return res.status(401).json({ success: false, error: 'Sign in again to continue.' });
      const user = existing.role === 'organizer'
        ? await OrganizerModel.findById(existing.userId)
        : await JudgeModel.findById(existing.userId);
      if (!user || user.active === false || (user.invitationStatus && user.invitationStatus !== 'accepted')) return res.status(401).json({ success: false, error: 'Sign in again to continue.' });
      if (existing.role === 'organizer' && !normalizedAllowlist().includes(String(user.email).toLowerCase())) {
        await RefreshModel.updateMany({ familyId: existing.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
        return res.status(401).json({ success: false, error: 'Sign in again to continue.' });
      }
      return res.status(200).json({ success: true, data: await issueSession(user, existing.role, user.email, existing.role === 'judge' ? user.eventId : null, res, existing.familyId) });
    } catch (error) {
      console.error('Session refresh failed:', error.message);
      return res.status(500).json({ success: false, error: 'Unable to refresh your session.' });
    }
  }

  async function logout(req, res) {
    try {
      const raw = refreshTokenFromRequest(req);
      if (raw) {
        const tokenHash = hashRefreshToken(raw);
        const session = await RefreshModel.findOne({ tokenHash });
        if (session) {
          await RefreshModel.updateMany({ userId: session.userId, role: session.role, revokedAt: null }, { $set: { revokedAt: new Date() } });
          const UserModel = session.role === 'organizer' ? OrganizerModel : JudgeModel;
          await UserModel.updateOne({ _id: session.userId }, { $inc: { tokenVersion: 1 } });
        }
      }
      res.append('Set-Cookie', clearRefreshCookie());
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Logout failed:', error.message);
      res.append('Set-Cookie', clearRefreshCookie());
      return res.status(200).json({ success: true });
    }
  }

  async function judgeEventProfile(req, res) {
    const judge = req.eventJudge;
    if (!judge) return res.status(404).json({ success: false, error: 'No accepted judge account exists for this event.' });
    return res.status(200).json({ success: true, data: {
      _id: String(judge._id), judgeId: String(judge._id), eventId: String(judge.eventId), name: judge.name,
      email: judge.email, assignedTeamIds: (judge.assignedTeamIds || []).map(String), invitationStatus: judge.invitationStatus,
    } });
  }

  return { organizerSetup, organizerLogin, judgeLogin, refresh, logout, judgeEventProfile };
}

module.exports = { ...createAuthController(), createAuthController, normalizedAllowlist, refreshTokenFromRequest, refreshCookie, authConfigurationReady, hashRefreshToken };
