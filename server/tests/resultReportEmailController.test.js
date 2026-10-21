const test = require('node:test');
const assert = require('node:assert/strict');
const { createResultReportEmailController } = require('../controllers/resultReportEmailController');
const { buildResultReportEmail } = require('../services/emailTemplates');
const emailService = require('../services/emailService');

const eventId = '64b000000000000000000001';
const otherEventId = '64b000000000000000000002';
const teamOneId = '64b000000000000000000021';
const teamTwoId = '64b000000000000000000022';
const judgeId = '64b000000000000000000031';
const reportContent = {
  summary: 'The team delivered a thoughtful project with a clear purpose.',
  strengths: ['The project is clearly framed.'],
  weaknesses: ['Testing evidence could be more detailed.'],
  improvementSuggestions: ['Document the validation process.'],
  priorityAreas: ['Technical validation'],
  judgeFeedbackSummary: 'Judges valued the concept and encouraged more implementation detail.',
  finalRemarks: 'Continue refining the project using the feedback provided.',
};

function fixture({ teams, reportTeams, evaluationStatus = 'COMPLETED', failEmails = [], sendEmailImpl } = {}) {
  const storedTeams = teams || [
    { _id: teamOneId, eventId, teamName: 'NovaTech', members: [
      { name: 'Asha', email: 'asha@example.test' }, { name: 'Ben', email: 'ben@example.test' },
    ] },
  ];
  const reports = new Map((reportTeams || storedTeams.map((team) => String(team._id))).map((id) => [String(id), {
    _id: `report-${id}`, event: eventId, team: String(id), report: structuredClone(reportContent),
  }]));
  const deliveries = new Map();
  const sent = [];
  let deliveryNumber = 0;
  const eventModel = { findById: (id) => ({ select() { return this; }, lean: async () => String(id) === eventId ? { _id: eventId, name: 'TechNova Showcase' } : null }) };
  const teamModel = { findOne: (query) => ({ lean: async () => storedTeams.find((team) => String(team._id) === String(query._id) && String(team.eventId) === String(query.eventId)) || null }) };
  const judgeModel = { find: (query) => ({ lean: async () => String(query.eventId) === eventId ? [{ _id: judgeId, eventId, assignedTeamIds: storedTeams.map((team) => String(team._id)) }] : [] }) };
  const evaluationModel = { find: (query) => ({ lean: async () => storedTeams.filter((team) => String(team._id) === String(query.teamId)).map((team) => ({
    eventId, teamId: String(team._id), judgeId, status: evaluationStatus,
  })) }) };
  const reportModel = { findOne: (query) => ({ lean: async () => reports.get(String(query.team)) || null }) };
  const deliveryModel = {
    create: async (record) => {
      if ([...deliveries.values()].some((entry) => String(entry.event) === String(record.event)
        && String(entry.team) === String(record.team) && (entry.requestId === record.requestId || entry.status === 'Sending' && record.status === 'Sending'))) {
        const error = new Error('duplicate key'); error.code = 11000; throw error;
      }
      const saved = { ...structuredClone(record), _id: `delivery-${++deliveryNumber}`, createdAt: new Date() };
      deliveries.set(saved._id, saved);
      return saved;
    },
    findOne: (query) => ({ lean: async () => [...deliveries.values()].find((entry) =>
      String(entry.event) === String(query.event) && String(entry.team) === String(query.team)
      && (!query.requestId || entry.requestId === query.requestId) && (!query.status || entry.status === query.status)) || null }),
    findOneAndUpdate: (query, update) => ({ lean: async () => {
      const saved = deliveries.get(String(query._id));
      if (!saved) return null;
      Object.assign(saved, update.$set);
      return saved;
    } }),
    find: (query) => ({ sort() { return this; }, lean: async () => [...deliveries.values()].filter((entry) => String(entry.event) === String(query.event)).sort((a, b) => b.createdAt - a.createdAt) }),
  };
  const sendEmail = async (payload) => {
    sent.push(payload);
    if (sendEmailImpl) return sendEmailImpl(payload);
    return failEmails.includes(payload.recipientEmail)
      ? { sent: false, code: 'delivery_failed', message: 'Brevo could not deliver this email. Please try again.' }
      : { sent: true, code: 'sent' };
  };
  const controller = createResultReportEmailController({
    EventModel: eventModel, TeamModel: teamModel, JudgeModel: judgeModel,
    EvaluationModel: evaluationModel, ReportModel: reportModel,
    DeliveryModel: deliveryModel, sendEmail,
  });
  return { controller, sent, deliveries, reports };
}

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}
async function post(fx, teamId = teamOneId, requestId = 'request-123456') {
  const res = response();
  await fx.controller.sendReport({ params: { eventId, teamId }, body: { requestId } }, res);
  return res;
}

