const test = require('node:test');
const assert = require('node:assert/strict');
const Judge = require('../models/Judge');
const Event = require('../models/Event');
const jwt = require('jsonwebtoken');
const { requireRole, requireEventAccess, requireOwnedEvent, authenticate, authenticateOptional, authorizeEvaluationSubmission } = require('../middleware/auth');

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

test('organizer ownership middleware permits only events owned by the session identity', async (t) => {
  const original = Event.findOne;
  t.after(() => { Event.findOne = original; });
  let lookup;
  Event.findOne = (query) => {
    lookup = query;
    return { select() { return this; }, lean: async () => query.ownerId === 'org-owner' ? { _id: query._id } : null };
  };
  const request = (ownerId) => ({ params: { eventId: '64b000000000000000000001' }, auth: { role: 'organizer', sub: ownerId } });
  let continued = false;
  await requireOwnedEvent(request('org-owner'), response(), () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(lookup.ownerId, 'org-owner');
  const denied = response();
  await requireOwnedEvent(request('another-owner'), denied, () => assert.fail('Cross-organizer access continued.'));
  assert.equal(denied.statusCode, 404);
});

test('judge sessions issued by the removed password login flow are rejected', async (t) => {
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32-bytes';
  t.after(() => { if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = previousSecret; });
  const token = jwt.sign({ sub: '64b000000000000000000011', role: 'judge', email: 'judge@example.test', eventId: '64b000000000000000000001' }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256', issuer: 'scoreflow', audience: 'scoreflow-api', expiresIn: '1m' });
  const req = { get: () => `Bearer ${token}` };
  const res = response();
  await authenticate(req, res, () => assert.fail('A judge password session without invitation provenance was accepted.'));
  assert.equal(res.statusCode, 401);
});

test('organizer access tokens authenticate without a stale email allowlist dependency', async (t) => {
  const OrganizerAccount = require('../models/OrganizerAccount');
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const originalFindById = OrganizerAccount.findById;
  const secret = 'test-access-secret-that-is-long-enough-32-bytes';
  process.env.JWT_ACCESS_SECRET = secret;
  OrganizerAccount.findById = () => ({ select() { return this; }, lean: async () => ({
    _id: '64b000000000000000000011', email: 'owner@example.test', tokenVersion: 0, active: true,
  }) });
  t.after(() => {
    OrganizerAccount.findById = originalFindById;
    if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = previousSecret;
  });
  const token = jwt.sign({ sub: '64b000000000000000000011', role: 'organizer', email: 'owner@example.test', ver: 0, sessionType: 'organizer' }, secret, { algorithm: 'HS256', issuer: 'scoreflow', audience: 'scoreflow-api', expiresIn: '1m' });
  const req = { get: () => `Bearer ${token}` };
  const res = response();
  let continued = false;
  await authenticate(req, res, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(req.auth.role, 'organizer');
  const optionalReq = { get: () => `Bearer ${token}` };
  await authenticateOptional(optionalReq, response(), () => {});
  assert.equal(optionalReq.auth.role, 'organizer');
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
