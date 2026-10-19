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
