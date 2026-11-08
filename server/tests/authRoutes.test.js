const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createServer } = require('node:http');
const { createAuthRouter } = require('../routes/auth');

test('public organizer registration route is rate limited', async (t) => {
  const app = express();
  app.use(express.json());
  let requests = 0;
  app.use('/api', createAuthRouter({ controller: {
    organizerRegister(_req, res) { requests += 1; return res.status(201).json({ success: true }); },
    organizerLogin(_req, res) { return res.status(200).json({ success: true }); },
    refresh(_req, res) { return res.status(200).json({ success: true }); },
    logout(_req, res) { return res.status(200).json({ success: true }); },
    organizerMe(_req, res) { return res.status(200).json({ success: true }); },
    judgeEventProfile(_req, res) { return res.status(200).json({ success: true }); },
  } }));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const { port } = server.address();
  const statuses = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/organizer/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
    });
    statuses.push(response.status);
  }
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
  assert.equal(requests, 5);
});
