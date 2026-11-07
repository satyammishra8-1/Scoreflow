const test = require('node:test');
const assert = require('node:assert/strict');
const Event = require('../models/Event');
const controller = require('../controllers/eventController');
const OrganizerAccount = require('../models/OrganizerAccount');

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}

test('new events derive ownership from the authenticated session and never return owner ids', async (t) => {
  const original = Event.create;
  t.after(() => { Event.create = original; });
  let created;
  Event.create = async (value) => { created = value; return { _id: 'event-1', ...value }; };
  const res = response();
  await controller.createEvent({ auth: { sub: 'organizer-1' }, body: {
    name: 'Owned event', type: 'Hackathon', date: '2026-11-07', venue: 'Campus', description: 'Organizer event',
  } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created.ownerId, 'organizer-1');
  assert.equal(Object.hasOwn(res.body.data, 'ownerId'), false);
});

test('organizer event listing is scoped to the verified organizer id', async (t) => {
  const original = Event.find;
  t.after(() => { Event.find = original; });
  let query;
  Event.find = (value) => {
    query = value;
    return { sort() { return this; }, lean: async () => [{ _id: 'event-1', ownerId: value.ownerId, name: 'Own event' }] };
  };
  const res = response();
  await controller.listEvents({ auth: { sub: 'organizer-1' } }, res);
  assert.deepEqual(query, { ownerId: 'organizer-1' });
  assert.equal(res.body.data.length, 1);
});

test('organizer account email has a database unique index and is normalized', () => {
  const email = OrganizerAccount.schema.path('email');
  assert.equal(email.options.unique, true);
  assert.equal(email.options.lowercase, true);
  assert.equal(email.options.trim, true);
  assert.equal(OrganizerAccount.schema.path('passwordHash').options.select, false);
});
