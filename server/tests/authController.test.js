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
  const organizerModel = {
    findOne: (query) => {
      const result = accounts.find((item) => item.email === query.email && (!query.active || item.active === query.active)) || null;
      return { select: async () => result, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    },
    findById: async (id) => accounts.find((item) => String(item._id) === String(id)) || null,
    create: async (value) => {
      if (accounts.some((item) => item.email === value.email)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      const item = { _id: `org-${accounts.length + 1}`, tokenVersion: 0, active: true, ...value };
      accounts.push(item);
      return item;
    },
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

function useTestSecrets(t) {
  const previous = [process.env.JWT_ACCESS_SECRET, process.env.JWT_REFRESH_SECRET];
  process.env.JWT_ACCESS_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = refreshSecret;
  t.after(() => ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].forEach((key, i) => previous[i] === undefined ? delete process.env[key] : process.env[key] = previous[i]));
}

test('organizer signup normalizes email, hashes password, and immediately establishes a session', async (t) => {
  useTestSecrets(t);
  const fx = fixture();
  const created = fx.response();
  await fx.controller.organizerRegister({ body: { name: ' Owner ', email: ' Owner@Example.Test ', password: 'short-but-valid' , confirmPassword: 'frontend-only' } }, created);
  assert.equal(created.statusCode, 201);
  assert.equal(fx.accounts.length, 1);
  assert.equal(fx.accounts[0].email, 'owner@example.test');
  assert.equal(fx.accounts[0].name, 'Owner');
  assert.notEqual(fx.accounts[0].passwordHash, 'short-but-valid');
  assert.ok(await bcrypt.compare('short-but-valid', fx.accounts[0].passwordHash));
  assert.equal(Object.hasOwn(fx.accounts[0], 'confirmPassword'), false);
  assert.equal(created.body.data.role, 'organizer');
  assert.equal(created.body.data.email, 'owner@example.test');
  assert.match(created.headers['Set-Cookie'], /HttpOnly/);

  const duplicate = fx.response();
  await fx.controller.organizerRegister({ body: { name: 'Owner', email: 'OWNER@example.test', password: 'another-valid-password' } }, duplicate);
  assert.equal(duplicate.statusCode, 409);
});

test('organizer signup validates required fields, email, and eight character password minimum', async (t) => {
  useTestSecrets(t);
  const fx = fixture();
  for (const [body, expectedStatus] of [
    [{ email: 'a@example.test', password: 'password8' }, 400],
    [{ name: 'Owner', email: 'bad-email', password: 'password8' }, 400],
    [{ name: 'Owner', email: 'a@example.test', password: 'short' }, 400],
  ]) {
    const response = fx.response();
    await fx.controller.organizerRegister({ body }, response);
    assert.equal(response.statusCode, expectedStatus);
  }
  assert.equal(fx.accounts.length, 0);
});

test('organizer login normalizes email, compares bcrypt, and rejects bad or inactive credentials', async (t) => {
  useTestSecrets(t);
  const fx = fixture();
  const hash = await bcrypt.hash('correct-password-here', 4);
  fx.accounts.push({ _id: 'org-1', name: 'Owner', email: 'owner@example.test', passwordHash: hash, tokenVersion: 0, active: true });
  fx.accounts.push({ _id: 'org-2', email: 'inactive@example.test', passwordHash: hash, tokenVersion: 0, active: false });
  const invalid = fx.response();
  await fx.controller.organizerLogin({ body: { email: ' owner@example.test ', password: 'wrong-password' } }, invalid);
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.body.error, 'Email or password is incorrect.');
  const inactive = fx.response();
  await fx.controller.organizerLogin({ body: { email: 'inactive@example.test', password: 'correct-password-here' } }, inactive);
  assert.equal(inactive.statusCode, 401);
  const valid = fx.response();
  await fx.controller.organizerLogin({ body: { email: ' OWNER@example.test ', password: 'correct-password-here' } }, valid);
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.body.data.role, 'organizer');
});

test('there is no organizer verification flow or independent judge password login API', () => {
  const { controller } = fixture();
  assert.equal(controller.verifyOrganizer, undefined);
  assert.equal(controller.judgeLogin, undefined);
});

test('refresh rotates opaque cookie tokens, detects reuse and logout revokes active sessions', async (t) => {
  useTestSecrets(t);
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
