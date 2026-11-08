const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createAuthController, authConfigurationReady } = require('../controllers/authController');

const accessSecret = 'test-access-secret-that-is-long-enough-32-bytes';
const refreshSecret = 'test-refresh-secret-that-is-long-enough-32-bytes';

test('authentication requires two distinct secrets of at least 32 bytes', (t) => {
  const previous = [process.env.JWT_ACCESS_SECRET, process.env.JWT_REFRESH_SECRET];
  t.after(() => ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].forEach((key, i) => previous[i] === undefined ? delete process.env[key] : process.env[key] = previous[i]));
  process.env.JWT_ACCESS_SECRET = 'short';
  process.env.JWT_REFRESH_SECRET = refreshSecret;
  assert.equal(authConfigurationReady(), false);
  process.env.JWT_ACCESS_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = accessSecret;
  assert.equal(authConfigurationReady(), false);
  process.env.JWT_REFRESH_SECRET = refreshSecret;
  assert.equal(authConfigurationReady(), true);
});

function fixture() {
  const accounts = [];
  const judges = [];
  const refreshes = [];
  const registrations = [];
  let verificationToken = '';
  const organizerModel = {
    findOne: (query) => {
      const result = accounts.find((item) => item.email === query.email && (!query.active || item.active === query.active)) || null;
      return { select: async () => result, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    },
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
  const registrationModel = {
    deleteMany: async ({ email }) => { for (let i = registrations.length - 1; i >= 0; i -= 1) if (registrations[i].email === email) registrations.splice(i, 1); },
    create: async (item) => { registrations.push(item); return item; },
    deleteOne: async ({ email, tokenHash }) => { const i = registrations.findIndex((entry) => entry.email === email && entry.tokenHash === tokenHash); if (i >= 0) registrations.splice(i, 1); },
    findOneAndDelete: ({ tokenHash, expiresAt }) => ({ select: async () => {
      const i = registrations.findIndex((entry) => entry.tokenHash === tokenHash && entry.expiresAt > expiresAt.$gt);
      return i < 0 ? null : registrations.splice(i, 1)[0];
    } }),
  };
  const controller = createAuthController({ OrganizerModel: organizerModel, JudgeModel: judgeModel, RefreshModel: refreshModel, RegistrationModel: registrationModel, sendOrganizerVerification: async ({ token }) => { verificationToken = token; return { sent: true }; } });
  const response = () => ({ statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, append(key, value) { this.headers[key] = value; } });
  return { controller, accounts, judges, refreshes, registrations, response, get verificationToken() { return verificationToken; } };
}

test('organizer signup verifies allowlisted email ownership before creating an account', async (t) => {
  const env = { allowlist: process.env.ORGANIZER_EMAIL_ALLOWLIST, access: process.env.JWT_ACCESS_SECRET, refresh: process.env.JWT_REFRESH_SECRET };
  process.env.ORGANIZER_EMAIL_ALLOWLIST = 'owner@example.test,leader@example.test';
  process.env.JWT_ACCESS_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = refreshSecret;
  t.after(() => {
    for (const [key, value] of Object.entries({ ORGANIZER_EMAIL_ALLOWLIST: env.allowlist, JWT_ACCESS_SECRET: env.access, JWT_REFRESH_SECRET: env.refresh })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const fx = fixture();
  const blocked = fx.response();
  await fx.controller.organizerRegister({ body: { name: 'Attacker', email: 'attacker@example.test', password: 'a-strong-test-password' } }, blocked);
  assert.equal(blocked.statusCode, 202);
  assert.equal(fx.registrations.length, 0);
  assert.equal(fx.verificationToken, '');
  const missingName = fx.response();
  await fx.controller.organizerRegister({ body: { email: 'owner@example.test', password: 'A-strong-test-password1' } }, missingName);
  assert.equal(missingName.statusCode, 400);
  const weakPassword = fx.response();
  await fx.controller.organizerRegister({ body: { name: 'Owner', email: 'owner@example.test', password: 'short' } }, weakPassword);
  assert.equal(weakPassword.statusCode, 400);
  const requested = fx.response();
  await fx.controller.organizerRegister({ body: { name: 'Owner', email: 'owner@example.test', password: 'A-strong-test-password1' } }, requested);
  assert.equal(requested.statusCode, 202);
  assert.equal(requested.body.data, undefined);
  assert.equal(fx.accounts.length, 0);
  assert.equal(fx.registrations.length, 1);
  const created = fx.response();
  assert.notEqual(fx.registrations[0].passwordHash, 'A-strong-test-password1');
  await fx.controller.verifyOrganizer({ body: { token: fx.verificationToken } }, created);
  assert.equal(created.statusCode, 200);
  assert.equal(created.body.data, undefined);
  assert.equal(fx.accounts.length, 1);
  assert.notEqual(fx.accounts[0].passwordHash, 'A-strong-test-password1');
  assert.equal(fx.accounts[0].name, 'Owner');
  const replay = fx.response();
  await fx.controller.verifyOrganizer({ body: { token: fx.verificationToken } }, replay);
  assert.equal(replay.statusCode, 400);
  const duplicate = fx.response();
  await fx.controller.organizerRegister({ body: { name: 'Owner', email: 'owner@example.test', password: 'A-strong-test-password1' } }, duplicate);
  assert.equal(duplicate.statusCode, 409);
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
  fx.accounts.push({ _id: 'org-1', name: 'Owner', email: 'owner@example.test', passwordHash, tokenVersion: 0, active: true });
  fx.accounts.push({ _id: 'org-2', email: 'leader@example.test', passwordHash, tokenVersion: 0, active: false });
  const denied = fx.response();
  await fx.controller.organizerLogin({ body: { email: 'other@example.test', password: 'correct-password-here' } }, denied);
  assert.equal(denied.statusCode, 401);
  const invalid = fx.response();
  await fx.controller.organizerLogin({ body: { email: 'owner@example.test', password: 'wrong-password' } }, invalid);
  assert.equal(invalid.statusCode, 401);
  const disabled = fx.response();
  await fx.controller.organizerLogin({ body: { email: 'leader@example.test', password: 'correct-password-here' } }, disabled);
  assert.equal(disabled.statusCode, 401);
  const missing = fx.response();
  await fx.controller.organizerLogin({ body: {} }, missing);
  assert.equal(missing.statusCode, 401);
  const valid = fx.response();
  await fx.controller.organizerLogin({ body: { email: 'owner@example.test', password: 'correct-password-here' } }, valid);
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.body.data.role, 'organizer');
  assert.equal(valid.body.data.name, 'Owner');
});

test('there is no independent judge password login API', () => {
  const { controller } = fixture();
  assert.equal(controller.judgeLogin, undefined);
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
