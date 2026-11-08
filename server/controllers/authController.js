const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const OrganizerAccount = require('../models/OrganizerAccount');
const RefreshSession = require('../models/RefreshSession');
const Judge = require('../models/Judge');

const ACCESS_TTL = '10m';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'scoreflow_refresh';
const COOKIE_PATH = '/api/auth';

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
  const accessSecret = process.env.JWT_ACCESS_SECRET || '';
  const refreshSecret = process.env.JWT_REFRESH_SECRET || '';
  return Buffer.byteLength(accessSecret, 'utf8') >= 32
    && Buffer.byteLength(refreshSecret, 'utf8') >= 32
    && accessSecret !== refreshSecret;
}

function hashRefreshToken(token) {
  if (!process.env.JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET is not configured.');
  return crypto.createHmac('sha256', process.env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

function createAuthController({ OrganizerModel = OrganizerAccount, JudgeModel = Judge, RefreshModel = RefreshSession } = {}) {
  function signAccess(user, role, email, eventId, sessionType) {
    return jwt.sign({ sub: String(user._id), role, email, ver: user.tokenVersion || 0, sessionType, ...(eventId ? { eventId: String(eventId) } : {}) }, process.env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256', expiresIn: ACCESS_TTL, issuer: 'scoreflow', audience: 'scoreflow-api',
    });
  }

  async function issueSession(user, role, email, eventId, res, familyId = crypto.randomUUID(), sessionType = 'organizer') {
    if (!authConfigurationReady()) throw new Error('Authentication secrets are not configured.');
    const refresh = crypto.randomBytes(48).toString('base64url');
    await RefreshModel.create({ userId: user._id, role, sessionType, tokenHash: hashRefreshToken(refresh), familyId, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) });
    res.append('Set-Cookie', refreshCookie(refresh));
    return { accessToken: signAccess(user, role, email, eventId, sessionType), tokenType: 'Bearer', expiresIn: 600, role, email, ...(role === 'organizer' ? { name: user.name } : {}), ...(eventId ? { eventId, judgeId: String(user._id) } : {}) };
  }

  async function issueJudgeInvitationSession(judge, res) {
    return issueSession(judge, 'judge', judge.email, String(judge.eventId), res, crypto.randomUUID(), 'invitation');
  }

  async function organizerRegister(req, res) {
    try {
      if (!authConfigurationReady()) return res.status(503).json({ success: false, error: 'Authentication is not configured.' });
      const email = String(req.body?.email || '').trim().toLowerCase();
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!name || name.length > 100) return res.status(400).json({ success: false, error: 'Enter your name (up to 100 characters).' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ success: false, error: 'Enter a valid email address.' });
      if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ success: false, error: 'Use a password with at least 8 characters.' });
      const existing = await OrganizerModel.findOne({ email });
      if (existing) return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await OrganizerModel.create({ name, email, passwordHash });
      return res.status(201).json({ success: true, data: await issueSession(user, 'organizer', email, null, res) });
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
      console.error('Organizer registration failed:', error.message);
      return res.status(500).json({ success: false, error: 'Organizer account setup failed.' });
    }
  }

  async function organizerLogin(req, res) {
    try {
      if (!authConfigurationReady()) return res.status(503).json({ success: false, error: 'Authentication is not configured.' });
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const user = await OrganizerModel.findOne({ email, active: true }).select('+passwordHash');
      if (!user || !await bcrypt.compare(password, user.passwordHash)) return res.status(401).json({ success: false, error: 'Email or password is incorrect.' });
      return res.status(200).json({ success: true, data: await issueSession(user, 'organizer', email, null, res) });
    } catch (error) {
      console.error('Organizer login failed:', error.message);
      return res.status(500).json({ success: false, error: 'Unable to sign in right now.' });
    }
  }

  async function organizerMe(req, res) {
    try {
      const user = await OrganizerModel.findById(req.auth.sub);
      if (!user || user.active === false) return res.status(401).json({ success: false, error: 'Sign in again to continue.' });
      return res.status(200).json({ success: true, data: { name: user.name, email: user.email, role: 'organizer' } });
    } catch (error) {
      console.error('Organizer profile lookup failed:', error.message);
      return res.status(500).json({ success: false, error: 'Unable to load your account right now.' });
    }
  }

  async function refresh(req, res) {
    try {
      const raw = refreshTokenFromRequest(req);
      if (!raw || !authConfigurationReady()) return res.status(401).json({ success: false, error: 'Sign in again to continue.' });
      const tokenHash = hashRefreshToken(raw);
      const existing = await RefreshModel.findOne({ tokenHash });
      if (!existing || existing.expiresAt <= new Date()) return res.status(401).json({ success: false, error: 'Sign in again to continue.' });
      if (existing.role === 'judge' && existing.sessionType !== 'invitation') {
        await RefreshModel.updateMany({ familyId: existing.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
        return res.status(401).json({ success: false, error: 'Judge access must come from an event invitation.' });
      }
      if (existing.revokedAt) {
        await RefreshModel.updateMany({ familyId: existing.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
        return res.status(401).json({ success: false, error: 'Refresh token reuse was detected. Sign in again.' });
      }
      const claimed = await RefreshModel.findOneAndUpdate({ _id: existing._id, revokedAt: null, expiresAt: { $gt: new Date() } }, { $set: { revokedAt: new Date() } }, { returnDocument: 'after' });
      if (!claimed) return res.status(401).json({ success: false, error: 'Sign in again to continue.' });
      const user = existing.role === 'organizer'
        ? await OrganizerModel.findById(existing.userId)
        : await JudgeModel.findById(existing.userId);
      if (!user || user.active === false || (user.invitationStatus && user.invitationStatus !== 'accepted')) return res.status(401).json({ success: false, error: 'Sign in again to continue.' });
      return res.status(200).json({ success: true, data: await issueSession(user, existing.role, user.email, existing.role === 'judge' ? user.eventId : null, res, existing.familyId, existing.sessionType) });
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

  return { organizerRegister, organizerLogin, organizerMe, issueJudgeInvitationSession, refresh, logout, judgeEventProfile };
}

module.exports = { ...createAuthController(), createAuthController, refreshTokenFromRequest, refreshCookie, authConfigurationReady, hashRefreshToken };
