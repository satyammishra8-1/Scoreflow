const MODEL_FIELDS = {
  'criteria-based': ['criteriaBased'],
  'open-holistic': ['openHolistic'],
  'remote-async': ['remoteAsync'],
  'live-demo': ['liveDemo'],
  'ranking-voting': ['rankingVoting'],
  'custom': ['custom'],
};

const EMPTY_MODELS = Object.keys(MODEL_FIELDS);

function normalizeCriteriaArray(value = []) {
  const array = Array.isArray(value) ? value : [];
  return array
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      name: typeof item.name === 'string' ? item.name.trim() : '',
      description: typeof item.description === 'string' ? item.description.trim() : '',
      maxMarks: Number(item.maxMarks) || 0,
      weight: Number(item.weight) || 0,
    }));
}

function normalizeMaterialsArray(value = []) {
  const array = Array.isArray(value) ? value : [];
  return array
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      label: typeof item.label === 'string' ? item.label.trim() : '',
      url: typeof item.url === 'string' ? item.url.trim() : '',
    }));
}

function normalizeCustomFieldsArray(value = []) {
  const array = Array.isArray(value) ? value : [];
  return array
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      type: typeof item.type === 'string' ? item.type : 'criteria',
      label: typeof item.label === 'string' ? item.label.trim() : '',
      required: Boolean(item.required),
    }));
}

function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'boolean') return !value;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return !value;
}

function buildEmptyModelPayload(model) {
  const payload = {};
  MODEL_FIELDS[model].forEach((field) => {
    payload[field] = {};
  });
  return payload;
}

function validateModelConfig(model, payload = {}) {
  const errors = {};
  const result = {
    errors,
    criteriaBased: [],
    remoteAsync: [],
    liveDemo: [],
    custom: [],
  };

  if (!EMPTY_MODELS.includes(model)) {
    return result;
  }

  switch (model) {
    case 'criteria-based': {
      const criteria = normalizeCriteriaArray(payload.criteriaBased?.criteria);
      const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
      if (criteria.length === 0) {
        errors.criteriaBased = 'Add at least one criterion.';
      } else if (Math.abs(totalWeight - 100) > 0.01) {
        errors.criteriaBased = `Total weight must equal 100%. Current total: ${totalWeight}.`;
      }
      result.criteriaBased = criteria;
      break;
    }
    case 'open-holistic': {
      const min = Number(payload.openHolistic?.scoreMin);
      const max = Number(payload.openHolistic?.scoreMax);
      if (!Number.isFinite(min) || min < 0) {
        errors.openHolistic = 'Please provide a valid minimum score.';
      }
      if (!Number.isFinite(max) || max < 1) {
        errors.openHolistic = 'Please provide a valid maximum score.';
      } else if (Number.isFinite(min) && min >= max) {
        errors.openHolistic = 'Maximum score must be higher than the minimum score.';
      }
      if (typeof payload.openHolistic?.githubReview !== 'boolean') {
        errors.openHolistic = 'GitHub review toggle is required.';
      } else if (typeof payload.openHolistic?.projectReview !== 'boolean') {
        errors.openHolistic = 'Project review toggle is required.';
      } else if (typeof payload.openHolistic?.overallFeedback !== 'boolean') {
        errors.openHolistic = 'Overall feedback toggle is required.';
      }
      break;
    }
    case 'remote-async': {
      const materials = normalizeMaterialsArray(payload.remoteAsync?.materials);
      if (materials.length === 0) {
        errors.remoteAsync = 'Add at least one required material (GitHub, demo video, documentation, project description, or other links).';
      }
      result.remoteAsync = materials;
      break;
    }
    case 'live-demo': {
      const criteria = normalizeCriteriaArray(payload.liveDemo?.criteria);
      const hasCriteria = criteria.length > 0;
      const anyToggle = Boolean(
        payload.liveDemo?.demoEvaluation ||
          payload.liveDemo?.presentationEvaluation ||
          payload.liveDemo?.judgeQuestions ||
          payload.liveDemo?.overallScoreFeedback
      );
      const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
      if (!anyToggle && !hasCriteria) {
        errors.liveDemo = 'Add at least one component: demo, presentation, judge questions, overall score/feedback, or criteria.';
      } else if (hasCriteria && Math.abs(totalWeight - 100) > 0.01) {
        errors.liveDemo = `Criteria total weight must equal 100%. Current total: ${totalWeight}.`;
      }
      result.liveDemo = criteria;
      break;
    }
    case 'ranking-voting': {
      if (typeof payload.rankingVoting?.ranking !== 'boolean') {
        errors.rankingVoting = 'Ranking toggle is required.';
      }
      if (typeof payload.rankingVoting?.comments !== 'boolean') {
        errors.rankingVoting = 'Comments toggle is required.';
      }
      if (!['total', 'average', 'points', 'composite'].includes(payload.rankingVoting?.rankCalculation)) {
        errors.rankingVoting = 'Please select a valid rank calculation method.';
      }
      break;
    }
    case 'custom': {
      const fields = normalizeCustomFieldsArray(payload.custom?.fields);
      if (fields.length === 0) {
        errors.custom = 'Add at least one custom field.';
      }
      result.custom = fields;
      break;
    }
    default:
      break;
  }

  return result;
}

module.exports = {
  EMPTY_MODELS,
  MODEL_FIELDS,
  buildEmptyModelPayload,
  validateModelConfig,
  normalizeCriteriaArray,
  normalizeMaterialsArray,
  normalizeCustomFieldsArray,
};
