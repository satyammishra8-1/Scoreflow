const ALLOWED_FIELD_TYPES = new Set(['score', 'boolean', 'text', 'question', 'feedback', 'single_select', 'multi_select', 'group']);
const MAX_SECTIONS = 20;
const MAX_FIELDS = 100;
const MAX_DEPTH = 4;

function boundedText(value, label, maxLength, errors, { required = false } = {}) {
  if (typeof value !== 'string') {
    if (required) errors.push(label + ' is required.');
    return '';
  }
  const text = value.trim();
  if (required && !text) errors.push(label + ' is required.');
  if (text.length > maxLength) errors.push(label + ' must be at most ' + maxLength + ' characters.');
  return text;
}

function validateDynamicEvaluationSchema(value, { existingNames = [] } = {}) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { errors: ['Schema must be an object.'], value: null };
  }
  const title = boundedText(value.title, 'Schema title', 150, errors, { required: true });
  const description = boundedText(value.description || '', 'Schema description', 1000, errors);
  if (!Array.isArray(value.sections) || value.sections.length === 0 || value.sections.length > MAX_SECTIONS) {
    errors.push('Schema must contain between 1 and ' + MAX_SECTIONS + ' sections.');
  }
  const ids = new Set();
  const existing = new Set(existingNames.map((name) => String(name || '').trim().toLocaleLowerCase()).filter(Boolean));
  let fieldCount = 0;
  function normalizeField(field, depth, path) {
    fieldCount += 1;
    if (fieldCount > MAX_FIELDS) errors.push('Schema may contain at most ' + MAX_FIELDS + ' fields.');
    if (depth > MAX_DEPTH) errors.push('Schema nesting may not exceed ' + MAX_DEPTH + ' levels.');
    if (!field || typeof field !== 'object' || Array.isArray(field)) {
      errors.push(path + ' must be an object.');
      return null;
    }
    const id = boundedText(field.id, path + ' id', 50, errors, { required: true });
    if (id && !/^[a-zA-Z][a-zA-Z0-9_-]{1,49}$/.test(id)) errors.push(path + ' id contains unsupported characters.');
    if (id && ids.has(id)) errors.push('Duplicate field id: ' + id + '.');
    if (id) ids.add(id);
    const type = field.type;
    if (!ALLOWED_FIELD_TYPES.has(type)) errors.push(path + ' has an unsupported field type.');
    const label = boundedText(field.label, path + ' label', 150, errors, { required: true });
    const fieldDescription = boundedText(field.description || '', path + ' description', 1000, errors);
    const rationale = boundedText(field.rationale || '', path + ' rationale', 400, errors);
    if (typeof field.required !== 'boolean') errors.push(path + ' required must be a boolean.');
    if (type !== 'score' && (field.maxMarks != null || field.weight != null)) errors.push(path + ' cannot contain score values for this field type.');
    if (type !== 'group' && field.children != null) errors.push(path + ' cannot contain child fields for this field type.');
    if (!['single_select', 'multi_select'].includes(type) && field.options != null) errors.push(path + ' cannot contain options for this field type.');
    const result = { id, type, label, description: fieldDescription, rationale, required: type !== 'group' && field.required === true };
    if (type === 'score') {
      const maxMarks = Number(field.maxMarks);
      if (!Number.isFinite(maxMarks) || maxMarks <= 0 || maxMarks > 10000) errors.push(path + ' needs maxMarks between 0 and 10000.');
      result.maxMarks = maxMarks;
      if (field.weight != null && field.weight !== '') {
        const weight = Number(field.weight);
        if (!Number.isFinite(weight) || weight < 0 || weight > 100) errors.push(path + ' weight must be from 0 to 100.');
        result.weight = weight;
      }
    }
    if (type === 'single_select' || type === 'multi_select') {
      if (!Array.isArray(field.options) || field.options.length < 2 || field.options.length > 30) errors.push(path + ' must have between 2 and 30 options.');
      const options = Array.isArray(field.options) ? field.options.map((option, index) => boundedText(option, path + ' option ' + (index + 1), 120, errors, { required: true })) : [];
      if (new Set(options.map((option) => option.toLocaleLowerCase())).size !== options.length) errors.push(path + ' options must be unique.');
      result.options = options;
    }
    if (type === 'group') {
      if (!Array.isArray(field.children) || field.children.length === 0) errors.push(path + ' groups need at least one child field.');
      result.children = Array.isArray(field.children) ? field.children.map((child, index) => normalizeField(child, depth + 1, path + ' child ' + (index + 1))).filter(Boolean) : [];
    }
    if (label && existing.has(label.toLocaleLowerCase())) errors.push('Suggestion duplicates existing criterion "' + label + '".');
    return result;
  }
  const sections = Array.isArray(value.sections) ? value.sections.slice(0, MAX_SECTIONS).map((section, index) => {
    const path = 'Section ' + (index + 1);
    if (!section || typeof section !== 'object' || Array.isArray(section)) {
      errors.push(path + ' must be an object.');
      return null;
    }
    const id = boundedText(section.id, path + ' id', 50, errors, { required: true });
    if (id && !/^[a-zA-Z][a-zA-Z0-9_-]{1,49}$/.test(id)) errors.push(path + ' id contains unsupported characters.');
    if (id && ids.has(id)) errors.push('Duplicate field id: ' + id + '.');
    if (id) ids.add(id);
    const name = boundedText(section.name, path + ' name', 150, errors, { required: true });
    if (name && existing.has(name.toLocaleLowerCase())) errors.push('Suggestion duplicates existing criterion "' + name + '".');
    const sectionDescription = boundedText(section.description || '', path + ' description', 1000, errors);
    if (!Array.isArray(section.fields) || section.fields.length === 0) errors.push(path + ' needs at least one field.');
    const fields = Array.isArray(section.fields) ? section.fields.map((field, fieldIndex) => normalizeField(field, 1, path + ' field ' + (fieldIndex + 1))).filter(Boolean) : [];
    return { id, name, description: sectionDescription, fields };
  }).filter(Boolean) : [];
  function checkSiblingNames(fields, path) {
    const names = new Set();
    for (const field of fields || []) {
      if (!field) continue;
      const key = field.label.toLocaleLowerCase();
      if (names.has(key)) errors.push(path + ' contains duplicate field name "' + field.label + '".');
      names.add(key);
      if (field.type === 'group') checkSiblingNames(field.children, path + ' / ' + field.label);
    }
  }
  const sectionNames = new Set();
  for (const section of sections) {
    const key = section.name.toLocaleLowerCase();
    if (sectionNames.has(key)) errors.push('Schema contains duplicate section name "' + section.name + '".');
    sectionNames.add(key);
    checkSiblingNames(section.fields, 'Section "' + section.name + '"');
  }
  const scoreFields = [];
  function collect(fields) {
    for (const field of fields || []) {
      if (field.type === 'score') scoreFields.push(field);
      if (field.type === 'group') collect(field.children);
    }
  }
  sections.forEach((section) => collect(section.fields));
  if (scoreFields.length > 0 && scoreFields.some((field) => field.weight == null)) errors.push('Every numeric score field needs a weight.');
  const weightTotal = scoreFields.reduce((total, field) => total + Number(field.weight || 0), 0);
  if (scoreFields.length > 0 && Math.abs(weightTotal - 100) > 0.01) errors.push('Numeric score field weights must total 100%. Current total: ' + weightTotal + '.');
  const normalized = { title, description, sections };
  return { errors, value: errors.length ? null : normalized };
}

