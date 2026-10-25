const FIELD_KIND_LABELS = {
  score: 'Score',
  boolean: 'Yes / No',
  text: 'Evidence',
  question: 'Judge question',
  feedback: 'Feedback',
  single_select: 'Select one',
  multi_select: 'Select all that apply',
  group: 'Subcriteria',
};

function previewField(field) {
  return {
    id: field.id,
    label: field.label,
    kind: FIELD_KIND_LABELS[field.type] || 'Evaluation field',
    type: field.type,
    required: field.type !== 'group' && field.required === true,
    scoreSummary: field.type === 'score' ? `${field.maxMarks} marks | ${field.weight}%` : '',
    childCount: field.type === 'group' ? (field.children || []).length : 0,
    children: field.type === 'group' ? (field.children || []).map(previewField) : [],
  };
}

export function buildEvaluationSchemaPreview(schema) {
  if (!schema || !Array.isArray(schema.sections)) return null;
  return {
    title: schema.title,
    description: schema.description || '',
    sections: schema.sections.map((section) => ({
      id: section.id,
      name: section.name,
      description: section.description || '',
      fields: (section.fields || []).map(previewField),
    })),
  };
}
