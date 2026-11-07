const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createAuthController } = require('../controllers/authController');

const accessSecret = 'test-access-secret-that-is-long-enough-32-bytes';
const refreshSecret = 'test-refresh-secret-that-is-long-enough-32-bytes';
const setupSecret = 'test-organizer-setup-secret-long-enough-32-bytes';

function fixture() {
  const accounts = [];
  const judges = [];
  const refreshes = [];
  const organizerModel = {
    countDocuments: async (query) => accounts.filter((item) => query.email.$in.includes(item.email)).length,
    findOne: (query) => ({ select: async () => accounts.find((item) => item.email === query.email) || null }),
    findById: async (id) => accounts.find((item) => String(item._id) === String(id)) || null,
    create: async (value) => { const item = { _id: `org-${accounts.length + 1}`, tokenVersion: 0, active: true, ...value }; accounts.push(item); return item; },
    updateOne: async (query, update) => { const item = accounts.find((entry) => String(entry._id) === String(query._id)); if (item) item.tokenVersion += update.$inc.tokenVersion; },
  };
  const judgeModel = {
    findOne: (query) => ({ select: async () => judges.find((item) => item.email === query.email && item.eventId === query.eventId && item.invitationStatus === query.invitationStatus) || null }),
    findById: async (id) => judges.find((item) => String(item._id) === String(id)) || null,
  };
  const refreshModel = {
    create: async (item) => { refreshes.push({ _id: `refresh-${refreshes.length + 1}`, revokedAt: null, ...item }); },
    findOne: async (query) => refreshes.find((item) => item.tokenHash === query.tokenHash) || null,
    findOneAndUpdate: async (query, update) => {
      const item = refreshes.find((entry) => String(entry._id) === String(query._id) && !entry.revokedAt);
      if (!item) return null;
      item.revokedAt = update.$set.revokedAt;
      return item;
    },
    updateMany: async (query, update) => {
      for (const item of refreshes) if ((query.familyId === undefined || item.familyId === query.familyId) && (query.userId === undefined || item.userId === query.userId) && !item.revokedAt) item.revokedAt = update.$set.revokedAt;
    },
  };
  const controller = createAuthController({ OrganizerModel: organizerModel, JudgeModel: judgeModel, RefreshModel: refreshModel });
  const response = () => ({ statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, append(key, value) { this.headers[key] = value; } });
  return { controller, accounts, judges, refreshes, response };
}

