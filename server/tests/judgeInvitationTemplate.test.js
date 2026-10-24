const test = require('node:test');
const assert = require('node:assert/strict');

const eventId = '64b000000000000000000001';
const event = { _id: eventId, name: 'Mini Project Evaluation', date: '2026-10-20' };
const judgeA = { _id: '64b000000000000000000011', eventId, name: 'Rahul Rao', email: 'rahul@example.test', invitationStatus: 'pending' };
const judgeB = { _id: '64b000000000000000000012', eventId, name: 'Asha Dev', email: 'asha@example.test', invitationStatus: 'pending' };

const Event = require('../models/Event');
const Judge = require('../models/Judge');
const emailService = require('../services/emailService');
const actualSendJudgeInvitation = emailService.sendJudgeInvitation;
let sendCalls = [];
let savedHashes = new Map();
let acceptanceJudge = null;
let acceptedResult = null;
let capturedAcceptanceQuery = null;
let judgesForQuery = [judgeA, judgeB];

Event.findById = (id) => ({
  select() { return this; },
  lean: async () => String(id) === eventId ? event : null,
});
Judge.find = (query) => ({
  lean: async () => judgesForQuery.filter((judge) => String(judge.eventId) === String(query.eventId)
    && judge.invitationStatus !== 'accepted'
    && (!query._id || query._id.$in.map(String).includes(String(judge._id)))),
});
Judge.findOneAndUpdate = (query, update) => {
  if (acceptedResult) {
    capturedAcceptanceQuery = query;
    return { lean: async () => acceptedResult };
  }
  const judge = [judgeA, judgeB].find((item) => String(item._id) === String(query._id) && String(item.eventId) === String(query.eventId));
  if (!judge || judge.invitationStatus === 'accepted') return Promise.resolve(null);
  savedHashes.set(String(judge._id), update.$set.invitationTokenHash);
  return Promise.resolve({ ...judge, ...update.$set });
};
Judge.findOne = async (query) => {
  if (!acceptanceJudge || !query.invitationTokenHash || query.invitationTokenHash !== savedHashes.get(String(acceptanceJudge._id))) return null;
  return acceptanceJudge;
};
Judge.updateOne = async () => ({ acknowledged: true });
emailService.sendJudgeInvitation = async (args) => {
  sendCalls.push(args);
  return { sent: true };
};
const invitationService = require('../services/invitationService');
const { buildJudgeInvitationEmail } = require('../services/emailTemplates');
const controller = require('../controllers/judgeController');

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    set() { return this; },
    json(value) { this.body = value; return this; },
  };
}
function reset() {
  sendCalls = [];
  savedHashes = new Map();
  acceptanceJudge = null;
  acceptedResult = null;
  capturedAcceptanceQuery = null;
  judgesForQuery = [judgeA, judgeB];
}

