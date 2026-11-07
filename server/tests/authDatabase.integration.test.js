const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createAuthRouter } = require('../routes/auth');
const { createAuthController } = require('../controllers/authController');
const authDatabaseUri = process.env.SCOREFLOW_AUTH_TEST_MONGODB_URI;

test('database-backed organizer authentication and event isolation', { skip: !authDatabaseUri }, async () => {
  const url = new URL(authDatabaseUri);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  assert.match(databaseName, /^scoreflow_auth_test_[a-f0-9]{12}$/i, 'integration tests require a unique isolated test database');
  const accessSecret = crypto.randomBytes(48).toString('base64url');
  const refreshSecret = crypto.randomBytes(48).toString('base64url');
  assert.notEqual(accessSecret, refreshSecret);
  process.env.JWT_ACCESS_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = refreshSecret;
  process.env.ORGANIZER_EMAIL_ALLOWLIST = 'owner@scoreflow-test.invalid,second@scoreflow-test.invalid,expired@scoreflow-test.invalid';

  let appServer;
  try {
    await mongoose.connect(authDatabaseUri);
    const models = [
      require('../models/OrganizerAccount'), require('../models/OrganizerRegistration'),
      require('../models/RefreshSession'), require('../models/Event'),
    ];
    await Promise.all(models.map((model) => model.syncIndexes()));
    const verificationTokens = new Map();
    const controller = createAuthController({ sendOrganizerVerification: async ({ email, token }) => {
      verificationTokens.set(email, token);
      return { sent: true };
    } });
    const app = express();
    app.use(express.json());
    app.use('/api', createAuthRouter({ controller }));
    app.use('/api', require('../routes/events'));
    appServer = await new Promise((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
    const base = `http://127.0.0.1:${appServer.address().port}/api`;
    const request = async (path, { method = 'GET', body, token, cookie } = {}) => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(cookie ? { cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { response, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
    };

    const notAllowed = await request('/auth/organizer/register', { method: 'POST', body: { name: 'Intruder', email: 'intruder@invalid.test', password: 'a-strong-test-password' } });
    assert.equal(notAllowed.response.status, 202);
    assert.equal(verificationTokens.has('intruder@invalid.test'), false);
    const expiredToken = crypto.randomBytes(32).toString('base64url');
    await mongoose.model('OrganizerRegistration').create({
      name: 'Expired', email: 'expired@scoreflow-test.invalid',
      passwordHash: await bcrypt.hash('Expired-password-123', 12),
      tokenHash: crypto.createHash('sha256').update(expiredToken).digest('hex'),
      expiresAt: new Date(Date.now() - 60_000),
    });
    assert.equal((await request('/auth/organizer/verify', { method: 'POST', body: { token: expiredToken } })).response.status, 400);
    const register = async (name, email, password) => request('/auth/organizer/register', { method: 'POST', body: { name, email, password } });
    const ownerPassword = 'Owner-password-123';
    const ownerRegistration = await register('Owner', 'owner@scoreflow-test.invalid', ownerPassword);
    assert.equal(ownerRegistration.response.status, 202);
    assert.equal(ownerRegistration.body.data, undefined);
    assert.equal(await mongoose.model('OrganizerAccount').countDocuments({}), 0);
    const pending = await mongoose.model('OrganizerRegistration').findOne({ email: 'owner@scoreflow-test.invalid' }).select('+passwordHash');
    assert.ok(await bcrypt.compare(ownerPassword, pending.passwordHash));
    assert.equal((await request('/auth/organizer/login', { method: 'POST', body: { email: 'owner@scoreflow-test.invalid', password: ownerPassword } })).response.status, 401);
    const ownerToken = verificationTokens.get('owner@scoreflow-test.invalid');
    assert.ok(ownerToken);
    const ownerVerify = await request('/auth/organizer/verify', { method: 'POST', body: { token: ownerToken } });
    assert.equal(ownerVerify.response.status, 200);
    assert.equal(ownerVerify.body.data, undefined);
    assert.equal(await mongoose.model('OrganizerAccount').countDocuments({ email: 'owner@scoreflow-test.invalid' }), 1);
    assert.equal((await request('/auth/organizer/verify', { method: 'POST', body: { token: ownerToken } })).response.status, 400);
    assert.equal((await register('Owner', 'owner@scoreflow-test.invalid', ownerPassword)).response.status, 409);

    assert.equal((await request('/auth/organizer/login', { method: 'POST', body: { email: 'owner@scoreflow-test.invalid', password: 'wrong-password' } })).response.status, 401);
    const ownerLogin = await request('/auth/organizer/login', { method: 'POST', body: { email: 'owner@scoreflow-test.invalid', password: ownerPassword } });
    assert.equal(ownerLogin.response.status, 200);
    assert.ok(ownerLogin.cookie);
    const ownerAccess = ownerLogin.body.data.accessToken;
    assert.equal((await request('/auth/organizer/me', { token: ownerLogin.body.data.accessToken })).body.data.email, 'owner@scoreflow-test.invalid');
    const expired = jwt.sign({ sub: ownerLogin.body.data.accessToken && (await mongoose.model('OrganizerAccount').findOne({ email: 'owner@scoreflow-test.invalid' })).id, role: 'organizer', email: 'owner@scoreflow-test.invalid', ver: 0, sessionType: 'organizer' }, accessSecret, { algorithm: 'HS256', expiresIn: -1, issuer: 'scoreflow', audience: 'scoreflow-api' });
    assert.equal((await request('/auth/organizer/me', { token: expired })).response.status, 401);
    assert.equal((await request('/events')).response.status, 401);

    const createdEvent = await request('/events', { method: 'POST', token: ownerAccess, body: { name: 'Owner event', type: 'Hackathon', date: '2027-01-01', venue: 'Test', description: 'Isolated test event' } });
    assert.equal(createdEvent.response.status, 201);
    assert.equal(createdEvent.body.data.ownerId, undefined);
    const secondPassword = 'Second-password-456';
    const secondRegistration = await register('Second', 'second@scoreflow-test.invalid', secondPassword);
    assert.equal(secondRegistration.response.status, 202);
    const secondVerify = await request('/auth/organizer/verify', { method: 'POST', body: { token: verificationTokens.get('second@scoreflow-test.invalid') } });
    assert.equal(secondVerify.response.status, 200);
    assert.equal(await mongoose.model('OrganizerAccount').countDocuments({ email: 'second@scoreflow-test.invalid' }), 1);
    const secondLogin = await request('/auth/organizer/login', { method: 'POST', body: { email: 'second@scoreflow-test.invalid', password: secondPassword } });
    assert.equal(secondLogin.response.status, 200);
    const secondEvents = await request('/events', { token: secondLogin.body.data.accessToken });
    assert.equal(secondEvents.response.status, 200);
    assert.equal(secondEvents.body.data.length, 0);
    assert.equal((await request(`/events/${createdEvent.body.data.eventId}`, { token: secondLogin.body.data.accessToken })).response.status, 404);

    const firstRefresh = await request('/auth/refresh', { method: 'POST', cookie: ownerLogin.cookie });
    assert.equal(firstRefresh.response.status, 200);
    assert.notEqual(firstRefresh.cookie, ownerLogin.cookie);
    assert.equal((await request('/auth/refresh', { method: 'POST', cookie: ownerLogin.cookie })).response.status, 401);
    assert.equal((await request('/auth/refresh', { method: 'POST', cookie: firstRefresh.cookie })).response.status, 401);
    const fresh = await request('/auth/organizer/login', { method: 'POST', body: { email: 'owner@scoreflow-test.invalid', password: ownerPassword } });
    assert.equal(fresh.response.status, 200);
    assert.equal((await request('/auth/logout', { method: 'POST', cookie: fresh.cookie })).response.status, 200);
    assert.equal((await request('/auth/refresh', { method: 'POST', cookie: fresh.cookie })).response.status, 401);
  } finally {
    if (appServer) await new Promise((resolve) => appServer.close(resolve));
    if (mongoose.connection.readyState) {
      if (/^scoreflow_auth_test_[a-f0-9]{12}$/i.test(mongoose.connection.name)) await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
