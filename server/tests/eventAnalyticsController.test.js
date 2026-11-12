const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventAnalyticsController } = require('../controllers/eventAnalyticsController');

const eventId = '64b000000000000000000001';

function setup({ event = { _id: eventId }, teams = 0, judges = 0, evaluations = [], reports = 0, reportEmails = [], announcementEmails = [] } = {}) {
  const filters = {};
  const eventModel = { findById: (id) => ({ select() { return this; }, lean: async () => String(id) === eventId ? event : null }) };
  const model = (key, countValue, aggregateValue) => ({
    collection: { name: key },
    countDocuments: async (query) => { filters[key] = query; return countValue; },
    aggregate: async (pipeline) => { filters[key] = pipeline; return aggregateValue; },
  });
  const controller = createEventAnalyticsController({
    EventModel: eventModel,
    TeamModel: model('teams', teams, []),
    JudgeModel: model('judges', judges, evaluations),
    EvaluationModel: { collection: { name: 'evaluations' } },
    ReportModel: model('reports', reports, []),
    DeliveryModel: model('deliveries', 0, reportEmails),
    AnnouncementModel: model('announcements', 0, announcementEmails),
  });
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return { controller, response, filters };
}

test('rejects invalid event IDs before querying event data', async () => {
  const { controller, response } = setup();
  await controller.getEventAnalytics({ params: { eventId: 'invalid' } }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
});

test('returns not found for a valid event ID with no matching event', async () => {
  const { controller, response } = setup({ event: null });
  await controller.getEventAnalytics({ params: { eventId } }, response);
  assert.equal(response.statusCode, 404);
});

test('handles an empty event and zero assignments without invalid percentages', async () => {
  const { controller, response } = setup({});
  await controller.getEventAnalytics({ params: { eventId } }, response);
  assert.deepEqual(response.body.data, {
    eventId, totalTeams: 0, totalJudges: 0, totalAssignments: 0, completedEvaluations: 0,
    pendingEvaluations: 0, evaluationProgressPercent: 0, completedJudges: 0, pendingJudges: 0,
    judgesWithAssignments: 0, judgeProgressPercent: 0, reportsGenerated: 0, emailsAccepted: 0,
  });
});

test('judges without team assignments are not reported as completed or pending evaluators', async () => {
  const { controller, response } = setup({ judges: 2, evaluations: [] });
  await controller.getEventAnalytics({ params: { eventId } }, response);
  assert.equal(response.body.data.totalJudges, 2);
  assert.equal(response.body.data.judgesWithAssignments, 0);
  assert.equal(response.body.data.completedJudges, 0);
  assert.equal(response.body.data.pendingJudges, 0);
  assert.equal(response.body.data.judgeProgressPercent, 0);
});

test('calculates partial evaluation and judge progress from event assignment aggregation', async () => {
  const { controller, response } = setup({
    teams: 3, judges: 3,
    evaluations: [{ totalAssignments: 5, completedEvaluations: 2, completedJudges: 1, judgesWithAssignments: 3 }],
  });
  await controller.getEventAnalytics({ params: { eventId } }, response);
  assert.equal(response.body.data.pendingEvaluations, 3);
  assert.equal(response.body.data.evaluationProgressPercent, 40);
  assert.equal(response.body.data.completedJudges, 1);
  assert.equal(response.body.data.pendingJudges, 2);
  assert.equal(response.body.data.judgeProgressPercent, 33);
});

test('calculates completed progress and includes only saved report and successful email counts', async () => {
  const { controller, response } = setup({
    teams: 2, judges: 2,
    evaluations: [{ totalAssignments: 4, completedEvaluations: 4, completedJudges: 2, judgesWithAssignments: 2 }],
    reports: 2, reportEmails: [{ accepted: 3 }], announcementEmails: [{ accepted: 4 }],
  });
  await controller.getEventAnalytics({ params: { eventId } }, response);
  assert.equal(response.body.data.evaluationProgressPercent, 100);
  assert.equal(response.body.data.judgeProgressPercent, 100);
  assert.equal(response.body.data.reportsGenerated, 2);
  assert.equal(response.body.data.emailsAccepted, 7);
});

test('scopes all counts to the selected event', async () => {
  const { controller, response, filters } = setup();
  await controller.getEventAnalytics({ params: { eventId } }, response);
  for (const key of ['teams', 'reports']) assert.equal(String(filters[key].eventId || filters[key].event), eventId);
  assert.ok(filters.deliveries.some((stage) => stage.$match?.event === eventId));
  assert.ok(filters.announcements.some((stage) => stage.$match?.eventId === eventId));
  assert.ok(filters.judges[0].$match.eventId === eventId);
});

test('counts completed assignments only and includes only confirmed successful email outcomes', async () => {
  const { controller, response, filters } = setup({
    evaluations: [{ totalAssignments: 2, completedEvaluations: 1, completedJudges: 0, judgesWithAssignments: 2 }],
    reportEmails: [{ accepted: 1 }], announcementEmails: [{ accepted: 2 }],
  });
  await controller.getEventAnalytics({ params: { eventId } }, response);
  const evaluationLookup = filters.judges.find((stage) => stage.$lookup?.from === 'evaluations').$lookup;
  assert.ok(evaluationLookup.pipeline.some((stage) => stage.$match?.$expr?.$and?.some((term) => term.$eq?.[1] === 'COMPLETED')));
  assert.ok(filters.deliveries.some((stage) => stage.$match?.['members.status']?.$in?.includes('Accepted')));
  assert.ok(filters.announcements.some((stage) => stage.$group?.accepted?.$sum?.$add?.[0]?.$ifNull?.[0] === '$acceptedCount'));
  assert.equal(response.body.data.emailsAccepted, 3);
});

