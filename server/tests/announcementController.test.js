const test = require('node:test');
const assert = require('node:assert/strict');

const eventId = '64b000000000000000000001';
const otherEventId = '64b000000000000000000002';
const judgeOne = { _id: '64b000000000000000000011', eventId, name: 'Judge One', email: 'judge@example.test' };
const judgeTwo = { _id: '64b000000000000000000012', eventId, name: 'Judge Two', email: ' judge@example.test ' };
const outsideJudge = { _id: '64b000000000000000000013', eventId: otherEventId, name: 'Outside', email: 'outside@example.test' };
const teamOne = { _id: '64b000000000000000000021', eventId, teamNumber: '12', teamName: 'NovaTech', members: [{ email: 'one@example.test' }, { email: 'shared@example.test' }] };
const teamTwo = { _id: '64b000000000000000000022', eventId, teamNumber: '13', teamName: 'Orbit', members: [{ email: 'shared@example.test' }, { email: 'two@example.test' }] };
const outsideTeam = { _id: '64b000000000000000000023', eventId: otherEventId, teamNumber: '1', teamName: 'Outside', members: [{ email: 'outside@example.test' }] };

const Event = require('../models/Event');
const Judge = require('../models/Judge');
const Team = require('../models/Team');
const Announcement = require('../models/Announcement');
const emailService = require('../services/emailService');

let judges = [judgeOne, judgeTwo, outsideJudge];
let teams = [teamOne, teamTwo, outsideTeam];
let sentEmails = [];
let saved = [];
let history = [];
let forceEmailFailure = false;

Event.findById = (id) => ({
  select() { return this; },
  lean: async () => String(id) === eventId ? { _id: eventId, name: 'Demo Event' } : null,
});
function queryRows(rows, query) {
  return {
    lean: async () => rows.filter((item) => String(item.eventId) === String(query.eventId)
      && (!query._id || query._id.$in.map(String).includes(String(item._id)))),
  };
}
Judge.find = (query) => queryRows(judges, query);
Team.find = (query) => queryRows(teams, query);
Announcement.create = async (record) => {
  const value = { ...record, _id: `saved-${saved.length + 1}`, createdAt: new Date(), toObject() { return { ...this }; } };
  saved.push(value);
  return value;
};
Announcement.find = (query) => ({
  select() { return this; },
  sort() { return this; },
  lean: async () => history.filter((item) => String(item.eventId) === String(query.eventId)),
});
emailService.sendAnnouncementEmail = async ({ recipientEmail }) => {
  sentEmails.push(recipientEmail);
  return forceEmailFailure ? { sent: false, message: 'Mock Brevo rejection.' } : { sent: true };
};
const controller = require('../controllers/announcementController');

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}
async function post(body) {
  const res = response();
  await controller.createAnnouncement({ params: { eventId }, body }, res);
  return res;
}
function reset() { sentEmails = []; saved = []; forceEmailFailure = false; }

test('announcement controller validates recipient resolution, isolation, delivery, and history', async (t) => {
  await t.test('all judges sends once per unique saved email', async () => {
    reset();
    const res = await post({ audienceType: 'judges', recipientMode: 'all', subject: ' Hello ', message: ' Update ' });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(sentEmails, ['judge@example.test']);
    assert.equal(res.body.data.status, 'sent');
    assert.equal(res.body.data.recipientCount, 1);
  });
  await t.test('specific judges sends only selected event judges', async () => {
    reset();
    const res = await post({ audienceType: 'judges', recipientMode: 'specific', recipientIds: [judgeOne._id], subject: 'Update', message: 'Hi' });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(sentEmails, ['judge@example.test']);
  });
  await t.test('all teams expands members and deduplicates shared email addresses', async () => {
    reset();
    const res = await post({ audienceType: 'teams', recipientMode: 'all', subject: 'Update', message: 'Hi' });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(sentEmails.sort(), ['one@example.test', 'shared@example.test', 'two@example.test']);
  });
  await t.test('specific teams expands every selected team member', async () => {
    reset();
    const res = await post({ audienceType: 'teams', recipientMode: 'specific', recipientIds: [teamOne._id], subject: 'Update', message: 'Hi' });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(sentEmails.sort(), ['one@example.test', 'shared@example.test']);
  });
  await t.test('cross-event judge IDs are rejected', async () => {
    reset();
    const res = await post({ audienceType: 'judges', recipientMode: 'specific', recipientIds: [outsideJudge._id], subject: 'Update', message: 'Hi' });
    assert.equal(res.statusCode, 400);
    assert.equal(sentEmails.length, 0);
  });
  await t.test('cross-event team IDs are rejected', async () => {
    reset();
    const res = await post({ audienceType: 'teams', recipientMode: 'specific', recipientIds: [outsideTeam._id], subject: 'Update', message: 'Hi' });
    assert.equal(res.statusCode, 400);
    assert.equal(sentEmails.length, 0);
  });
  await t.test('empty recipient selection and no resolved addresses are rejected', async () => {
    reset();
    const emptySpecific = await post({ audienceType: 'judges', recipientMode: 'specific', recipientIds: [], subject: 'Update', message: 'Hi' });
    assert.equal(emptySpecific.statusCode, 400);
    const previous = teams;
    teams = [{ _id: teamOne._id, eventId, members: [{ email: '' }] }];
    const noEmail = await post({ audienceType: 'teams', recipientMode: 'all', subject: 'Update', message: 'Hi' });
    teams = previous;
    assert.equal(noEmail.statusCode, 400);
  });
  await t.test('missing subject and message are rejected', async () => {
    reset();
    assert.equal((await post({ audienceType: 'judges', recipientMode: 'all', message: 'Hi' })).statusCode, 400);
    assert.equal((await post({ audienceType: 'judges', recipientMode: 'all', subject: 'Update' })).statusCode, 400);
  });
  await t.test('GET history filters by requested event and removes stored addresses', async () => {
    const res = response();
    history = [
      { eventId, subject: 'Current', resolvedRecipients: ['private@example.test'], sentCount: 1, failedCount: 0 },
      { eventId: otherEventId, subject: 'Other', resolvedRecipients: ['other@example.test'], sentCount: 1, failedCount: 0 },
    ];
    await controller.listAnnouncementsByEvent({ params: { eventId } }, res);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].subject, 'Current');
    assert.equal(res.body.data[0].recipientCount, 1);
    assert.equal('resolvedRecipients' in res.body.data[0], false);
  });
  await t.test('Brevo failures are recorded honestly', async () => {
    reset(); forceEmailFailure = true;
    const res = await post({ audienceType: 'judges', recipientMode: 'specific', recipientIds: [judgeOne._id], subject: 'Update', message: 'Hi' });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.status, 'failed');
    assert.equal(res.body.data.sentCount, 0);
    assert.equal(res.body.data.failedCount, 1);
    assert.match(res.body.deliveryMessage, /Mock Brevo rejection/);
  });
});
