const test = require('node:test');
const assert = require('node:assert/strict');
const { createEvaluationSchemaController, createEvaluationSchemaValidationController } = require('../controllers/evaluationSchemaController');

const eventId = '507f1f77bcf86cd799439011';
const schema = {
  title: 'Additional rubric',
  description: '',
  sections: [{
    id: 'new_section',
    name: 'Feasibility',
    description: '',
    fields: [{ id: 'impact_score', type: 'score', label: 'Community impact', description: '', rationale: 'Checks relevance.', required: true, maxMarks: 10, weight: 100 }],
  }],
};

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function fixture({ event = { _id: eventId, name: 'Showcase', type: 'Project Competition', description: 'A community project event.' }, config = { model: 'criteria-based', criteriaBased: { criteria: [{ name: 'Innovation', maxMarks: 50, weight: 100 }] } }, fetchImpl = async () => ({ ok: true, json: async () => ({ evaluationSchema: schema, model: 'gemini-test', promptVersion: 'evaluation-schema-v1' }) }) } = {}) {
  let saved = false;
  let configLookup = null;
  const EventModel = { findById: (id) => ({ lean: async () => id === eventId ? event : null }) };
  const ConfigModel = {
    findOne: (query) => {
      configLookup = query;
      return { lean: async () => config };
    },
    findOneAndUpdate: async () => { saved = true; },
  };
  const handler = createEvaluationSchemaController({ EventModel, ConfigModel, fetchImpl, serviceUrl: 'http://ai.test', isValidId: (id) => id === eventId });
  const validationHandler = createEvaluationSchemaValidationController({ EventModel, ConfigModel, isValidId: (id) => id === eventId });
  return { handler, validationHandler, wasSaved: () => saved, configLookup: () => configLookup };
}

test('generates an event-scoped schema using server event and existing criteria context without saving', async () => {
  let outbound;
  const fx = fixture({ fetchImpl: async (_url, options) => {
    outbound = JSON.parse(options.body);
    return { ok: true, json: async () => ({ evaluationSchema: schema, model: 'gemini-test', promptVersion: 'v1' }) };
  } });
  const res = responseRecorder();
  await fx.handler({ params: { eventId }, body: { prompt: 'Design additional project evaluation fields.' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(outbound.eventName, 'Showcase');
  assert.equal(outbound.eventDescription, 'A community project event.');
  assert.deepEqual(outbound.existingCriteria, ['Innovation']);
  assert.deepEqual(fx.configLookup(), { eventId });
  assert.equal(fx.wasSaved(), false);
  assert.deepEqual(res.body.data.schema, schema);
});

test('rejects invalid event ids and unknown events before calling the AI service', async () => {
  const fx = fixture({ fetchImpl: async () => { throw new Error('should not call'); } });
  const invalid = responseRecorder();
  await fx.handler({ params: { eventId: 'bad' }, body: { prompt: 'Valid description for a rubric.' } }, invalid);
  assert.equal(invalid.statusCode, 400);
  const missing = responseRecorder();
  const missingEventFixture = fixture({ event: null, fetchImpl: async () => { throw new Error('should not call'); } });
  await missingEventFixture.handler({ params: { eventId }, body: { prompt: 'Valid description for a rubric.' } }, missing);
  assert.equal(missing.statusCode, 404);
});

test('rejects invalid prompts and safely reports a stopped AI service connection', async () => {
  const connectionError = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8000'), { code: 'ECONNREFUSED' });
  const fx = fixture({ fetchImpl: async () => { throw connectionError; } });
  const invalid = responseRecorder();
  await fx.handler({ params: { eventId }, body: { prompt: 'short' } }, invalid);
  assert.equal(invalid.statusCode, 400);
  const failed = responseRecorder();
  await fx.handler({ params: { eventId }, body: { prompt: 'Design additional project evaluation fields.' } }, failed);
  assert.equal(failed.statusCode, 503);
  assert.equal(failed.body.code, 'AI_SERVICE_UNAVAILABLE');
  assert.match(failed.body.error, /not running or cannot be reached/i);
  assert.doesNotMatch(failed.body.error, /ECONNREFUSED|127\.0\.0\.1|8000/);
});

test('differentiates evaluation AI timeout, configuration, and invalid request failures safely', async () => {
  const timeout = fixture({ fetchImpl: async () => { throw Object.assign(new Error('deadline'), { name: 'TimeoutError' }); } });
  const timedOut = responseRecorder();
  await timeout.handler({ params: { eventId }, body: { prompt: 'Design evaluation questions for the event.' } }, timedOut);
  assert.equal(timedOut.statusCode, 503);
  assert.equal(timedOut.body.code, 'AI_SERVICE_TIMEOUT');

  const missingKey = fixture({ fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ detail: { code: 'missing_api_key', reason: 'GEMINI_API_KEY is not configured' } }) }) });
  const unconfigured = responseRecorder();
  await missingKey.handler({ params: { eventId }, body: { prompt: 'Design evaluation questions for the event.' } }, unconfigured);
  assert.equal(unconfigured.statusCode, 503);
  assert.match(unconfigured.body.error, /not configured/i);
  assert.doesNotMatch(unconfigured.body.error, /GEMINI_API_KEY/);

  const invalidRequest = fixture({ fetchImpl: async () => ({ ok: false, status: 422, json: async () => ({ detail: [{ loc: ['body'], msg: 'bad request' }] }) }) });
  const rejected = responseRecorder();
  await invalidRequest.handler({ params: { eventId }, body: { prompt: 'Design evaluation questions for the event.' } }, rejected);
  assert.equal(rejected.statusCode, 400);
  assert.equal(rejected.body.code, 'AI_SCHEMA_REQUEST_INVALID');
});

