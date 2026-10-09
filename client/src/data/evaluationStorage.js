export function getEventStorageKey(eventId, key) {
  return `scoreflow.organizer.event.${eventId}.${key}`;
}

export function normalizeCriterion(criterion, index = 0, eventId = 'default') {
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

export const defaultCriteria = [
  {
    id: 'criterion-innovation',
    eventId: 'default',
    name: 'Innovation',
    description: 'Originality, creativity, and meaningful problem solving.',
    maxMarks: 25,
    weight: 25,
  },
  {
    id: 'criterion-technical-implementation',
    eventId: 'default',
    name: 'Technical Implementation',
    description: 'Code quality, feasibility, and technical depth.',
    maxMarks: 30,
    weight: 30,
  },
  {
    id: 'criterion-presentation',
    eventId: 'default',
    name: 'Presentation',
    description: 'Clarity of demonstration and storytelling.',
    maxMarks: 20,
    weight: 20,
  },
  {
    id: 'criterion-impact',
    eventId: 'default',
    name: 'Impact',
    description: 'Real-world usefulness and measurable value.',
    maxMarks: 25,
    weight: 25,
  },
];

export function readSavedCriteria(eventId = 'default') {
  const storageKey = getEventStorageKey(eventId, 'criteria');
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) {
      return { criteria: defaultCriteria.map((criterion, index) => normalizeCriterion(criterion, index, eventId)), error: '' };
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      throw new Error('Saved criteria data is invalid.');
    }
    const normalized = parsed.map((criterion, index) => normalizeCriterion(criterion, index, eventId));
    return { criteria: normalized, error: '' };
  } catch {
    return {
      criteria: defaultCriteria.map((criterion, index) => normalizeCriterion(criterion, index, eventId)),
      error: 'Unable to load saved criteria for this event.',
    };
  }
}

export function saveCriteria(eventId = 'default', criteria) {
  const storageKey = getEventStorageKey(eventId, 'criteria');
  const normalized = Array.isArray(criteria)
    ? criteria.map((criterion, index) => normalizeCriterion(criterion, index, eventId))
    : [];
  window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  return normalized;
}

export function deriveEvaluationStatus(session) {
  const status = session?.status || 'NOT_STARTED';
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'IN_PROGRESS') return 'IN_PROGRESS';
  return 'NOT_STARTED';
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

export function buildEvaluationRecord({ eventId, teamId, judgeId, scores = {}, feedback = '', attendance = 'Present', startedAt = Date.now() }) {
  return {
    id: `eval-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    eventId,
    teamId,
    judgeId,
    startedAt,
    completedAt: null,
    duration: 0,
    attendance,
    scores,
    totalScore: calculateRawTotal(scores, []),
    weightedScore: calculateWeightedScore(scores, []),
    feedback,
    status: 'NOT_STARTED',
  };
}

export function readSavedEvaluationSessions(eventId = 'default') {
  const storageKey = getEventStorageKey(eventId, 'evaluationSessions');
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) {
      return [];
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      throw new Error('Saved evaluation sessions are invalid.');
    }
    return parsed.filter((session) => session && typeof session.id === 'string');
  } catch {
    return [];
  }
}

export function saveEvaluationSession(eventId = 'default', session) {
  const storageKey = getEventStorageKey(eventId, 'evaluationSessions');
  const existing = readSavedEvaluationSessions(eventId);
  const next = existing.filter((item) => item.id !== session.id);
  next.push({ ...session, status: deriveEvaluationStatus(session) });
  window.localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
}
