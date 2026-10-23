import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModelRequirements } from '../src/data/evaluationRequirements.js';
import { calculateDynamicWeightedScore, dynamicScoreFields } from '../src/data/evaluationUtils.js';

const schema = {
  title: 'Additional rubric',
  sections: [{
    id: 'design',
    name: 'Design',
    fields: [
      { id: 'quality', type: 'score', label: 'Quality', required: true, maxMarks: 10, weight: 100 },
      { id: 'safe', type: 'boolean', label: 'Safety check', required: true },
      { id: 'choice', type: 'single_select', label: 'Quality level', required: true, options: ['Good', 'Needs work'] },
      { id: 'evidence', type: 'question', label: 'Evidence', required: false },
      { id: 'group', type: 'group', label: 'Details', children: [{ id: 'multi', type: 'multi_select', label: 'Actions', required: true, options: ['Review', 'Retest'] }] },
    ],
  }],
};

test('dynamic schema requirements gate required fields and allow optional fields to remain blank', () => {
  const requirements = buildModelRequirements({
    model: 'criteria-based', config: {}, criteria: [{ id: 'legacy', name: 'Legacy', maxMarks: 10, weight: 100 }],
    scores: { legacy: 8, ai_quality: 9 },
    textAnswers: { feedback: 'Good.', ai_choice: 'Good', ai_multi: '[]' },
    flags: { ai_safe: false }, feedback: 'Good.', dynamicSchema: schema,
  });
  assert.ok(requirements.some(({ id, done }) => id === 'ai_quality' && done));
  assert.ok(requirements.some(({ id, done }) => id === 'ai_safe' && done));
  assert.ok(requirements.some(({ id, done }) => id === 'ai_choice' && done));
  assert.ok(requirements.some(({ id, done }) => id === 'ai_multi' && !done));
  assert.ok(!requirements.some(({ id }) => id === 'ai_evidence'));
});

test('dynamic nested numeric fields calculate their independent weighted rubric score', () => {
  assert.equal(dynamicScoreFields(schema).length, 1);
  assert.equal(calculateDynamicWeightedScore({ ai_quality: 7.5 }, schema), 75);
});

test('existing model requirements remain unchanged when no dynamic schema exists', () => {
  const requirements = buildModelRequirements({
    model: 'criteria-based', config: {}, criteria: [{ id: 'legacy', name: 'Legacy', maxMarks: 10, weight: 100 }],
    scores: { legacy: 8 }, feedback: 'Complete.',
  });
  assert.deepEqual(requirements.map(({ id }) => id), ['legacy', 'feedback']);
});
