const test = require('node:test');
const assert = require('node:assert/strict');
const { validateModelConfig } = require('../validators/evaluationValidation');
const Event = require('../models/Event');
const EvaluationConfiguration = require('../models/EvaluationConfiguration');
const { createOrUpdateEvaluationConfiguration } = require('../controllers/evaluationController');

const eventId = '64b000000000000000000001';

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

const validDynamicSchema = {
  title: 'AI evaluation rubric',
  description: '',
  sections: [{
    id: 'impact_section',
    name: 'Impact',
    description: '',
    fields: [{
      id: 'impact_score',
      type: 'score',
      label: 'Community Impact',
      description: '',
      rationale: '',
      required: true,
      maxMarks: 10,
      weight: 100,
    }],
  }],
};

test('manual criteria still require at least one criterion', () => {
  const result = validateModelConfig('criteria-based', { criteriaBased: { criteria: [] } });
  assert.equal(result.errors.criteriaBased, 'Add at least one criterion.');
});

test('AI criteria mode can save an evaluation with no manual criteria', () => {
  const result = validateModelConfig('criteria-based', {
    criteriaBased: { criteria: [] },
    dynamicSchema: validDynamicSchema,
  });
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.criteriaBased, []);
});

test('saving an approved AI schema uses the existing configuration and preserves organizer criteria', async () => {
  const originalFindById = Event.findById;
  const originalFindOneAndUpdate = EvaluationConfiguration.findOneAndUpdate;
  let savedPayload;
  Event.findById = () => ({ select() { return this; }, lean: async () => ({ _id: eventId }) });
  EvaluationConfiguration.findOneAndUpdate = async (filter, payload) => { savedPayload = { filter, payload }; return payload; };
  try {
    const schema = {
      ...validDynamicSchema,
      sections: [{ ...validDynamicSchema.sections[0], fields: [
        { id: 'business_group', type: 'group', label: 'Business Model', description: '', rationale: '', required: true, children: [
          { id: 'revenue_score', type: 'score', label: 'Revenue model', description: '', rationale: '', required: true, maxMarks: 10, weight: 60 },
          { id: 'feasibility_score', type: 'score', label: 'Feasibility', description: '', rationale: '', required: true, maxMarks: 10, weight: 40 },
        ] },
      ] }],
    };
    const res = responseRecorder();
    await createOrUpdateEvaluationConfiguration({ params: { eventId }, body: {
      model: 'criteria-based',
      criteriaBased: { criteria: [{ name: 'Innovation', description: 'Existing criterion', maxMarks: 10, weight: 100 }] },
      dynamicSchema: schema,
    } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(savedPayload.filter, { eventId });
    assert.equal(savedPayload.payload.model, 'criteria-based');
    assert.equal(savedPayload.payload.criteriaBased.criteria[0].name, 'Innovation');
    assert.deepEqual(savedPayload.payload.dynamicSchema.sections[0].fields[0].children.map((field) => field.label), ['Revenue model', 'Feasibility']);
    assert.equal(savedPayload.payload.dynamicSchema.sections[0].fields[0].required, false);
  } finally {
    Event.findById = originalFindById;
    EvaluationConfiguration.findOneAndUpdate = originalFindOneAndUpdate;
  }
});
