const test = require('node:test');
const assert = require('node:assert/strict');
const { createResultReportController, buildReportEvidence, reportIsQualitative } = require('../controllers/resultReportController');
const ResultReport = require('../models/ResultReport');

const eventId = '64b000000000000000000001';
const otherEventId = '64b000000000000000000002';
const teamId = '64b000000000000000000021';
const otherTeamId = '64b000000000000000000022';
const judgeOneId = '64b000000000000000000031';
const judgeTwoId = '64b000000000000000000032';
const criteria = [
  { id: 'innovation', name: 'Innovation', maxMarks: 30, weight: 30 },
  { id: 'technical', name: 'Technical', maxMarks: 40, weight: 40 },
  { id: 'presentation', name: 'Presentation', maxMarks: 20, weight: 20 },
  { id: 'impact', name: 'Impact', maxMarks: 10, weight: 10 },
];
const scoreSet = (values) => Object.fromEntries(values.map((value, index) => [criteria[index].id, value]));
const team = { _id: teamId, eventId, teamNumber: '1', teamName: 'NovaTech' };
const judges = [
  { _id: judgeOneId, eventId, name: 'Judge One', assignedTeamIds: [teamId] },
  { _id: judgeTwoId, eventId, name: 'Judge Two', assignedTeamIds: [teamId] },
];
const evaluations = [
  { _id: '64b000000000000000000041', eventId, teamId, judgeId: judgeOneId, status: 'COMPLETED', scores: scoreSet([27, 35, 17, 8]), feedback: 'Strong project framing.' },
  { _id: '64b000000000000000000042', eventId, teamId, judgeId: judgeTwoId, status: 'COMPLETED', scores: scoreSet([25, 3, 3.5, 2]), feedback: 'Improve the technical implementation.' },
];
const config = { eventId, model: 'criteria-based', criteriaBased: { criteria } };
const generatedReport = {
  summary: 'The team submitted a thoughtful project.',
  strengths: ['The project framing is clear.'],
  weaknesses: ['The technical implementation would benefit from clearer validation.'],
  improvementSuggestions: ['Document technical testing.'],
  priorityAreas: ['Technical implementation'],
  judgeFeedbackSummary: 'Judges noted clear framing and a need for stronger technical work.',
  finalRemarks: 'Continue testing and validating the implementation.',
};

function mockController({ pending = false, outsideTeam = false, fetchImpl, configValue = config, teamValue = team, evaluationRows = evaluations } = {}) {
  const stored = new Map();
  let writes = 0;
  let lastInput = null;
  const eventModel = { findById: (id) => ({ lean: async () => String(id) === eventId ? { _id: eventId, name: 'TechNova Hackathon', type: 'Hackathon' } : null }) };
  const teamModel = {
    findOne: (query) => ({ lean: async () => String(query._id) === teamId && String(query.eventId) === eventId
      ? (outsideTeam ? null : teamValue) : null }),
  };
  const judgeModel = { find: () => ({ lean: async () => judges }) };
  const evaluationModel = { find: () => ({ lean: async () => pending ? evaluationRows.slice(0, 1) : structuredClone(evaluationRows) }) };
  const configModel = { findOne: () => ({ lean: async () => configValue }) };
  const reportModel = {
    findOneAndUpdate: async (filter, update) => {
      writes += 1;
      const key = `${filter.event}:${filter.team}`;
      const old = stored.get(key) || { _id: '64b000000000000000000099', event: filter.event, team: filter.team };
      const value = { ...old, ...update.$set };
      stored.set(key, value);
      return value;
    },
  };
  const controller = createResultReportController({
    EventModel: eventModel,
    TeamModel: teamModel,
    JudgeModel: judgeModel,
    EvaluationModel: evaluationModel,
    ConfigModel: configModel,
    ReportModel: reportModel,
    fetchImpl: fetchImpl || (async (_url, options) => {
      lastInput = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ report: generatedReport, model: 'test-model', promptVersion: 'result-report-v1' }) };
    }),
  });
  return { controller, stored, get writes() { return writes; }, get lastInput() { return lastInput; } };
}

