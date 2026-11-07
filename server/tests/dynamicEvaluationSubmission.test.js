const test = require('node:test');
const assert = require('node:assert/strict');
const Event = require('../models/Event');
const Judge = require('../models/Judge');
const Team = require('../models/Team');
const Evaluation = require('../models/Evaluation');
const EvaluationConfiguration = require('../models/EvaluationConfiguration');
const { createEvaluation, getEvaluationByJudgeTeam } = require('../controllers/evaluationController');

const eventId = '64b000000000000000000001';
const judgeId = '64b000000000000000000002';
const teamId = '64b000000000000000000003';
const evaluationId = '64b000000000000000000004';

const dynamicSchema = {
  title: 'Combined rubric', description: '', sections: [{ id: 'section_review', name: 'Review', description: '', fields: [
    { id: 'score_field', type: 'score', label: 'Score', description: '', rationale: '', required: true, maxMarks: 10, weight: 100 },
    { id: 'boolean_field', type: 'boolean', label: 'Boolean', description: '', rationale: '', required: true },
    { id: 'text_field', type: 'text', label: 'Text', description: '', rationale: '', required: true },
    { id: 'question_field', type: 'question', label: 'Question', description: '', rationale: '', required: true },
    { id: 'feedback_field', type: 'feedback', label: 'Feedback', description: '', rationale: '', required: true },
    { id: 'single_field', type: 'single_select', label: 'Single choice', description: '', rationale: '', required: true, options: ['A', 'B'] },
    { id: 'multi_field', type: 'multi_select', label: 'Multiple choice', description: '', rationale: '', required: true, options: ['A', 'B'] },
    { id: 'group_field', type: 'group', label: 'Nested', description: '', rationale: '', required: false, children: [
      { id: 'nested_question', type: 'question', label: 'Nested answer', description: '', rationale: '', required: true },
    ] },
  ] }],
};

const answers = {
  scores: { ai_score_field: 8 },
  flags: { ai_boolean_field: false },
  textAnswers: {
    ai_text_field: 'Evidence', ai_question_field: 'Answer', ai_feedback_field: 'Comment',
    ai_single_field: 'A', ai_multi_field: JSON.stringify(['A', 'B']), ai_nested_question: 'Nested answer',
  },
};

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('completed combined evaluation validates, saves and restores all dynamic answers; repeat submission upserts the same record', async () => {
  const originals = {
    event: Event.findById, judge: Judge.findById, team: Team.findById,
    config: EvaluationConfiguration.findOne, update: Evaluation.findOneAndUpdate, find: Evaluation.findOne,
  };
  let stored = null;
  let updateCount = 0;
  Event.findById = (id) => ({ lean: async () => id === eventId ? { _id: eventId } : null });
  Judge.findById = (id) => ({ lean: async () => id === judgeId ? { _id: judgeId, eventId, assignedTeamIds: [teamId], invitationStatus: 'accepted' } : null });
  Team.findById = (id) => ({ lean: async () => id === teamId ? { _id: teamId, eventId } : null });
  EvaluationConfiguration.findOne = () => ({ select() { return this; }, lean: async () => ({ eventId, dynamicSchema }) });
  Evaluation.findOneAndUpdate = async (filter, update) => {
    updateCount += 1;
    assert.deepEqual(filter, { eventId, judgeId, teamId });
    stored = { _id: evaluationId, ...update };
    return stored;
  };
  Evaluation.findOne = () => ({ lean: async () => stored });
  try {
    const payload = { eventId, judgeId, teamId, ...answers, totalScore: 8, duration: 30, status: 'COMPLETED' };
    const first = responseRecorder();
    await createEvaluation({ body: payload }, first);
    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.body.data.textAnswers, answers.textAnswers);
    assert.deepEqual(first.body.data.flags, answers.flags);
    assert.deepEqual(first.body.data.scores, answers.scores);

    const restored = responseRecorder();
    await getEvaluationByJudgeTeam({ params: { eventId, judgeId, teamId } }, restored);
    assert.equal(restored.statusCode, 200);
    assert.deepEqual(restored.body.data.textAnswers, answers.textAnswers);
    assert.deepEqual(restored.body.data.flags, answers.flags);

    const repeated = responseRecorder();
    await createEvaluation({ body: payload }, repeated);
    assert.equal(repeated.statusCode, 200);
    assert.equal(updateCount, 2);
    assert.equal(String(stored._id), evaluationId);
    assert.equal(Evaluation.schema.indexes().some(([keys, options]) => keys.eventId === 1 && keys.judgeId === 1 && keys.teamId === 1 && options.unique), true);
  } finally {
    Event.findById = originals.event;
    Judge.findById = originals.judge;
    Team.findById = originals.team;
    EvaluationConfiguration.findOne = originals.config;
    Evaluation.findOneAndUpdate = originals.update;
    Evaluation.findOne = originals.find;
  }
});

test('incomplete or invalid dynamic answers cannot be marked complete', async () => {
  const originals = {
    event: Event.findById, judge: Judge.findById, team: Team.findById,
    config: EvaluationConfiguration.findOne, update: Evaluation.findOneAndUpdate,
  };
  Event.findById = () => ({ lean: async () => ({ _id: eventId }) });
  Judge.findById = () => ({ lean: async () => ({ _id: judgeId, eventId, assignedTeamIds: [teamId], invitationStatus: 'accepted' }) });
  Team.findById = () => ({ lean: async () => ({ _id: teamId, eventId }) });
  EvaluationConfiguration.findOne = () => ({ select() { return this; }, lean: async () => ({ eventId, dynamicSchema }) });
  Evaluation.findOneAndUpdate = async () => { throw new Error('invalid evaluation must not be saved'); };
  try {
    const res = responseRecorder();
    await createEvaluation({ body: { eventId, judgeId, teamId, totalScore: 0, duration: 0, status: 'COMPLETED', scores: {}, textAnswers: {}, flags: {} } }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.details.dynamicSchema.join(' '), /required/i);
  } finally {
    Event.findById = originals.event;
    Judge.findById = originals.judge;
    Team.findById = originals.team;
    EvaluationConfiguration.findOne = originals.config;
    Evaluation.findOneAndUpdate = originals.update;
  }
});