function listDynamicScoreFields(schema) {
  const fields = [];
  function visit(nodes, trail = []) {
    for (const node of nodes || []) {
      const nextTrail = node.type === 'group' ? [...trail, node.label] : trail;
      if (node.type === 'score') fields.push({ ...node, label: [...trail, node.label].join(' / '), sectionPath: trail });
      if (node.type === 'group') visit(node.children, nextTrail);
    }
  }
  for (const section of schema?.sections || []) visit(section.fields, [section.name]);
  return fields;
}

function validateDynamicEvaluationSubmission(schema, answers = {}) {
  const errors = [];
  const scores = answers.scores && typeof answers.scores === 'object' ? answers.scores : {};
  const textAnswers = answers.textAnswers && typeof answers.textAnswers === 'object' ? answers.textAnswers : {};
  const flags = answers.flags && typeof answers.flags === 'object' ? answers.flags : {};
  function visit(fields) {
    for (const field of fields || []) {
      const key = 'ai_' + field.id;
      const hasText = Object.prototype.hasOwnProperty.call(textAnswers, key);
      const hasScore = Object.prototype.hasOwnProperty.call(scores, key);
      const hasFlag = Object.prototype.hasOwnProperty.call(flags, key);
      if (field.type === 'group') { visit(field.children); continue; }
      if (field.type === 'score') {
        if (!hasScore && field.required) errors.push(field.label + ' is required.');
        if (hasScore && (!Number.isFinite(Number(scores[key])) || Number(scores[key]) < 0 || Number(scores[key]) > field.maxMarks)) errors.push(field.label + ' must be between 0 and ' + field.maxMarks + '.');
      } else if (field.type === 'boolean') {
        if (field.required && (!hasFlag || typeof flags[key] !== 'boolean')) errors.push(field.label + ' requires a Yes or No answer.');
      } else if (field.type === 'single_select') {
        if (field.required && (!hasText || !String(textAnswers[key]).trim())) errors.push(field.label + ' is required.');
        if (hasText && String(textAnswers[key]).trim() && !field.options.includes(String(textAnswers[key]))) errors.push(field.label + ' has an invalid option.');
      } else if (field.type === 'multi_select') {
        let selected = [];
        if (hasText) {
          try { selected = JSON.parse(textAnswers[key]); } catch { errors.push(field.label + ' has an invalid selection.'); }
        }
        if (!Array.isArray(selected) || selected.some((option) => !field.options.includes(option))) errors.push(field.label + ' has an invalid selection.');
        if (field.required && (!Array.isArray(selected) || selected.length === 0)) errors.push(field.label + ' requires at least one selection.');
      } else {
        if (field.required && (!hasText || typeof textAnswers[key] !== 'string' || !textAnswers[key].trim())) errors.push(field.label + ' is required.');
        if (hasText && (typeof textAnswers[key] !== 'string' || textAnswers[key].length > 4000)) errors.push(field.label + ' must be text under 4000 characters.');
      }
    }
  }
  for (const section of schema?.sections || []) visit(section.fields);
  return errors;
}

module.exports = { ALLOWED_FIELD_TYPES, validateDynamicEvaluationSchema, listDynamicScoreFields, validateDynamicEvaluationSubmission };
