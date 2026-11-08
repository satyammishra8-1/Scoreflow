const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { createAuthRouter } = require('../routes/auth');
const { createAuthController } = require('../controllers/authController');
const authDatabaseUri = process.env.SCOREFLOW_AUTH_TEST_MONGODB_URI;

test('database-backed signup, login, refresh, logout, protected access, and organizer isolation', { skip: !authDatabaseUri }, async () => {
  const url = new URL(authDatabaseUri);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  assert.match(databaseName, /^scoreflow_auth_test_[a-f0-9]{12}$/i, 'integration tests require a unique isolated test database');
  const accessSecret = crypto.randomBytes(48).toString('base64url');
  const refreshSecret = crypto.randomBytes(48).toString('base64url');
  process.env.JWT_ACCESS_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = refreshSecret;

  let appServer;
  try {
    await mongoose.connect(authDatabaseUri);
    const Organizer = require('../models/OrganizerAccount');
    const RefreshSession = require('../models/RefreshSession');
    const Event = require('../models/Event');
    await Promise.all([Organizer.syncIndexes(), RefreshSession.syncIndexes(), Event.syncIndexes()]);
    const app = express();
    app.use(express.json());
    app.use('/api', createAuthRouter({ controller: createAuthController() }));
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

    const createAccount = (name, email, password) => request('/auth/organizer/register', { method: 'POST', body: { name, email, password, confirmPassword: 'must-not-be-stored' } });
    const ownerPassword = 'owner-password-123';
    const ownerSignup = await createAccount('Owner', ' Owner@ScoreFlow-Test.Invalid ', ownerPassword);
    assert.equal(ownerSignup.response.status, 201);
    assert.ok(ownerSignup.cookie);
    assert.equal(ownerSignup.body.data.role, 'organizer');
    const owner = await Organizer.findOne({ email: 'owner@scoreflow-test.invalid' }).select('+passwordHash');
    assert.ok(owner);
    assert.equal(owner.email, 'owner@scoreflow-test.invalid');
    assert.ok(await bcrypt.compare(ownerPassword, owner.passwordHash));
    assert.notEqual(owner.passwordHash, ownerPassword);
    assert.equal(owner.confirmPassword, undefined);
    assert.equal((await createAccount('Duplicate', 'OWNER@scoreflow-test.invalid', 'different-password')).response.status, 409);

    const ownerMe = await request('/auth/organizer/me', { token: ownerSignup.body.data.accessToken });
    assert.equal(ownerMe.response.status, 200);
    assert.equal(ownerMe.body.data.email, 'owner@scoreflow-test.invalid');
    const anonymousEvents = await request('/events');
    assert.equal(anonymousEvents.response.status, 401);
    const ownerEvent = await request('/events', { method: 'POST', token: ownerSignup.body.data.accessToken, body: { name: 'Owner event', type: 'Hackathon', date: '2027-01-01', venue: 'Test', description: 'isolated test' } });
    assert.equal(ownerEvent.response.status, 201);

    const secondPassword = 'second-password-456';
    const secondSignup = await createAccount('Second', 'second@scoreflow-test.invalid', secondPassword);
    assert.equal(secondSignup.response.status, 201);
    assert.equal((await request(`/events/${ownerEvent.body.data.eventId}`, { token: secondSignup.body.data.accessToken })).response.status, 404);
    assert.equal((await request('/auth/organizer/login', { method: 'POST', body: { email: 'second@scoreflow-test.invalid', password: 'wrong-password' } })).response.status, 401);

    const ownerLogin = await request('/auth/organizer/login', { method: 'POST', body: { email: ' OWNER@scoreflow-test.invalid ', password: ownerPassword } });
    assert.equal(ownerLogin.response.status, 200);
    assert.ok(ownerLogin.cookie);
    const rotated = await request('/auth/refresh', { method: 'POST', cookie: ownerLogin.cookie });
    assert.equal(rotated.response.status, 200);
    assert.notEqual(rotated.cookie, ownerLogin.cookie);
    assert.equal((await request('/auth/refresh', { method: 'POST', cookie: ownerLogin.cookie })).response.status, 401);

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