test('organizer setup only creates allowlisted accounts and closes after both accounts exist', async (t) => {
  const env = { allowlist: process.env.ORGANIZER_EMAIL_ALLOWLIST, setup: process.env.ORGANIZER_SETUP_TOKEN, access: process.env.JWT_ACCESS_SECRET, refresh: process.env.JWT_REFRESH_SECRET };
  process.env.ORGANIZER_EMAIL_ALLOWLIST = 'owner@example.test,leader@example.test';
  process.env.ORGANIZER_SETUP_TOKEN = setupSecret;
  process.env.JWT_ACCESS_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = refreshSecret;
  t.after(() => {
    for (const [key, value] of Object.entries({ ORGANIZER_EMAIL_ALLOWLIST: env.allowlist, ORGANIZER_SETUP_TOKEN: env.setup, JWT_ACCESS_SECRET: env.access, JWT_REFRESH_SECRET: env.refresh })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const fx = fixture();
  const blocked = fx.response();
  await fx.controller.organizerSetup({ get: () => setupSecret, body: { email: 'attacker@example.test', password: 'a-strong-test-password' } }, blocked);
  assert.equal(blocked.statusCode, 403);
  const created = fx.response();
  await fx.controller.organizerSetup({ get: () => setupSecret, body: { email: 'owner@example.test', password: 'a-strong-test-password' } }, created);
  assert.equal(created.statusCode, 201);
  assert.notEqual(fx.accounts[0].passwordHash, 'a-strong-test-password');
  assert.ok(created.body.data.accessToken);
  assert.match(created.headers['Set-Cookie'], /HttpOnly/);
  const second = fx.response();
  await fx.controller.organizerSetup({ get: () => setupSecret, body: { email: 'leader@example.test', password: 'another-strong-password' } }, second);
  const closed = fx.response();
  await fx.controller.organizerSetup({ get: () => setupSecret, body: { email: 'leader@example.test', password: 'another-strong-password' } }, closed);
  assert.equal(closed.statusCode, 410);
});

test('organizer login rejects nonallowlisted identities and bad passwords', async (t) => {
  const previous = [process.env.ORGANIZER_EMAIL_ALLOWLIST, process.env.JWT_ACCESS_SECRET, process.env.JWT_REFRESH_SECRET];
  process.env.ORGANIZER_EMAIL_ALLOWLIST = 'owner@example.test,leader@example.test';
  process.env.JWT_ACCESS_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = refreshSecret;
  t.after(() => {
    ['ORGANIZER_EMAIL_ALLOWLIST', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].forEach((key, i) => previous[i] === undefined ? delete process.env[key] : process.env[key] = previous[i]);
  });
  const fx = fixture();
  const passwordHash = await bcrypt.hash('correct-password-here', 4);
  fx.accounts.push({ _id: 'org-1', email: 'owner@example.test', passwordHash, tokenVersion: 0, active: true });
  const denied = fx.response();
  await fx.controller.organizerLogin({ body: { email: 'other@example.test', password: 'correct-password-here' } }, denied);
  assert.equal(denied.statusCode, 401);
  const invalid = fx.response();
  await fx.controller.organizerLogin({ body: { email: 'owner@example.test', password: 'wrong-password' } }, invalid);
  assert.equal(invalid.statusCode, 401);
  const valid = fx.response();
  await fx.controller.organizerLogin({ body: { email: 'owner@example.test', password: 'correct-password-here' } }, valid);
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.body.data.role, 'organizer');
});

test('judge login is event-bound and requires an accepted invitation password', async (t) => {
  const previous = [process.env.JWT_ACCESS_SECRET, process.env.JWT_REFRESH_SECRET];
  process.env.JWT_ACCESS_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = refreshSecret;
  t.after(() => ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].forEach((key, i) => previous[i] === undefined ? delete process.env[key] : process.env[key] = previous[i]));
  const fx = fixture();
  fx.judges.push({ _id: '64b000000000000000000011', eventId: '64b000000000000000000001', email: 'judge@example.test', passwordHash: await bcrypt.hash('correct-password-here', 4), invitationStatus: 'accepted', tokenVersion: 1 });
  const wrongEvent = fx.response();
  await fx.controller.judgeLogin({ body: { email: 'judge@example.test', eventId: '64b000000000000000000002', password: 'correct-password-here' } }, wrongEvent);
  assert.equal(wrongEvent.statusCode, 401);
  const correct = fx.response();
  await fx.controller.judgeLogin({ body: { email: 'judge@example.test', eventId: '64b000000000000000000001', password: 'correct-password-here' } }, correct);
  assert.equal(correct.statusCode, 200);
  assert.equal(correct.body.data.role, 'judge');
  assert.equal(correct.body.data.judgeId, '64b000000000000000000011');
});

test('refresh rotates opaque cookie tokens, detects reuse and logout revokes active sessions', async (t) => {
  const previous = [process.env.ORGANIZER_EMAIL_ALLOWLIST, process.env.JWT_ACCESS_SECRET, process.env.JWT_REFRESH_SECRET];
  process.env.ORGANIZER_EMAIL_ALLOWLIST = 'owner@example.test,leader@example.test';
  process.env.JWT_ACCESS_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = refreshSecret;
  t.after(() => ['ORGANIZER_EMAIL_ALLOWLIST', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].forEach((key, i) => previous[i] === undefined ? delete process.env[key] : process.env[key] = previous[i]));
  const fx = fixture();
  fx.accounts.push({ _id: 'org-1', email: 'owner@example.test', passwordHash: await bcrypt.hash('correct-password-here', 4), tokenVersion: 0, active: true });
  const login = fx.response();
  await fx.controller.organizerLogin({ body: { email: 'owner@example.test', password: 'correct-password-here' } }, login);
  const originalCookie = login.headers['Set-Cookie'].split(';')[0];
  const firstRefresh = fx.response();
  await fx.controller.refresh({ headers: { cookie: originalCookie } }, firstRefresh);
  assert.equal(firstRefresh.statusCode, 200);
  const rotatedCookie = firstRefresh.headers['Set-Cookie'].split(';')[0];
  assert.notEqual(rotatedCookie, originalCookie);
  const reused = fx.response();
  await fx.controller.refresh({ headers: { cookie: originalCookie } }, reused);
  assert.equal(reused.statusCode, 401);
  assert.ok(fx.refreshes.every((session) => session.revokedAt));

  const freshLogin = fx.response();
  await fx.controller.organizerLogin({ body: { email: 'owner@example.test', password: 'correct-password-here' } }, freshLogin);
  const logout = fx.response();
  await fx.controller.logout({ headers: { cookie: freshLogin.headers['Set-Cookie'].split(';')[0] } }, logout);
  assert.equal(fx.accounts[0].tokenVersion, 1);
  assert.equal(fx.refreshes.at(-1).revokedAt != null, true);
});
