const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmailService } = require('../services/emailService');

function fixture({ fetchImpl, suppressed = null, failUpdate = false } = {}) {
  const records = [];
  const calls = [];
  const logs = [];
  const model = {
    findOne(query) {
      calls.push({ kind: 'suppression', query });
      return { select: async () => suppressed };
    },
    create: async (record) => {
      const row = { ...record, _id: `delivery-${records.length + 1}` };
      records.push(row);
      calls.push({ kind: 'create', record: row });
      return row;
    },
    updateOne: async (query, update) => {
      calls.push({ kind: 'update', query, update });
      if (failUpdate) throw new Error('tracking write failed');
      const row = records.find((item) => item._id === query._id);
      if (row) Object.assign(row, update.$set);
      return { modifiedCount: row ? 1 : 0 };
    },
  };
  const service = createEmailService({
    DeliveryModel: model,
    configProvider: () => ({ apiKey: 'xkeysib-test-secret', senderEmail: 'verified@example.test', senderName: 'ScoreFlow', clientUrl: 'https://scoreflow.example' }),
    fetchImpl: async (...args) => { calls.push({ kind: 'fetch', args }); return fetchImpl(...args); },
    logger: { error: (...args) => logs.push(args.join(' ')) },
  });
  return { service, records, calls, logs };
}

const payload = {
  category: 'result_report', recipientEmail: 'member@example.test', recipientName: 'Member',
  subject: 'Report', htmlContent: '<p>Report</p>', textContent: 'Report', eventId: '64b000000000000000000001',
};

test('shared Brevo sender submits one validated recipient and records acceptance separately from delivery', async () => {
  const fx = fixture({ fetchImpl: async (url, options) => ({ ok: true, status: 201, json: async () => ({ messageId: '<provider-id@example.test>' }) }) });
  const result = await fx.service.sendTransactionalEmail(payload);
  const call = fx.calls.find((entry) => entry.kind === 'fetch').args;
  const body = JSON.parse(call[1].body);
  assert.equal(call[0], 'https://api.brevo.com/v3/smtp/email');
  assert.equal(call[1].headers['api-key'], 'xkeysib-test-secret');
  assert.deepEqual(body.to, [{ email: 'member@example.test', name: 'Member' }]);
  assert.equal(body.tags.includes(result.trackingId), true);
  assert.equal(JSON.stringify(result).includes('xkeysib-test-secret'), false);
  assert.equal(result.accepted, true);
  assert.equal(result.status, 'accepted');
  assert.match(result.message, /not yet confirmed/);
  assert.equal(fx.records[0].status, 'accepted');
  assert.equal(fx.records[0].providerMessageId, '<provider-id@example.test>');
});

test('a provider 2xx remains accepted if saving its response fails', async () => {
  const fx = fixture({ failUpdate: true, fetchImpl: async () => ({ ok: true, status: 201, json: async () => ({ messageId: 'provider-id' }) }) });
  const result = await fx.service.sendTransactionalEmail(payload);
  assert.equal(result.accepted, true);
  assert.equal(result.status, 'accepted');
  assert.ok(fx.logs.some((entry) => entry.includes('Brevo accepted the email')));
});

test('provider errors and network timeouts are not reported as delivered', async () => {
  const rejection = fixture({ fetchImpl: async () => ({ ok: false, status: 400, text: async () => 'recipient invalid; private@example.test' }) });
  const rejected = await rejection.service.sendTransactionalEmail(payload);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.status, 'failed');
  assert.equal(rejection.records[0].status, 'failed');
  assert.equal(rejection.logs.join(' ').includes('private@example.test'), false);

  const timeout = fixture({ fetchImpl: async () => { throw new Error('timeout'); } });
  const unknown = await timeout.service.sendTransactionalEmail(payload);
  assert.equal(unknown.status, 'unknown');
  assert.match(unknown.message, /acceptance is unknown/);
  assert.equal(timeout.records[0].status, 'unknown');
});

test('invalid recipients and previously suppressed addresses never reach Brevo', async () => {
  const invalid = fixture({ fetchImpl: async () => { throw new Error('must not run'); } });
  assert.equal((await invalid.service.sendTransactionalEmail({ ...payload, recipientEmail: 'bad' })).code, 'invalid_recipient');
  assert.equal(invalid.calls.some((entry) => entry.kind === 'fetch'), false);

  const suppressed = fixture({ suppressed: { _id: 'old-delivery', status: 'hard_bounced' }, fetchImpl: async () => { throw new Error('must not run'); } });
  const result = await suppressed.service.sendTransactionalEmail(payload);
  assert.equal(result.status, 'suppressed');
  assert.equal(suppressed.calls.some((entry) => entry.kind === 'create' || entry.kind === 'fetch'), false);
});

test('SMTP credentials are rejected before recording or submitting an email', async () => {
  const fx = fixture({ fetchImpl: async () => { throw new Error('must not run'); } });
  const service = createEmailService({
    DeliveryModel: fx.service, fetchImpl: async () => { throw new Error('must not run'); },
    configProvider: () => ({ apiKey: 'xsmtpsib-wrong-kind', senderEmail: 'verified@example.test', senderName: 'ScoreFlow' }),
    logger: { error() {} },
  });
  const result = await service.sendTransactionalEmail(payload);
  assert.equal(result.code, 'invalid_configuration');
  assert.equal(fx.calls.some((entry) => entry.kind === 'fetch'), false);
});
