const mongoose = require('mongoose');
const Event = require('../models/Event');
const Judge = require('../models/Judge');
const Team = require('../models/Team');
const EvaluationConfiguration = require('../models/EvaluationConfiguration');

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

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
      maxMarks: Number(item.maxMarks),
      weight: Number(item.weight),
    }));
}

function validateCriteria(criteria, required = true) {
  if (required && criteria.length === 0) return 'Add at least one criterion.';
  const names = new Set();
  for (const criterion of criteria) {
    const name = criterion.name.trim();
    const key = name.toLocaleLowerCase();
    if (!name) return 'Every criterion needs a name.';
    if (names.has(key)) return 'Criterion names must be unique.';
    names.add(key);
    if (!Number.isFinite(criterion.maxMarks) || criterion.maxMarks <= 0) return `Maximum marks must be greater than zero for "${name}".`;
    if (!Number.isFinite(criterion.weight) || criterion.weight < 0) return `Weight must be zero or greater for "${name}".`;
  }
  if (criteria.length > 0) {
    const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) return `Total weight must equal 100%. Current total: ${totalWeight}.`;
  }
  return '';
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
      const criteriaError = validateCriteria(criteria);
      if (criteriaError) errors.criteriaBased = criteriaError;
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
      if (!anyToggle && !hasCriteria) {
        errors.liveDemo = 'Add at least one component: demo, presentation, judge questions, overall score/feedback, or criteria.';
      } else if (hasCriteria) {
        const criteriaError = validateCriteria(criteria, false);
        if (criteriaError) errors.liveDemo = criteriaError;
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
      if (payload.rankingVoting?.ranking === false && payload.rankingVoting?.comments === false) {
        errors.rankingVoting = 'Enable ranking, comments, or both.';
      }
      break;
    }
    case 'custom': {
      const fields = normalizeCustomFieldsArray(payload.custom?.fields);
      if (fields.length === 0) {
        errors.custom = 'Add at least one custom field.';
      } else if (fields.some((field) => !field.label)) {
        errors.custom = 'Every custom field needs a label.';
      } else if (fields.some((field) => !['criteria', 'marks', 'weight', 'question', 'material', 'feedback'].includes(field.type))) {
        errors.custom = 'Choose a valid custom field type.';
      }
      result.custom = fields;
      break;
    }
    default:
      break;
  }

  return result;
}

async function validateEvaluationSubmission(payload = {}) {
  const errors = {};
  const eventId = typeof payload.eventId === 'string' ? payload.eventId.trim() : '';
  const judgeId = typeof payload.judgeId === 'string' ? payload.judgeId.trim() : '';
  const teamId = typeof payload.teamId === 'string' ? payload.teamId.trim() : '';
  const normalized = { eventId, judgeId, teamId };

  if (!eventId || !isValidObjectId(eventId)) errors.eventId = 'A valid eventId is required.';
  if (!judgeId || !isValidObjectId(judgeId)) errors.judgeId = 'A valid judgeId is required.';
  if (!teamId || !isValidObjectId(teamId)) errors.teamId = 'A valid teamId is required.';

  if (Object.keys(errors).length > 0) return { errors, normalized };

  const [event, judge, team, evaluationConfiguration] = await Promise.all([
    Event.findById(eventId).lean(),
    Judge.findById(judgeId).lean(),
    Team.findById(teamId).lean(),
    EvaluationConfiguration.findOne({ eventId }).select('eventId').lean(),
  ]);

  if (!event) errors.eventId = 'Event not found.';
  if (!judge) errors.judgeId = 'Judge not found.';
  if (!team) errors.teamId = 'Team not found.';
  if (event && !evaluationConfiguration) {
    errors.evaluationConfig = 'Evaluation configuration not found for this event.';
  }

  if (event && judge && String(judge.eventId) !== String(event._id)) {
    errors.judgeId = 'Judge does not belong to this event.';
  }
  if (event && team && String(team.eventId) !== String(event._id)) {
    errors.teamId = 'Team does not belong to this event.';
  }

  if (judge && team) {
    const isAssignedByJudge = Array.isArray(judge.assignedTeamIds)
      ? judge.assignedTeamIds.some((id) => String(id) === String(team._id))
      : false;
    if (!isAssignedByJudge) {
      errors.teamId = 'This team is not assigned to the judge.';
    }
  }

  return { errors, normalized };
}

module.exports = {
  EMPTY_MODELS,
  MODEL_FIELDS,
  buildEmptyModelPayload,
  validateModelConfig,
  normalizeCriteriaArray,
  validateCriteria,
  normalizeMaterialsArray,
  normalizeCustomFieldsArray,
  validateEvaluationSubmission,
};