test('report schema enforces one report per event and team', () => {
  const uniqueIndex = ResultReport.schema.indexes().find(([fields, options]) => fields.event === 1 && fields.team === 1 && options.unique);
  assert.ok(uniqueIndex);
});

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}

async function generate(fixture, useEventId = eventId, useTeamId = teamId) {
  const res = response();
  await fixture.controller.generateReport({ params: { eventId: useEventId, teamId: useTeamId } }, res);
  return res;
}

test('completed team generates a qualitative report without sending score data', async () => {
  const before = structuredClone(evaluations);
  const fixture = mockController();
  const res = await generate(fixture);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.teamId, teamId);
  assert.equal(res.body.data.eventId, eventId);
  assert.equal(Object.hasOwn(res.body.data, 'finalScore'), false);
  assert.deepEqual(fixture.lastInput.evaluationAreas, criteria.map((item) => item.name));
  assert.equal(JSON.stringify(fixture.lastInput).match(/\d/g), null);
  for (const forbidden of ['teamNumber', 'finalScore', 'scoreMaximum', 'criteriaScores', 'rank', 'judgeScores', 'weight']) {
    assert.equal(JSON.stringify(fixture.lastInput).includes(`"${forbidden}"`), false);
  }
  assert.deepEqual(evaluations, before, 'report generation must not modify evaluation scores');
  assert.equal(fixture.writes, 1);
});

test('pending teams cannot generate reports or call the AI service', async () => {
  let called = false;
  const fixture = mockController({ pending: true, fetchImpl: async () => { called = true; } });
  const res = await generate(fixture);
  assert.equal(res.statusCode, 409);
  assert.equal(called, false);
  assert.equal(fixture.writes, 0);
  assert.match(res.body.error, /completed evaluations/i);
});

test('team and event mismatch is rejected before generation', async () => {
  const fixture = mockController({ outsideTeam: true });
  const res = await generate(fixture, eventId, otherTeamId);
  assert.equal(res.statusCode, 404);
  assert.equal(fixture.writes, 0);
});

test('regeneration updates the same event/team report record', async () => {
  const fixture = mockController();
  await generate(fixture);
  await generate(fixture);
  assert.equal(fixture.writes, 2);
  assert.equal(fixture.stored.size, 1);
});

test('AI service outage and malformed output are returned as errors without saving', async (t) => {
  await t.test('unavailable service', async () => {
    const fixture = mockController({ fetchImpl: async () => { throw new Error('connection refused'); } });
    const res = await generate(fixture);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'AI_SERVICE_UNAVAILABLE');
    assert.equal(fixture.writes, 0);
  });
  await t.test('invalid response structure', async () => {
    const fixture = mockController({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ report: { summary: 'incomplete' }, model: 'test' }) }) });
    const res = await generate(fixture);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.code, 'AI_INVALID_RESPONSE');
    assert.equal(fixture.writes, 0);
  });
  await t.test('provider key is missing', async () => {
    const fixture = mockController({ fetchImpl: async () => ({ ok: false, status: 503 }) });
    const res = await generate(fixture);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'AI_PROVIDER_UNAVAILABLE');
    assert.equal(fixture.writes, 0);
  });
  await t.test('provider request fails', async () => {
    const fixture = mockController({ fetchImpl: async () => ({ ok: false, status: 502 }) });
    const res = await generate(fixture);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.code, 'AI_PROVIDER_ERROR');
    assert.equal(fixture.writes, 0);
  });
  await t.test('structured Gemini quota error is passed through safely', async () => {
    const fixture = mockController({ fetchImpl: async () => ({
      ok: false,
      status: 502,
      json: async () => ({ detail: { provider: 'gemini', code: 'quota_exhausted', reason: 'Gemini quota exhausted or rate limit reached' } }),
    }) });
    const res = await generate(fixture);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.code, 'AI_QUOTA_EXHAUSTED');
    assert.deepEqual(res.body.providerError, {
      provider: 'gemini', type: 'quota_exhausted', reason: 'Gemini quota exhausted or rate limit reached',
    });
    assert.equal(fixture.writes, 0);
  });
});

