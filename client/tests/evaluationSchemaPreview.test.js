import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvaluationSchemaPreview } from '../src/data/evaluationSchemaPreview.js';

const domains = [
  ['Hackathon', 'Innovation'],
  ['Startup Pitch', 'Market potential'],
  ['Debate Competition', 'Argument quality'],
  ['Dance Competition', 'Choreography'],
  ['Poster Exhibition', 'Visual communication'],
  ['Coding Competition', 'Correctness'],
  ['Sports Performance', 'Technique'],
  ['Academic Presentation', 'Evidence quality'],
];

test('preview model renders domain-neutral section and score summaries', () => {
  for (const [title, criterion] of domains) {
    const preview = buildEvaluationSchemaPreview({
      title,
      sections: [{ id: 'section_main', name: criterion, fields: [{
        id: 'score_main', type: 'score', label: criterion, required: true, maxMarks: 10, weight: 100,
      }] }],
    });
    assert.equal(preview.title, title);
    assert.equal(preview.sections[0].fields[0].scoreSummary, '10 marks | 100%');
  }
});

test('preview model preserves nested criteria and supported non-scoring field kinds', () => {
  const preview = buildEvaluationSchemaPreview({ title: 'Pitch', sections: [{
    id: 'pitch_section', name: 'Pitch', fields: [
      { id: 'business_group', type: 'group', label: 'Business model', required: false, children: [
        { id: 'revenue_question', type: 'question', label: 'Revenue model', required: true },
        { id: 'feasibility_feedback', type: 'feedback', label: 'Feasibility notes', required: false },
      ] },
      { id: 'market_choices', type: 'multi_select', label: 'Target audience', required: false, options: ['Students', 'Small business'] },
    ],
  }] });
  const [group, choices] = preview.sections[0].fields;
  assert.equal(group.kind, 'Subcriteria');
  assert.equal(group.children[0].kind, 'Judge question');
  assert.equal(group.children[1].kind, 'Feedback');
  assert.equal(choices.kind, 'Select all that apply');
});
