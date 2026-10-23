const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateDynamicEvaluationSchema,
  validateDynamicEvaluationSubmission,
} = require('../validators/dynamicEvaluationSchema');

const validSchema = {
  title: 'Project Review',
  description: 'An additional rubric.',
  sections: [{
    id: 'safety_section',
    name: 'Safety',
    description: '',
    fields: [
      { id: 'safety_score', type: 'score', label: 'Safety implementation', description: '', rationale: '', required: true, maxMarks: 10, weight: 100 },
      { id: 'risk_group', type: 'group', label: 'Risk checks', description: '', rationale: '', required: true, children: [
        { id: 'risk_yes', type: 'boolean', label: 'Safety check passed', description: '', rationale: '', required: true },
        { id: 'risk_level', type: 'single_select', label: 'Risk level', description: '', rationale: '', required: true, options: ['Low', 'Medium', 'High'] },
        { id: 'followup', type: 'multi_select', label: 'Follow-up actions', description: '', rationale: '', required: false, options: ['Review', 'Retest'] },
        { id: 'evidence', type: 'question', label: 'Evidence', description: '', rationale: '', required: true },
      ] },
    ],
  }],
};

test('validates complex nested schemas and strips unknown properties', () => {
  const checked = validateDynamicEvaluationSchema({ ...validSchema, arbitrary: '<script>bad</script>' });
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.value.arbitrary, undefined);
  assert.equal(checked.value.sections[0].fields[1].children.length, 4);
});

test('rejects unknown field types, duplicate ids, unsupported depth, and invalid weights', () => {
  const unknown = structuredClone(validSchema);
  unknown.sections[0].fields[0].type = 'javascript';
  assert.ok(validateDynamicEvaluationSchema(unknown).errors.some((error) => /unsupported field type/i.test(error)));

  const duplicate = structuredClone(validSchema);
  duplicate.sections[0].fields[1].children[0].id = 'safety_score';
  assert.ok(validateDynamicEvaluationSchema(duplicate).errors.some((error) => /duplicate field id/i.test(error)));

  const weights = structuredClone(validSchema);
  weights.sections[0].fields[0].weight = 60;
  assert.ok(validateDynamicEvaluationSchema(weights).errors.some((error) => /total 100/i.test(error)));
});

test('rejects duplicate suggestions matching the existing event criteria', () => {
  const checked = validateDynamicEvaluationSchema(validSchema, { existingNames: ['Safety implementation'] });
  assert.ok(checked.errors.some((error) => /duplicates existing criterion/i.test(error)));
});

test('validates required answers for every dynamic field type', () => {
  const errors = validateDynamicEvaluationSubmission(validSchema, {
    scores: { ai_safety_score: 8 },
    flags: { ai_risk_yes: false },
    textAnswers: { ai_risk_level: 'High', ai_evidence: 'Emergency stop is visible.' },
  });
  assert.deepEqual(errors, []);
});

test('rejects incomplete or invalid required dynamic answers', () => {
  const errors = validateDynamicEvaluationSubmission(validSchema, {
    scores: { ai_safety_score: 11 },
    flags: {},
    textAnswers: { ai_risk_level: 'Unknown', ai_evidence: '' },
  });
  assert.ok(errors.some((error) => /between 0 and 10/i.test(error)));
  assert.ok(errors.some((error) => /Yes or No/i.test(error)));
  assert.ok(errors.some((error) => /invalid option/i.test(error)));
  assert.ok(errors.some((error) => /Evidence is required/i.test(error)));
});

test('optional dynamic fields may be left blank', () => {
  const errors = validateDynamicEvaluationSubmission(validSchema, {
    scores: { ai_safety_score: 5 },
    flags: { ai_risk_yes: true },
    textAnswers: { ai_risk_level: 'Low', ai_evidence: 'Observed.' },
  });
  assert.deepEqual(errors, []);
});
