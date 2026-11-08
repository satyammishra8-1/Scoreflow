const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Team = require('../models/Team');
const Judge = require('../models/Judge');
const EvaluationConfiguration = require('../models/EvaluationConfiguration');
const Evaluation = require('../models/Evaluation');
const { deleteEvent } = require('../controllers/eventController');

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function query(value, sessionCapture) {
  return {
    select() { return this; },
    session(session) { sessionCapture(session); return this; },
    lean: async () => value,
  };
}

test('event cascade deletion runs inside one Mongo transaction', async (t) => {
  const models = [Event, Team, Judge, EvaluationConfiguration, Evaluation];
  const names = ['findOne', 'findOneAndDelete', 'deleteMany'];
  const originals = models.map((model) => names.map((name) => model[name]));
  const originalStartSession = mongoose.startSession;
  t.after(() => {
    models.forEach((model, modelIndex) => names.forEach((name, nameIndex) => {
      if (originals[modelIndex][nameIndex] !== undefined) model[name] = originals[modelIndex][nameIndex];
    }));
    mongoose.startSession = originalStartSession;
  });

  const session = { withTransaction: async (callback) => callback(), endSession: async () => {} };
  mongoose.startSession = async () => session;
  Event.findOne = () => query({ _id: 'event-1' }, (seen) => assert.equal(seen, session));
  Event.findOneAndDelete = () => query({ _id: 'event-1' }, (seen) => assert.equal(seen, session));
  const deletes = [];
  for (const model of [Team, Judge, EvaluationConfiguration, Evaluation]) {
    model.deleteMany = async (_filter, options) => { deletes.push(options.session); return { deletedCount: 1 }; };
  }

  const res = response();
  await deleteEvent({ params: { eventId: '64b000000000000000000001' }, auth: { sub: 'owner-1' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(deletes.length, 4);
  assert.ok(deletes.every((seen) => seen === session));
});

test('event deletion does not proceed after a cascade operation fails', async (t) => {
  const originals = {
    startSession: mongoose.startSession,
    findOne: Event.findOne,
    findOneAndDelete: Event.findOneAndDelete,
    deleteTeams: Team.deleteMany,
    deleteJudges: Judge.deleteMany,
    consoleError: console.error,
  };
  t.after(() => {
    mongoose.startSession = originals.startSession;
    Event.findOne = originals.findOne;
    Event.findOneAndDelete = originals.findOneAndDelete;
    Team.deleteMany = originals.deleteTeams;
    Judge.deleteMany = originals.deleteJudges;
    console.error = originals.consoleError;
  });
  console.error = () => {};
  let transactionStarted = false;
  let eventDeleteAttempted = false;
  const session = { withTransaction: async (callback) => { transactionStarted = true; await callback(); }, endSession: async () => {} };
  mongoose.startSession = async () => session;
  Event.findOne = () => query({ _id: 'event-1' }, () => {});
  Event.findOneAndDelete = () => { eventDeleteAttempted = true; return query({ _id: 'event-1' }, () => {}); };
  Team.deleteMany = async () => ({ deletedCount: 1 });
  Judge.deleteMany = async () => { throw new Error('temporary database failure'); };

  const res = response();
  await deleteEvent({ params: { eventId: '64b000000000000000000001' }, auth: { sub: 'owner-1' } }, res);
  assert.equal(transactionStarted, true);
  assert.equal(eventDeleteAttempted, false);
  assert.equal(res.statusCode, 500);
});
