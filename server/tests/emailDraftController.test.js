const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmailDraftController } = require('../controllers/emailDraftController');

const eventId = '64b000000000000000000001';
const event = { _id: eventId, name: 'College Project Exhibition', type: 'Exhibition', description: 'Student projects' };

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}

function setup({ emailType = 'announcements', fetchImpl = async () => ({ ok: true, json: async () => ({ emailDraft: { subject: 'A useful update', body: 'Please review this information.' }, model: 'test-model', promptVersion: 'email-v1' }) }) } = {}) {
  const calls = [];
  const EventModel = { findById(id) { calls.push(['event', id]); return { lean: async () => event }; } };
  const fetchSpy = async (...args) => { calls.push(['fetch', ...args]); return fetchImpl(...args); };
  return {
    calls,
    handler: createEmailDraftController({ emailType, EventModel, fetchImpl: fetchSpy, serviceUrl: 'http://ai.test/' }),
  };
}

test('email draft controller requests content only from the configured AI capability', async (t) => {
  await t.test('announcement includes server event context and audience', async () => {
    const { calls, handler } = setup();
    const res = response();
    await handler({ params: { eventId }, body: { prompt: 'Explain the exhibition schedule clearly.', audienceType: 'teams' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.emailDraft.subject, 'A useful update');
    const [, url, options] = calls.find(([kind]) => kind === 'fetch');
    assert.equal(url, 'http://ai.test/emails/announcements/generate');
    assert.deepEqual(JSON.parse(options.body), {
      prompt: 'Explain the exhibition schedule clearly.', eventName: event.name,
      eventType: event.type, eventDescription: event.description, audienceType: 'teams',
    });
    assert.equal(options.method, 'POST');
  });

  await t.test('invitation uses its separate capability and never calls a delivery service', async () => {
    const { calls, handler } = setup({ emailType: 'judge-invitations' });
    const res = response();
    await handler({ params: { eventId }, body: { prompt: 'Invite judges warmly to evaluate projects.' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.filter(([kind]) => kind === 'fetch').length, 1);
    const [, url, options] = calls.find(([kind]) => kind === 'fetch');
    assert.equal(url, 'http://ai.test/emails/judge-invitations/generate');
    assert.equal(JSON.parse(options.body).eventName, event.name);
  });

  await t.test('rejects invalid input before contacting AI', async () => {
    const { calls, handler } = setup();
    const res = response();
    await handler({ params: { eventId: 'bad-id' }, body: { prompt: 'short', audienceType: 'teams' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(calls.filter(([kind]) => kind === 'fetch').length, 0);
  });

  await t.test('reports service failure and rejects malformed drafts', async () => {
    const unavailable = setup({ emailType: 'judge-invitations', fetchImpl: async () => { throw new Error('offline'); } });
    const unavailableResponse = response();
    await unavailable.handler({ params: { eventId }, body: { prompt: 'Invite judges warmly to evaluate projects.' } }, unavailableResponse);
    assert.equal(unavailableResponse.statusCode, 503);

    const invalid = setup({ fetchImpl: async () => ({ ok: true, json: async () => ({ emailDraft: { subject: '', body: '' } }) }) });
    const invalidResponse = response();
    await invalid.handler({ params: { eventId }, body: { prompt: 'Invite judges warmly to evaluate projects.', audienceType: 'judges' } }, invalidResponse);
    assert.equal(invalidResponse.statusCode, 502);
  });

  await t.test('explains AI service connectivity and missing provider configuration safely', async () => {
    const unavailable = setup({ fetchImpl: async () => { throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8000'), { code: 'ECONNREFUSED' }); } });
    const unavailableResponse = response();
    await unavailable.handler({ params: { eventId }, body: { prompt: 'Send a useful event schedule update.', audienceType: 'judges' } }, unavailableResponse);
    assert.equal(unavailableResponse.statusCode, 503);
    assert.match(unavailableResponse.body.error, /not running or cannot be reached/i);
    assert.doesNotMatch(unavailableResponse.body.error, /ECONNREFUSED|127\.0\.0\.1/);

    const unconfigured = setup({ fetchImpl: async () => ({
      ok: false, status: 503,
      json: async () => ({ detail: { code: 'missing_api_key', reason: 'GEMINI_API_KEY is not configured' } }),
    }) });
    const unconfiguredResponse = response();
    await unconfigured.handler({ params: { eventId }, body: { prompt: 'Send a useful event schedule update.', audienceType: 'judges' } }, unconfiguredResponse);
    assert.equal(unconfiguredResponse.statusCode, 503);
    assert.match(unconfiguredResponse.body.error, /not configured/i);
    assert.doesNotMatch(unconfiguredResponse.body.error, /GEMINI_API_KEY/);
  });

  await t.test('reports rejected AI requests without exposing provider internals', async () => {
    const invalid = setup({ fetchImpl: async () => ({
      ok: false, status: 422,
      json: async () => ({ detail: [{ loc: ['body', 'audienceType'], msg: 'Input should be judges or teams' }] }),
    }) });
    const invalidResponse = response();
    await invalid.handler({ params: { eventId }, body: { prompt: 'Send a useful event schedule update.', audienceType: 'judges' } }, invalidResponse);
    assert.equal(invalidResponse.statusCode, 400);
    assert.match(invalidResponse.body.error, /rejected this email request/i);
    assert.doesNotMatch(invalidResponse.body.error, /loc|input should be/i);
  });
});
