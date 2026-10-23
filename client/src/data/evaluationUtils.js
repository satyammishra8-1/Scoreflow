export function normalizeCriterion(criterion, index = 0, eventId = '') {
  const id = typeof criterion?.id === 'string' && criterion.id.trim()
    ? criterion.id.trim()
    : `criterion-${index + 1}`;
  const weight = Number(criterion?.weight ?? 0);
  const maxMarks = Number(criterion?.maxMarks ?? 0);
  return {
    id,
    eventId: typeof criterion?.eventId === 'string' ? criterion.eventId : eventId,
    name: typeof criterion?.name === 'string' ? criterion.name.trim() : `Criterion ${index + 1}`,
    description: typeof criterion?.description === 'string' ? criterion.description.trim() : '',
    maxMarks: Number.isFinite(maxMarks) && maxMarks > 0 ? maxMarks : 25,
    weight: Number.isFinite(weight) && weight >= 0 ? weight : 0,
  };
}

export function calculateRawTotal(scores = {}, criteria = []) {
  return criteria.reduce((sum, criterion) => {
    const score = Number(scores[criterion.id] ?? 0);
    const maxMarks = Number(criterion.maxMarks || 0);
    const safeScore = Number.isFinite(score) ? Math.min(Math.max(score, 0), maxMarks) : 0;
    return sum + safeScore;
  }, 0);
}

export function calculateWeightedScore(scores = {}, criteria = []) {
  const totalWeight = criteria.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0);
  if (totalWeight === 0) return 0;
  const rawTotal = criteria.reduce((sum, criterion) => {
    const score = Number(scores[criterion.id] ?? 0);
    const maxMarks = Number(criterion.maxMarks || 0);
    const safeScore = Number.isFinite(score) ? Math.min(Math.max(score, 0), maxMarks) : 0;
    return sum + ((safeScore / (maxMarks || 1)) * Number(criterion.weight || 0));
  }, 0);
  return Number(Math.min(rawTotal, totalWeight).toFixed(2));
}

export function dynamicScoreFields(schema) {
  const fields = [];
  function visit(nodes, path = []) {
    for (const field of nodes || []) {
      if (field.type === 'group') visit(field.children, [...path, field.label]);
      else if (field.type === 'score') fields.push({ ...field, label: [...path, field.label].join(' / ') });
    }
  }
  for (const section of schema?.sections || []) visit(section.fields, [section.name]);
  return fields;
}

export function calculateDynamicWeightedScore(scores = {}, schema = null) {
  return Number(dynamicScoreFields(schema).reduce((sum, field) => {
    const value = Number(scores[`ai_${field.id}`]);
    const score = Number.isFinite(value) ? Math.min(Math.max(value, 0), Number(field.maxMarks || 0)) : 0;
    return sum + (score / Number(field.maxMarks || 1)) * Number(field.weight || 0);
  }, 0).toFixed(2));
}
