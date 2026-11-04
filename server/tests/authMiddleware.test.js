const test = require('node:test');
const assert = require('node:assert/strict');
const Judge = require('../models/Judge');
const { requireRole, requireEventAccess, authorizeEvaluationSubmission } = require('../middleware/auth');

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('role middleware blocks judges from organizer-only APIs', () => {
  const res = response();
  let continued = false;
  requireRole('organizer')({ auth: { role: 'judge' } }, res, () => { continued = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(continued, false);
});

test('judge event authorization rejects event ID manipulation', async () => {
  const res = response();
  let continued = false;
  await requireEventAccess({ params: { eventId: '64b000000000000000000002' }, auth: { role: 'judge', eventId: '64b000000000000000000001' } }, res, () => { continued = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(continued, false);
});

test('evaluation submissions replace a frontend judge ID with the authenticated judge identity', async (t) => {
  const original = Judge.findOne;
  t.after(() => { Judge.findOne = original; });
  Judge.findOne = (query) => ({ select() { return this; }, lean: async () => query._id === '64b000000000000000000011' && query.assignedTeamIds === '64b000000000000000000021' ? { _id: query._id } : null });
  const req = { auth: { role: 'judge', sub: '64b000000000000000000011', email: 'judge@example.test', eventId: '64b000000000000000000001' }, body: {
    eventId: '64b000000000000000000001', judgeId: '64b000000000000000000099', teamId: '64b000000000000000000021',
  } };
  const res = response();
  let continued = false;
  await authorizeEvaluationSubmission(req, res, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(req.body.judgeId, req.auth.sub);
});

test('judge cannot submit for an unassigned team', async (t) => {
  const original = Judge.findOne;
  t.after(() => { Judge.findOne = original; });
  Judge.findOne = () => ({ select() { return this; }, lean: async () => null });
  const res = response();
  await authorizeEvaluationSubmission({ auth: { role: 'judge', sub: '64b000000000000000000011', email: 'judge@example.test', eventId: '64b000000000000000000001' }, body: {
    eventId: '64b000000000000000000001', judgeId: '64b000000000000000000011', teamId: '64b000000000000000000022',
  } }, res, () => assert.fail('Unauthorized evaluation submission continued.'));
  assert.equal(res.statusCode, 403);
});
