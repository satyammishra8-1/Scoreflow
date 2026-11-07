function collectSchemaIds(schema) {
  const ids = new Set();
  function visit(fields) {
    for (const field of fields || []) {
      ids.add(field.id);
      if (field.type === 'group') visit(field.children);
    }
  }
  for (const section of schema?.sections || []) {
    ids.add(section.id);
    visit(section.fields);
  }
  return ids;
}

function uniqueId(id, usedIds) {
  const base = `ai_${id}`.slice(0, 50);
  let candidate = base.length > 1 ? base : 'ai_id';
  let suffix = 2;
  while (usedIds.has(candidate)) {
    const ending = `_${suffix++}`;
    candidate = `${base.slice(0, 50 - ending.length)}${ending}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function remapConflictingIds(schema, usedIds) {
  const copy = structuredClone(schema);
  function visit(fields) {
    for (const field of fields || []) {
      if (usedIds.has(field.id)) field.id = uniqueId(field.id, usedIds);
      else usedIds.add(field.id);
      if (field.type === 'group') visit(field.children);
    }
  }
  for (const section of copy.sections || []) {
    if (usedIds.has(section.id)) section.id = uniqueId(section.id, usedIds);
    else usedIds.add(section.id);
    visit(section.fields);
  }
  return copy;
}

function collectScoreFields(schema) {
  const scores = [];
  function visit(fields) {
    for (const field of fields || []) {
      if (field.type === 'score') scores.push(field);
      if (field.type === 'group') visit(field.children);
    }
  }
  for (const section of schema?.sections || []) visit(section.fields);
  return scores;
}

export function mergeEvaluationSchemas(existing, additions) {
  if (!additions) throw new Error('The AI service returned no evaluation schema.');
  if (!existing) return { schema: structuredClone(additions), weightsRebalanced: false };

  const usedIds = collectSchemaIds(existing);
  const safeAdditions = remapConflictingIds(additions, usedIds);
  const sections = structuredClone(existing.sections || []);
  for (const addition of safeAdditions.sections || []) {
    const matchingSection = sections.find((section) => section.name.trim().toLocaleLowerCase() === addition.name.trim().toLocaleLowerCase());
    if (matchingSection) matchingSection.fields = [...(matchingSection.fields || []), ...(addition.fields || [])];
    else sections.push(addition);
  }
  const schema = {
    ...structuredClone(existing),
    sections,
  };

  const previousScores = collectScoreFields(existing);
  const addedScores = collectScoreFields(safeAdditions);
  const scores = collectScoreFields(schema);
  let weightsRebalanced = false;
  if (previousScores.length && addedScores.length) {
    const total = scores.reduce((sum, field) => sum + Number(field.weight || 0), 0);
    if (total > 0) {
      let assigned = 0;
      scores.forEach((field, index) => {
        const weight = index === scores.length - 1
          ? Number((100 - assigned).toFixed(2))
          : Number((Number(field.weight || 0) * 100 / total).toFixed(2));
        if (weight !== Number(field.weight || 0)) weightsRebalanced = true;
        field.weight = weight;
        assigned += weight;
      });
    }
  }
  return { schema, weightsRebalanced };
}
