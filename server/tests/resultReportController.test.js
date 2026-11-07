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
  whyThisMatters: 'Clear validation helps reviewers trust that the implementation will behave reliably.',
  improvementSuggestions: ['Document technical testing.'],
  priorityAreas: ['High Priority: Document technical testing and validate edge cases.'],
  judgeFeedbackSummary: 'Judges noted clear framing and a need for stronger technical work.',
  finalRemarks: 'Continue testing and validating the implementation.',
};

function mockController({ pending = false, outsideTeam = false, fetchImpl, configValue = config, teamValue = team, evaluationRows = evaluations } = {}) {
  const stored = new Map();
  let currentEvaluationRows = structuredClone(evaluationRows);
  let writes = 0;
  let lastInput = null;
  const eventModel = { findById: (id) => ({ select() { return this; }, lean: async () => String(id) === eventId ? { _id: eventId, name: 'TechNova Hackathon', type: 'Hackathon' } : null }) };
  const teamModel = {
    findOne: (query) => ({ select() { return this; }, lean: async () => String(query._id) === teamId && String(query.eventId) === eventId
      ? (outsideTeam ? null : teamValue) : null }),
  };
  const judgeModel = { find: () => ({ lean: async () => judges }) };
  const evaluationModel = { find: () => ({ lean: async () => pending ? currentEvaluationRows.slice(0, 1) : structuredClone(currentEvaluationRows) }) };
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
    findOne: (query) => ({ lean: async () => stored.get(`${query.event}:${query.team}`) || null }),
    find: (query) => ({ sort() { return this; }, lean: async () => [...stored.values()].filter((report) => String(report.event) === String(query.event)) }),
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
      return { ok: true, status: 200, json: async () => ({ report: generatedReport, model: 'test-model', promptVersion: 'result-report-v2' }) };
    }),
  });
  return { controller, stored, setEvaluationRows(rows) { currentEvaluationRows = structuredClone(rows); }, get writes() { return writes; }, get lastInput() { return lastInput; } };
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

test('completed team sends private performance evidence to AI and saves only a qualitative report', async () => {
  const before = structuredClone(evaluations);
  const fixture = mockController();
  const res = await generate(fixture);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.teamId, teamId);
  assert.equal(res.body.data.eventId, eventId);
  assert.equal(Object.hasOwn(res.body.data, 'finalScore'), false);
  assert.deepEqual(fixture.lastInput.evaluationAreas, criteria.map((item) => item.name));
  assert.equal(fixture.lastInput.evaluations.length, 2, 'judge evidence must stay separate for consensus analysis');
  assert.deepEqual(fixture.lastInput.evaluations[0].performance, [
    { area: 'Innovation', value: 27, kind: 'criterion', betterWhen: 'higher', maxValue: 30, weight: 30 },
    { area: 'Technical', value: 35, kind: 'criterion', betterWhen: 'higher', maxValue: 40, weight: 40 },
    { area: 'Presentation', value: 17, kind: 'criterion', betterWhen: 'higher', maxValue: 20, weight: 20 },
    { area: 'Impact', value: 8, kind: 'criterion', betterWhen: 'higher', maxValue: 10, weight: 10 },
  ]);
  for (const forbidden of ['teamNumber', 'finalScore', 'scoreMaximum', 'criteriaScores', 'judgeScores']) {
    assert.equal(JSON.stringify(fixture.lastInput).includes(`"${forbidden}"`), false);
  }
  assert.deepEqual(evaluations, before, 'report generation must not modify evaluation scores');
  assert.equal(fixture.writes, 1);
  assert.equal(res.body.data.isCurrent, true);
  assert.match(fixture.stored.get(`${eventId}:${teamId}`).evidenceHash, /^[a-f0-9]{64}$/);
  assert.equal(/\d|AI\s*(?:generated|powered)|generated by AI/i.test(JSON.stringify(res.body.data.report)), false);
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

test('saved report retrieval and event listing detect current and changed evidence', async () => {
  const fixture = mockController();
  const generated = await generate(fixture);
  assert.equal(generated.statusCode, 200);

  const current = response();
  await fixture.controller.getReport({ params: { eventId, teamId } }, current);
  assert.equal(current.statusCode, 200);
  assert.equal(current.body.data.isCurrent, true);
  assert.equal(current.body.data.reportId, generated.body.data.reportId);

  const changed = structuredClone(evaluations);
  changed[0].scores.technical += 1;
  fixture.setEvaluationRows(changed);
  const stale = response();
  await fixture.controller.getReport({ params: { eventId, teamId } }, stale);
  assert.equal(stale.body.data.isCurrent, false);
  changed[0].scores.technical -= 1;
  changed[0].feedback = 'The project evidence has changed.';
  fixture.setEvaluationRows(changed);
  const listed = response();
  await fixture.controller.listReports({ params: { eventId } }, listed);
  assert.equal(listed.body.data[0].isCurrent, false);
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

test('all six evaluation types provide their configured numeric and qualitative evidence for private AI reasoning', async () => {
  const cases = [
    ['criteria-based', { criteriaBased: { criteria: [{ id: 'technical', name: 'Technical quality', maxMarks: 20, weight: 50 }] } }],
    ['open-holistic', { openHolistic: { githubReview: true, projectReview: true, scoreMax: 100 } }],
    ['remote-async', { remoteAsync: { materials: [{ label: 'Documentation', url: 'https://example.test/doc' }] } }],
    ['live-demo', { liveDemo: { demoEvaluation: true, presentationEvaluation: true, judgeQuestions: true, criteria: [{ name: 'Clarity', maxMarks: 10, weight: 50 }] } }],
    ['ranking-voting', { rankingVoting: { ranking: true, comments: true } }],
    ['custom', { custom: { fields: [
      { type: 'criteria', label: 'Innovation' }, { type: 'marks', label: 'Impact' },
      { type: 'question', label: 'Technical approach' }, { type: 'material', label: 'Demo reviewed' },
    ] } }],
  ];
  for (const [model, configFields] of cases) {
    const typeEvaluations = evaluations.map((row) => ({ ...row, scores: { ...row.scores, overall: 94, rank: 2, demo: 7, presentation: 3, 'field-0': 8 } }));
    const fixture = mockController({ configValue: { eventId, model, ...configFields }, evaluationRows: typeEvaluations });
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
        scores: { rank: 2, overall: 94, demo: 7, presentation: 3, technical: 8, 'field-0': 9, 'field-1': 50 },
      } }],
    });
    const json = JSON.stringify(context);
    assert.equal(context.evaluationType, model);
    assert.match(json, /"performance":\[.*"value":/);
    assert.ok(Array.isArray(context.evaluations[0].performance));
    if (model === 'criteria-based') assert.ok(context.evaluationAreas.includes('Technical quality'));
    if (model === 'criteria-based') assert.ok(context.evaluations[0].performance.some(({ area, value, maxValue, weight }) => area === 'Technical quality' && value === 8 && maxValue === 20 && weight === 50));
    if (model === 'open-holistic') assert.ok(context.evaluations[0].performance.some(({ kind, value, maxValue }) => kind === 'overall' && value === 94 && maxValue === 100));
    if (model === 'remote-async') assert.ok(context.projectMaterials.includes('Documentation'));
    if (model === 'live-demo') assert.ok(context.evaluationAreas.includes('Presentation'));
    if (model === 'ranking-voting') assert.ok(context.evaluations[0].feedback === 'Strong implementation.');
    if (model === 'ranking-voting') assert.ok(context.evaluations[0].performance.some(({ kind, value, betterWhen }) => kind === 'rank' && value === 2 && betterWhen === 'lower'));
    if (model === 'custom') assert.ok(context.evaluations[0].observations.some(({ area }) => area === 'Technical approach'));
  }
});