test('sends a separate personalized message to each member and reports individual outcomes', async () => {
  const fx = fixture();
  const res = await post(fx);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'Sent');
  assert.deepEqual(fx.sent.map(({ recipientEmail }) => recipientEmail), ['asha@example.test', 'ben@example.test']);
  assert.ok(fx.sent.every(({ recipientEmail }) => typeof recipientEmail === 'string'));
  fx.sent.forEach(({ report }) => assert.deepEqual(report, reportContent));
  assert.deepEqual(res.body.data.members.map(({ memberName, status }) => [memberName, status]), [['Asha', 'Sent'], ['Ben', 'Sent']]);
  assert.equal(JSON.stringify(res.body).includes('asha@example.test'), false);
});

test('partial delivery failure does not prevent later member delivery', async () => {
  const fx = fixture({ failEmails: ['asha@example.test'] });
  const res = await post(fx);
  assert.equal(res.body.data.status, 'Partially Sent');
  assert.equal(fx.sent.length, 2);
  assert.deepEqual(res.body.data.members.map((member) => member.status), ['Failed', 'Sent']);
});

test('missing and invalid member addresses are preserved as individual failures', async () => {
  const fx = fixture({ teams: [{
    _id: teamOneId, eventId, teamName: 'NovaTech', members: [
      { name: 'Asha', email: 'not-an-email' }, { name: 'Ben', email: '' }, { name: 'Cara', email: 'cara@example.test' },
    ],
  }] });
  const res = await post(fx);
  assert.equal(res.body.data.status, 'Partially Sent');
  assert.equal(fx.sent.length, 1);
  assert.deepEqual(res.body.data.members.map((member) => member.status), ['Failed', 'Failed', 'Sent']);
});

test('team with no valid member email addresses is not sent', async () => {
  const fx = fixture({ teams: [{ _id: teamOneId, eventId, teamName: 'NovaTech', members: [{ name: 'Asha', email: 'bad-address' }] }] });
  const res = await post(fx);
  assert.equal(res.body.data.status, 'Failed');
  assert.equal(fx.sent.length, 0);
});

