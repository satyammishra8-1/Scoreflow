const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const events = require('../routes/events');
const teams = require('../routes/teams');
const judges = require('../routes/judges');
const evaluations = require('../routes/evaluation');
const announcements = require('../routes/announcements');
const reports = require('../routes/resultReports');

test('organizer writes and sensitive event reads reject unauthenticated requests', async (t) => {
  const app = express();
  app.use(express.json());
  for (const router of [events, teams, judges, evaluations, announcements, reports]) app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  const cases = [
    ['POST', '/events', {}],
    ['POST', '/teams', {}],
    ['GET', '/events/64b000000000000000000001/analytics'],
    ['GET', '/events/64b000000000000000000001/judges'],
    ['GET', '/events/64b000000000000000000001/announcements'],
    ['GET', '/events/64b000000000000000000001/result-reports'],
    ['POST', '/events/64b000000000000000000001/evaluation/ai-generate', {}],
    ['GET', '/evaluations/64b000000000000000000001'],
  ];
  for (const [method, path, body] of cases) {
    const response = await fetch(root + path, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, 401, `${method} ${path} should require authentication`);
  }
});