test('opposite criterion performance remains distinct and recurring judge evidence stays separate', () => {
  const configValue = { model: 'criteria-based', criteriaBased: { criteria: [
    { id: 'technical', name: 'Technical implementation', maxMarks: 40, weight: 60 },
    { id: 'presentation', name: 'Presentation', maxMarks: 20, weight: 40 },
  ] } };
  const makeEvidence = (teamName, technical, presentation, feedbacks) => buildReportEvidence({
    event: { name: 'Showcase', type: 'Hackathon' },
    team: { teamName, project: 'Campus resource discovery.' },
    config: configValue,
    judgeRows: feedbacks.map((feedback, index) => ({ evaluation: {
      feedback, scores: { technical, presentation },
    }, judge: { name: `Judge ${index + 1}` } })),
  });
  const teamA = makeEvidence('Team A', 36, 5, ['Strong technical depth.', 'Presentation flow needs clarity.', 'Presentation flow needs clarity.']);
  const teamB = makeEvidence('Team B', 12, 18, ['The presentation is clear.', 'Technical testing is incomplete.']);
  assert.notDeepEqual(teamA.evaluations.map(({ performance }) => performance), teamB.evaluations.map(({ performance }) => performance));
  assert.equal(teamA.evaluations.filter(({ feedback }) => feedback === 'Presentation flow needs clarity.').length, 2);
  assert.ok(teamA.evaluations[0].performance.some(({ area, value }) => area === 'Technical implementation' && value === 36));
  assert.ok(teamB.evaluations[0].performance.some(({ area, value }) => area === 'Presentation' && value === 18));
});

test('numeric evaluation content in AI output is rejected before saving', async () => {
  assert.equal(reportIsQualitative({ ...generatedReport, summary: 'A score of 88 reflects the outcome.' }), false);
  const invalidReport = { ...generatedReport, summary: 'The team achieved 88 percent.' };
  const fixture = mockController({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ report: invalidReport, model: 'test-model' }) }) });
  const res = await generate(fixture);
  assert.equal(res.statusCode, 502);
  assert.equal(fixture.writes, 0);
});

test('AI attribution in report output is rejected before saving', async () => {
  const invalidReport = { ...generatedReport, finalRemarks: 'AI Generated: continue testing the implementation.' };
  const fixture = mockController({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ report: invalidReport, model: 'test-model' }) }) });
  const res = await generate(fixture);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'AI_INVALID_RESPONSE');
  assert.equal(fixture.writes, 0);
});