test('pending team, missing report, and event/team mismatch are rejected before delivery', async (t) => {
  await t.test('pending team', async () => {
    const fx = fixture({ evaluationStatus: 'IN_PROGRESS' });
    const res = await post(fx);
    assert.equal(res.statusCode, 409);
    assert.equal(fx.sent.length, 0);
  });
  await t.test('missing report', async () => {
    const fx = fixture({ reportTeams: [] });
    const res = await post(fx);
    assert.equal(res.statusCode, 404);
    assert.equal(fx.sent.length, 0);
  });
  await t.test('other event team', async () => {
    const fx = fixture({ teams: [{ _id: teamOneId, eventId: otherEventId, teamName: 'Outside', members: [{ email: 'outside@example.test' }] }] });
    const res = await post(fx);
    assert.equal(res.statusCode, 404);
    assert.equal(fx.sent.length, 0);
  });
  await t.test('unknown event', async () => {
    const fx = fixture();
    const res = response();
    await fx.controller.sendReport({ params: { eventId: otherEventId, teamId: teamOneId }, body: { requestId: 'request-123456' } }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(fx.sent.length, 0);
  });
});

test('bulk sends are isolated by team and one failure does not stop other teams', async () => {
  const fx = fixture({
    teams: [
      { _id: teamOneId, eventId, teamName: 'NovaTech', members: [{ name: 'Asha', email: 'asha@example.test' }] },
      { _id: teamTwoId, eventId, teamName: 'Orbit', members: [{ name: 'Bela', email: 'bela@example.test' }] },
    ],
    reportTeams: [teamOneId],
  });
  const res = response();
  await fx.controller.sendReportsBulk({ params: { eventId }, body: { teamIds: [teamOneId, teamTwoId], requestId: 'bulk-request-123456' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.map((item) => item.status), ['Sent', 'Failed']);
  assert.deepEqual(fx.sent.map(({ recipientEmail }) => recipientEmail), ['asha@example.test']);
});

test('same request ID is idempotent while a new request ID permits an intentional resend', async () => {
  const fx = fixture();
  const first = await post(fx, teamOneId, 'request-idempotent-01');
  const repeated = await post(fx, teamOneId, 'request-idempotent-01');
  assert.equal(first.body.data.status, 'Sent');
  assert.equal(repeated.body.replayed, true);
  assert.equal(fx.sent.length, 2);
  await post(fx, teamOneId, 'request-idempotent-02');
  assert.equal(fx.sent.length, 4);
});

test('a concurrent repeated click with a different request ID cannot start a second delivery', async () => {
  let release;
  let notifyStarted;
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const fx = fixture({ sendEmailImpl: async () => { notifyStarted(); await gate; return { sent: true }; } });
  const firstPromise = post(fx, teamOneId, 'request-concurrent-001');
  await started;
  const repeated = await post(fx, teamOneId, 'request-concurrent-002');
  assert.equal(repeated.body.status, 'Sending');
  assert.equal(repeated.body.replayed, true);
  assert.equal(fx.sent.length, 1);
  release();
  assert.equal((await firstPromise).body.status, 'Sent');
});

test('delivery status endpoint is event-scoped and returns the latest member results', async () => {
  const fx = fixture();
  await post(fx);
  const res = response();
  await fx.controller.listDeliveryStatusByEvent({ params: { eventId } }, res);
  assert.equal(res.body.data[teamOneId].status, 'Sent');
  assert.equal(res.body.data[teamOneId].members.length, 2);
});

test('email template includes the complete professional report and excludes score/AI disclosure', () => {
  const email = buildResultReportEmail({ recipientName: 'Asha', teamName: 'NovaTech', eventName: 'TechNova Showcase', report: reportContent });
  assert.equal(email.subject, 'Your Evaluation Report — NovaTech | TechNova Showcase');
  for (const section of ['Executive Summary', 'Key Strengths', 'Areas for Improvement', 'Actionable Recommendations', 'Recommended Focus', 'Judge Feedback Summary', 'Final Remarks']) {
    assert.ok(email.html.includes(section));
    assert.ok(email.text.includes(section));
  }
  assert.match(email.html, /name="viewport"/);
  assert.ok(email.html.includes('type="text/css"') || email.html.includes('<style>'));
  assert.match(email.text, /Dear Asha/);
  assert.doesNotMatch(`${email.subject}\n${email.html}\n${email.text}`, /\b(?:score|marks?|percentages?|rankings?|positions?|vote counts?)\b|AI\s*[- ]?Generated|generated by AI/i);
  assert.throws(() => buildResultReportEmail({ recipientName: 'Asha', teamName: 'NovaTech', eventName: 'TechNova Showcase', report: { ...reportContent, summary: 'A result of 89 percent.' } }), /qualitative result report/);
  assert.throws(() => buildResultReportEmail({ recipientName: 'Asha', teamName: 'NovaTech', eventName: 'TechNova Showcase', report: { ...reportContent, summary: 'The team finished first.' } }), /qualitative result report/);
});

test('existing Brevo service sends one transactional message and safely handles configuration and network failures', async (t) => {
  const keys = ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const oldFetch = global.fetch;
  const setConfig = (values) => {
    keys.forEach((key) => { if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key]; });
  };
  try {
    await t.test('missing Brevo configuration', async () => {
      setConfig({});
      let called = false;
      global.fetch = async () => { called = true; };
      const result = await emailService.sendResultReportEmail({ recipientEmail: 'asha@example.test', recipientName: 'Asha', teamName: 'NovaTech', eventName: 'TechNova Showcase', report: reportContent });
      assert.equal(result.code, 'not_configured');
      assert.equal(called, false);
    });
    await t.test('one recipient per Brevo request and key remains in the backend header only', async () => {
      const key = 'mock-secret-brevo-key';
      setConfig({ BREVO_API_KEY: key, BREVO_SENDER_EMAIL: 'noreply@example.test', BREVO_SENDER_NAME: 'ScoreFlow' });
      let call;
      global.fetch = async (url, options) => { call = { url, options, body: JSON.parse(options.body) }; return { ok: true, status: 201 }; };
      const result = await emailService.sendResultReportEmail({ recipientEmail: 'asha@example.test', recipientName: 'Asha', teamName: 'NovaTech', eventName: 'TechNova Showcase', report: reportContent });
      assert.equal(result.sent, true);
      assert.equal(call.url, 'https://api.brevo.com/v3/smtp/email');
      assert.equal(call.options.headers['api-key'], key);
      assert.deepEqual(call.body.to, [{ email: 'asha@example.test', name: 'Asha' }]);
      assert.equal('cc' in call.body, false);
      assert.equal('bcc' in call.body, false);
      assert.equal(`${JSON.stringify(result)}`.includes(key), false);
    });
    await t.test('Brevo rejection and network errors are friendly and do not expose credentials', async () => {
      const key = 'mock-secret-brevo-key';
      setConfig({ BREVO_API_KEY: key, BREVO_SENDER_EMAIL: 'noreply@example.test' });
      const oldError = console.error;
      console.error = () => {};
      try {
        global.fetch = async () => ({ ok: false, status: 401, text: async () => `Rejected ${key}` });
        const rejected = await emailService.sendResultReportEmail({ recipientEmail: 'asha@example.test', teamName: 'NovaTech', eventName: 'TechNova Showcase', report: reportContent });
        assert.equal(rejected.code, 'delivery_failed');
        assert.equal(JSON.stringify(rejected).includes(key), false);
        global.fetch = async () => { throw new Error('connection unavailable'); };
        const network = await emailService.sendResultReportEmail({ recipientEmail: 'asha@example.test', teamName: 'NovaTech', eventName: 'TechNova Showcase', report: reportContent });
        assert.equal(network.code, 'service_unavailable');
        assert.equal(JSON.stringify(network).includes(key), false);
      } finally {
        console.error = oldError;
      }
    });
  } finally {
    setConfig(previous);
    global.fetch = oldFetch;
  }
});