test('unknown event fails validation and does not leak another event result', async () => {
  const fixture = mockController();
  const res = await generate(fixture, otherEventId, teamId);
  assert.equal(res.statusCode, 404);
  assert.equal(fixture.writes, 0);
});

test('all six evaluation types can generate reports from qualitative-only evidence', async () => {
  const cases = [
    ['criteria-based', { criteriaBased: { criteria: [{ name: 'Technical quality', maxMarks: 20, weight: 50 }] } }],
    ['open-holistic', { openHolistic: { githubReview: true, projectReview: true } }],
    ['remote-async', { remoteAsync: { materials: [{ label: 'Documentation', url: 'https://example.test/doc' }] } }],
    ['live-demo', { liveDemo: { demoEvaluation: true, presentationEvaluation: true, judgeQuestions: true, criteria: [{ name: 'Clarity', maxMarks: 10, weight: 50 }] } }],
    ['ranking-voting', { rankingVoting: { ranking: true, comments: true } }],
    ['custom', { custom: { fields: [
      { type: 'criteria', label: 'Innovation' }, { type: 'marks', label: 'Impact' },
      { type: 'question', label: 'Technical approach' }, { type: 'material', label: 'Demo reviewed' },
    ] } }],
  ];
  for (const [model, configFields] of cases) {
    const fixture = mockController({ configValue: { eventId, model, ...configFields } });
    const responseForType = await generate(fixture);
    assert.equal(responseForType.statusCode, 200, `${model} report generation`);
    const context = buildReportEvidence({
      event: { name: 'Showcase', type: 'Demo' },
      team: { teamName: 'Nova', project: 'A clear project description', githubUrl: 'https://example.test/repo', demoUrl: 'https://example.test/demo' },
      config: { eventId, model, ...configFields },
      judgeRows: [{ evaluation: {
        feedback: 'Strong implementation. Score 94/100; rank 2.',
        textAnswers: { questions: 'The team explained their deployment approach.', 'field-2': 'The architecture is understandable.' },
        flags: { githubReviewed: true, projectReviewed: true, 'material-0': true, 'field-3': true },
        scores: { rank: 2, overall: 94, 'field-0': 9, 'field-1': 50 },
      } }],
    });
    const json = JSON.stringify(context);
    assert.equal(context.evaluationType, model);
    assert.equal(json.match(/\d/g), null, `${model} evidence must not contain numeric evaluation values`);
    assert.equal(/(?:finalScore|scoreMaximum|judgeScores|criteriaScores|"rank"|"weight")/.test(json), false);
    if (model === 'criteria-based') assert.ok(context.evaluationAreas.includes('Technical quality'));
    if (model === 'remote-async') assert.ok(context.projectMaterials.includes('Documentation'));
    if (model === 'live-demo') assert.ok(context.evaluationAreas.includes('Presentation'));
    if (model === 'ranking-voting') assert.ok(context.evaluations[0].feedback === 'Strong implementation.');
    if (model === 'custom') assert.ok(context.evaluations[0].observations.some(({ area }) => area === 'Technical approach'));
  }
});

test('numeric evaluation content in AI output is rejected before saving', async () => {
  assert.equal(reportIsQualitative({ ...generatedReport, summary: 'A score of 88 reflects the outcome.' }), false);
  const invalidReport = { ...generatedReport, summary: 'The team achieved 88 percent.' };
  const fixture = mockController({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ report: invalidReport, model: 'test-model' }) }) });
  const res = await generate(fixture);
  assert.equal(res.statusCode, 502);
  assert.equal(fixture.writes, 0);
});