test('rejects invalid or duplicate AI output before returning it', async () => {
  const invalidSchema = { ...schema, sections: [{ ...schema.sections[0], fields: [{ ...schema.sections[0].fields[0], type: 'script' }] }] };
  const fx = fixture({ fetchImpl: async () => ({ ok: true, json: async () => ({ evaluationSchema: invalidSchema }) }) });
  const invalid = responseRecorder();
  await fx.handler({ params: { eventId }, body: { prompt: 'Design additional project evaluation fields.' } }, invalid);
  assert.equal(invalid.statusCode, 502);
  const duplicate = fixture({ fetchImpl: async () => ({ ok: true, json: async () => ({ evaluationSchema: { ...schema, sections: [{ ...schema.sections[0], fields: [{ ...schema.sections[0].fields[0], label: 'Innovation' }] }] } }) }) });
  const rejected = responseRecorder();
  await duplicate.handler({ params: { eventId }, body: { prompt: 'Design additional project evaluation fields.' } }, rejected);
  assert.equal(rejected.statusCode, 502);
});

test('validates organizer edits with the shared schema validator without saving configuration', async () => {
  const fx = fixture();
  const valid = responseRecorder();
  await fx.validationHandler({ params: { eventId }, body: { schema: { ...schema, unknown: 'removed' } } }, valid);
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.body.data.schema.unknown, undefined);
  assert.deepEqual(valid.body.data.schema.sections[0].fields[0], schema.sections[0].fields[0]);
  assert.equal(fx.wasSaved(), false);

  const invalidSchema = structuredClone(schema);
  invalidSchema.sections[0].fields.push({ ...invalidSchema.sections[0].fields[0], id: 'second_score', label: 'community impact' });
  const invalid = responseRecorder();
  await fx.validationHandler({ params: { eventId }, body: { schema: invalidSchema } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.code, 'AI_SCHEMA_INVALID');
  assert.ok(invalid.body.details.some((error) => /duplicate field name/i.test(error)));
  assert.equal(fx.wasSaved(), false);
});
