import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeEvaluationSchemas } from '../src/data/evaluationSchemaMerge.js';

const current = {
  title: 'AI rubric', description: 'Accepted criteria', sections: [{ id: 'section_main', name: 'Original', description: '', fields: [
    { id: 'score_main', type: 'score', label: 'Original score', description: '', rationale: '', required: true, maxMarks: 10, weight: 100 },
    { id: 'group_main', type: 'group', label: 'Original details', description: '', rationale: '', required: false, children: [
      { id: 'text_main', type: 'text', label: 'Original evidence', description: '', rationale: '', required: false },
    ] },
  ] }],
};

const generated = {
  title: 'New rubric', description: 'New criteria', sections: [{ id: 'section_main', name: 'Additional', description: '', fields: [
    { id: 'score_main', type: 'score', label: 'Additional score', description: '', rationale: '', required: true, maxMarks: 20, weight: 100 },
  ] }],
};

test('regeneration appends criteria and preserves all accepted fields while balancing the additional rubric', () => {
  const merged = mergeEvaluationSchemas(current, generated);
  assert.equal(merged.schema.sections.length, 2);
  assert.equal(merged.schema.sections[0].fields[0].label, 'Original score');
  assert.equal(merged.schema.sections[0].fields[1].children[0].label, 'Original evidence');
  assert.equal(merged.schema.sections[1].fields[0].label, 'Additional score');
  assert.notEqual(merged.schema.sections[0].id, merged.schema.sections[1].id);
  assert.notEqual(merged.schema.sections[0].fields[0].id, merged.schema.sections[1].fields[0].id);
  assert.equal(merged.schema.sections[0].fields[0].weight, 50);
  assert.equal(merged.schema.sections[1].fields[0].weight, 50);
  assert.equal(merged.weightsRebalanced, true);
});

test('the first generated schema keeps its original weights and metadata', () => {
  const result = mergeEvaluationSchemas(null, generated);
  assert.deepEqual(result.schema, generated);
  assert.equal(result.weightsRebalanced, false);
});

test('adding only non-scoring fields preserves accepted scoring weights', () => {
  const result = mergeEvaluationSchemas(current, {
    title: 'Text rubric', description: '', sections: [{ id: 'text_section', name: 'Notes', description: '', fields: [
      { id: 'new_note', type: 'feedback', label: 'Additional notes', description: '', rationale: '', required: false },
    ] }],
  });
  assert.equal(result.schema.sections[0].fields[0].weight, 100);
  assert.equal(result.weightsRebalanced, false);
});

test('regeneration reuses a matching section rather than creating a duplicate section', () => {
  const existing = { title: 'Rubric', description: '', sections: [{ id: 'section_a', name: 'Original', description: 'Keep this', fields: [
    { id: 'text_a', type: 'text', label: 'Existing evidence', description: '', rationale: '', required: false },
  ] }] };
  const additions = { title: 'New', description: '', sections: [{ id: 'section_b', name: 'original', description: '', fields: [
    { id: 'text_b', type: 'feedback', label: 'New feedback', description: '', rationale: '', required: false },
  ] }] };
  const result = mergeEvaluationSchemas(existing, additions);
  assert.equal(result.schema.sections.length, 1);
  assert.equal(result.schema.sections[0].description, 'Keep this');
  assert.deepEqual(result.schema.sections[0].fields.map((field) => field.label), ['Existing evidence', 'New feedback']);
});
