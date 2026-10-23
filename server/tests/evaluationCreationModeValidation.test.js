const test = require('node:test');
const assert = require('node:assert/strict');
const { validateModelConfig } = require('../validators/evaluationValidation');

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