test('professional judge invitations reuse secure event-bound invitations', async (t) => {
  await t.test('template is personalized, safe, dated, and has a real invitation link', () => {
    const email = buildJudgeInvitationEmail({
      judgeName: '<Rahul>', eventName: 'Mini Project Evaluation', eventDate: '2026-10-20',
      invitationUrl: 'https://scoreflow.test/judge/invite/secure-token-fixture',
    });
    assert.equal(email.subject, 'Invitation to Judge — Mini Project Evaluation');
    assert.match(email.html, /Dear &lt;Rahul&gt;/);
    assert.match(email.html, /20 October 2026/);
    assert.match(email.html, /href="https:\/\/scoreflow\.test\/judge\/invite\/secure-token-fixture"/);
    assert.match(email.html, />Accept Invitation<\/a>/);
  });

  await t.test('invitation URL is built from CLIENT_URL and the unique raw token only in the email', async () => {
    const oldEnv = { key: process.env.BREVO_API_KEY, sender: process.env.BREVO_SENDER_EMAIL, client: process.env.CLIENT_URL };
    const oldFetch = global.fetch;
    process.env.BREVO_API_KEY = 'mock-api-key';
    process.env.BREVO_SENDER_EMAIL = 'noreply@example.test';
    process.env.CLIENT_URL = 'https://scoreflow.example/';
    let requestBody;
    global.fetch = async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true };
    };
    try {
      const result = await actualSendJudgeInvitation({ judge: judgeA, event, token: 'secure-token-fixture' });
      assert.equal(result.sent, true);
      assert.match(requestBody.htmlContent, /https:\/\/scoreflow\.example\/judge\/invite\/secure-token-fixture/);
      assert.equal(requestBody.to[0].email, judgeA.email);
      assert.equal(/\/judge\/invite\/[^" ]+\/(?:64b[0-9a-f]+)?/.test(requestBody.htmlContent), false);
    } finally {
      global.fetch = oldFetch;
      if (oldEnv.key === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = oldEnv.key;
      if (oldEnv.sender === undefined) delete process.env.BREVO_SENDER_EMAIL; else process.env.BREVO_SENDER_EMAIL = oldEnv.sender;
      if (oldEnv.client === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = oldEnv.client;
    }
  });

  await t.test('one event-bound token is generated per selected judge and only its hash is stored', async () => {
    reset();
    await invitationService.issueJudgeInvitation(judgeA, event);
    await invitationService.issueJudgeInvitation(judgeB, event);
    assert.equal(sendCalls.length, 2);
    assert.notEqual(sendCalls[0].token, sendCalls[1].token);
    assert.ok(sendCalls.every((call) => String(call.judge.eventId) === eventId && String(call.event._id) === eventId));
    assert.ok([...savedHashes.values()].every((hash) => /^[a-f0-9]{64}$/.test(hash)));
    assert.ok(sendCalls.every((call) => !savedHashes.has(call.token)));
  });

  await t.test('resend replaces the previous hash and invalidates the old token', async () => {
    reset();
    await invitationService.issueJudgeInvitation(judgeA, event);
    const oldToken = sendCalls[0].token;
    const oldHash = savedHashes.get(judgeA._id);
    await invitationService.issueJudgeInvitation(judgeA, event);
    const newToken = sendCalls[1].token;
    assert.notEqual(oldToken, newToken);
    assert.notEqual(savedHashes.get(judgeA._id), oldHash);
    acceptanceJudge = { ...judgeA, invitationStatus: 'pending', invitationExpiresAt: new Date(Date.now() + 60000) };
    const expiredLink = response();
    await controller.previewJudgeInvitation({ params: { token: oldToken } }, expiredLink);
    assert.equal(expiredLink.statusCode, 400);
  });

  await t.test('expired invitation is rejected', async () => {
    reset();
    const credentials = invitationService.createInvitationCredentials();
    savedHashes.set(judgeA._id, credentials.tokenHash);
    acceptanceJudge = { ...judgeA, invitationStatus: 'pending', invitationExpiresAt: new Date(Date.now() - 1000) };
    const res = response();
    await controller.previewJudgeInvitation({ params: { token: credentials.token } }, res);
    assert.equal(res.statusCode, 410);
  });

  await t.test('used or unrecognized token is rejected', async () => {
    reset();
    const res = response();
    await controller.previewJudgeInvitation({ params: { token: 'A'.repeat(43) } }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /invalid or has already been used/);
  });

  await t.test('acceptance binds the judge and event and returns the dashboard destination IDs', async () => {
    reset();
    const credentials = invitationService.createInvitationCredentials();
    savedHashes.set(judgeA._id, credentials.tokenHash);
    acceptanceJudge = { ...judgeA, invitationStatus: 'pending', invitationExpiresAt: new Date(Date.now() + 60000) };
    acceptedResult = { _id: judgeA._id, eventId };
    const res = response();
    await controller.acceptJudgeInvitation({ body: { token: credentials.token } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(String(capturedAcceptanceQuery._id), judgeA._id);
    assert.equal(String(capturedAcceptanceQuery.eventId), eventId);
    assert.deepEqual(res.body.data, { eventId, judgeId: judgeA._id, invitationStatus: 'accepted' });
  });

  await t.test('bulk invite sends personalized invitations only to judges in the requested event', async () => {
    reset();
    const res = response();
    await controller.sendJudgeInvitations({
      params: { eventId },
      body: { recipientMode: 'specific', judgeIds: [judgeA._id, judgeB._id], emailDraft: { subject: 'Please join our review panel', body: 'Your experience would help our students.' } },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.sentCount, 2);
    assert.deepEqual(sendCalls.map((call) => call.judge.name).sort(), ['Asha Dev', 'Rahul Rao']);
    assert.equal(new Set(sendCalls.map((call) => call.token)).size, 2);
    assert.ok(sendCalls.every((call) => String(call.event._id) === eventId));
    assert.ok(sendCalls.every((call) => call.emailDraft?.subject === 'Please join our review panel'));

    const previousFetch = global.fetch;
    const previousEnv = {
      key: process.env.BREVO_API_KEY,
      sender: process.env.BREVO_SENDER_EMAIL,
      client: process.env.CLIENT_URL,
    };
    process.env.BREVO_API_KEY = 'mock-api-key';
    process.env.BREVO_SENDER_EMAIL = 'noreply@example.test';
    process.env.CLIENT_URL = 'https://scoreflow.example';
    const payloads = [];
    global.fetch = async (_url, options) => {
      payloads.push(JSON.parse(options.body));
      return { ok: true };
    };
    try {
      for (const invitation of sendCalls) await actualSendJudgeInvitation(invitation);
    } finally {
      global.fetch = previousFetch;
      if (previousEnv.key === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = previousEnv.key;
      if (previousEnv.sender === undefined) delete process.env.BREVO_SENDER_EMAIL; else process.env.BREVO_SENDER_EMAIL = previousEnv.sender;
      if (previousEnv.client === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = previousEnv.client;
    }
    const links = payloads.map((payload) => payload.htmlContent.match(/href="([^"]+)"/)?.[1]);
    assert.equal(payloads.length, 2);
    assert.deepEqual(payloads.map((payload) => payload.to[0].email).sort(), ['asha@example.test', 'rahul@example.test']);
    assert.equal(new Set(links).size, 2);
    assert.ok(links.every((link) => link.startsWith('https://scoreflow.example/judge/invite/')));
    assert.ok(payloads.some((payload) => payload.htmlContent.includes('Dear Rahul Rao')));
    assert.ok(payloads.some((payload) => payload.htmlContent.includes('Dear Asha Dev')));
    assert.ok(payloads.every((payload) => payload.subject === 'Please join our review panel'));
    assert.ok(payloads.every((payload) => payload.htmlContent.includes('Your experience would help our students.')));
    assert.ok(payloads.every((payload) => payload.textContent.includes('Your experience would help our students.')));
  });

  await t.test('bulk invite rejects IDs from another event', async () => {
    reset();
    const res = response();
    await controller.sendJudgeInvitations({
      params: { eventId },
      body: { recipientMode: 'specific', judgeIds: ['64b000000000000000000099'] },
    }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(sendCalls.length, 0);
  });
});
