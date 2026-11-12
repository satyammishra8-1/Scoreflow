const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const EmailDelivery = require('../models/EmailDelivery');
const { createEmailDeliveryController, getTrackingIds } = require('../controllers/emailDeliveryController');
const { normalizeProviderEvent } = require('../services/emailService');
const { ensureProviderMessageIdIndex } = require('../scripts/ensureEmailDeliveryProviderMessageIndex');

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('EmailDelivery declares one provider ID index with unique nonempty IDs and no duplicate key patterns', () => {
  const indexes = EmailDelivery.schema.indexes();
  const idIndexes = indexes.filter(([keys]) => JSON.stringify(keys) === JSON.stringify({ providerMessageId: 1 }));
  assert.equal(idIndexes.length, 1);
  assert.equal(idIndexes[0][1].unique, true);
  assert.deepEqual(idIndexes[0][1].partialFilterExpression, { providerMessageId: { $type: 'string', $gt: '' } });
  const patterns = indexes.map(([keys]) => JSON.stringify(keys));
  assert.equal(new Set(patterns).size, patterns.length);
  assert.equal(indexes.some(([, options]) => options.expireAfterSeconds !== undefined), false);
});

test('provider index repair replaces only the obsolete nonunique index after checking existing IDs', async () => {
  const dropped = [];
  let created = null;
  const result = await ensureProviderMessageIdIndex({
    listIndexes: () => ({ toArray: async () => [{ name: '_id_', key: { _id: 1 }, unique: true }, { name: 'providerMessageId_1', key: { providerMessageId: 1 } }] }),
    aggregate: () => ({ next: async () => null }),
    dropIndex: async (name) => dropped.push(name),
    createIndex: async (key, options) => { created = { key, options }; return 'providerMessageId_1'; },
  });
  assert.deepEqual(dropped, ['providerMessageId_1']);
  assert.equal(created.options.unique, true);
  assert.deepEqual(created.options.partialFilterExpression, { providerMessageId: { $type: 'string', $gt: '' } });
  assert.equal(result.changed, true);
});

test('provider index repair refuses to drop the old index when duplicate IDs exist', async () => {
  let dropped = false;
  await assert.rejects(() => ensureProviderMessageIdIndex({
    listIndexes: () => ({ toArray: async () => [{ name: 'providerMessageId_1', key: { providerMessageId: 1 } }] }),
    aggregate: () => ({ next: async () => ({ _id: 'redacted', count: 2 }) }),
    dropIndex: async () => { dropped = true; },
    createIndex: async () => { throw new Error('must not create'); },
  }), /Duplicate nonempty provider message IDs/);
  assert.equal(dropped, false);
});

test('Brevo camelCase and underscore event names map to tracked email states', () => {
  assert.deepEqual(normalizeProviderEvent({ event: 'hardBounce' }), { event: 'hard_bounce', status: 'hard_bounced' });
  assert.deepEqual(normalizeProviderEvent({ event: 'soft_bounce' }), { event: 'soft_bounce', status: 'soft_bounced' });
  assert.deepEqual(normalizeProviderEvent({ event: 'sent' }), { event: 'sent', status: 'sent' });
  assert.deepEqual(normalizeProviderEvent({ event: 'delivered' }), { event: 'delivered', status: 'delivered' });
});

test('Brevo webhook authenticates, correlates by provider ID or tracking tag, and does not mutate payload tags', async () => {
  const updates = [];
  const controller = createEmailDeliveryController({
    DeliveryModel: { updateOne: async (query, update) => { updates.push({ query, update }); return { modifiedCount: 1 }; } },
    config: () => ({ username: 'hook-user', password: 'hook-password' }),
  });
  const payload = {
    event: 'hardBounce', 'message-id': '<brevo-id@example.test>',
    tags: ['scoreflow', 'result_report', 'tracking-123'], tag: '["tracking-123"]',
    ts_event: 1770000000, reason: 'Mailbox does not exist',
  };
  const originalTags = [...payload.tags];
  const auth = `Basic ${Buffer.from('hook-user:hook-password').toString('base64')}`;
  const denied = response();
  await controller.receiveBrevoEvent({ headers: { authorization: 'Basic wrong' }, body: payload }, denied);
  assert.equal(denied.statusCode, 401);
  assert.equal(updates.length, 0);

  const accepted = response();
  await controller.receiveBrevoEvent({ headers: { authorization: auth }, body: [payload] }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.updated, 1);
  assert.deepEqual(payload.tags, originalTags);
  assert.equal(updates[0].update.$set.status, 'hard_bounced');
  assert.equal(updates[0].update.$set.providerMessageId, '<brevo-id@example.test>');
  assert.equal(updates[0].update.$set.reason, 'Mailbox does not exist');
  assert.ok(JSON.stringify(updates[0].query).includes('tracking-123'));
});

test('email delivery status listing validates the event ID before querying MongoDB', async () => {
  let queried = false;
  const controller = createEmailDeliveryController({ DeliveryModel: { find: () => { queried = true; } } });
  const res = response();
  await controller.listByEvent({ params: { eventId: 'bad-id' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
  assert.equal(mongoose.Types.ObjectId.isValid('bad-id'), false);
});
