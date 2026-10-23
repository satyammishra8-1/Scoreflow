const test = require('node:test');
const assert = require('node:assert/strict');
const { createEvaluationSchemaController } = require('../controllers/evaluationSchemaController');

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
  return { handler, wasSaved: () => saved, configLookup: () => configLookup };
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

test('rejects invalid prompt payloads and handles AI service failures safely', async () => {
  const fx = fixture({ fetchImpl: async () => { throw new Error('private provider error'); } });
  const invalid = responseRecorder();
  await fx.handler({ params: { eventId }, body: { prompt: 'short' } }, invalid);
  assert.equal(invalid.statusCode, 400);
  const failed = responseRecorder();
  await fx.handler({ params: { eventId }, body: { prompt: 'Design additional project evaluation fields.' } }, failed);
  assert.equal(failed.statusCode, 503);
  assert.doesNotMatch(failed.body.error, /private provider error/);
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
