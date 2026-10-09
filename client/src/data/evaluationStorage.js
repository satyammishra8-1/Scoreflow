export function getEventStorageKey(eventId, key) {
  return `scoreflow.organizer.event.${eventId}.${key}`;
}

export function normalizeCriterion(criterion, index = 0) {
  const id = typeof criterion?.id === 'string' && criterion.id.trim()
    ? criterion.id.trim()
    : `criterion-${index + 1}`;

  const weight = Number(criterion?.weight ?? 0);
  const maxMarks = Number(criterion?.maxMarks ?? 0);

  return {
    id,
    name: typeof criterion?.name === 'string' ? criterion.name.trim() : `Criterion ${index + 1}`,
    description: typeof criterion?.description === 'string' ? criterion.description.trim() : '',
    maxMarks: Number.isFinite(maxMarks) && maxMarks > 0 ? maxMarks : 25,
    weight: Number.isFinite(weight) && weight >= 0 ? weight : 0,
  };
}

export const defaultCriteria = [
  {
    id: 'criterion-innovation',
    name: 'Innovation',
    description: 'Originality, creativity, and meaningful problem solving.',
    maxMarks: 25,
    weight: 25,
  },
  {
    id: 'criterion-technical-implementation',
    name: 'Technical Implementation',
    description: 'Code quality, feasibility, and technical depth.',
    maxMarks: 30,
    weight: 30,
  },
  {
    id: 'criterion-presentation',
    name: 'Presentation',
    description: 'Clarity of demonstration and storytelling.',
    maxMarks: 20,
    weight: 20,
  },
  {
    id: 'criterion-impact',
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
      return { criteria: defaultCriteria.map((criterion, index) => normalizeCriterion(criterion, index)), error: '' };
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      throw new Error('Saved criteria data is invalid.');
    }
    const normalized = parsed.map((criterion, index) => normalizeCriterion(criterion, index));
    return { criteria: normalized, error: '' };
  } catch {
    return {
      criteria: defaultCriteria.map((criterion, index) => normalizeCriterion(criterion, index)),
      error: 'Unable to load saved criteria for this event.',
    };
  }
}

export function saveCriteria(eventId = 'default', criteria) {
  const storageKey = getEventStorageKey(eventId, 'criteria');
  const normalized = Array.isArray(criteria)
    ? criteria.map((criterion, index) => normalizeCriterion(criterion, index))
    : [];
  window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  return normalized;
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
  next.push(session);
  window.localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
}
