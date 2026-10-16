const numericScoreDone = (value, max) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= Number(max);
};

export function isFeedbackRequired(model, config) {
  switch (model) {
    case 'criteria-based':
      return true;
    case 'open-holistic':
      return config?.openHolistic?.overallFeedback !== false;
    case 'remote-async':
      return true;
    case 'live-demo':
      return config?.liveDemo?.overallScoreFeedback !== false;
    case 'ranking-voting':
      return config?.rankingVoting?.comments !== false;
    default:
      return false;
  }
}

export function getScoresCardTitle(model) {
  switch (model) {
    case 'open-holistic':
      return 'Overall Evaluation';
    case 'remote-async':
      return 'Material Review';
    case 'live-demo':
      return 'Live Demo Evaluation';
    case 'ranking-voting':
      return 'Ranking';
    case 'custom':
      return 'Custom Evaluation';
    default:
      return 'Score Criteria';
  }
}

export function buildModelRequirements({
  model,
  config,
  criteria = [],
  scores = {},
  textAnswers = {},
  flags = {},
  feedback = '',
}) {
  const requirements = [];
  const feedbackDone = Boolean(typeof feedback === 'string' && feedback.trim());

  switch (model) {
    case 'open-holistic': {
      const min = Number(config?.openHolistic?.scoreMin ?? 0);
      const max = Number(config?.openHolistic?.scoreMax ?? 100);
      const overall = Number(scores.overall);
      requirements.push({
        id: 'overall',
        label: 'Overall Score',
        done: Number.isFinite(overall) && overall >= min && overall <= max,
      });
      if (config?.openHolistic?.githubReview !== false) {
        requirements.push({ id: 'githubReviewed', label: 'GitHub Review', done: Boolean(flags.githubReviewed) });
      }
      if (config?.openHolistic?.projectReview !== false) {
        requirements.push({ id: 'projectReviewed', label: 'Project Review', done: Boolean(flags.projectReviewed) });
      }
      if (isFeedbackRequired(model, config)) {
        requirements.push({ id: 'feedback', label: 'Overall Feedback', done: feedbackDone });
      }
      break;
    }
    case 'remote-async': {
      const materials = config?.remoteAsync?.materials || [];
      materials.forEach((material, index) => {
        requirements.push({
          id: `material-${index}`,
          label: material.label || `Material ${index + 1}`,
          done: Boolean(flags[`material-${index}`]),
        });
      });
      requirements.push({ id: 'overall', label: 'Review Score', done: numericScoreDone(scores.overall, 100) });
      requirements.push({ id: 'feedback', label: 'Review Feedback', done: feedbackDone });
      break;
    }
    case 'live-demo': {
      const live = config?.liveDemo || {};
      if (live.demoEvaluation !== false) {
        requirements.push({ id: 'demo', label: 'Demo Score', done: numericScoreDone(scores.demo, 100) });
      }
      if (live.presentationEvaluation !== false) {
        requirements.push({ id: 'presentation', label: 'Presentation Score', done: numericScoreDone(scores.presentation, 100) });
      }
      if (live.judgeQuestions !== false) {
        requirements.push({ id: 'questions', label: 'Judge Questions', done: Boolean(String(textAnswers.questions || '').trim()) });
      }
      criteria.forEach((criterion) => {
        requirements.push({ id: criterion.id, label: criterion.name, done: numericScoreDone(scores[criterion.id], criterion.maxMarks) });
      });
      if (isFeedbackRequired(model, config)) {
        requirements.push({ id: 'feedback', label: 'Overall Feedback', done: feedbackDone });
      }
      break;
    }
    case 'ranking-voting': {
      const rank = Number(scores.rank);
      requirements.push({ id: 'rank', label: 'Team Rank', done: Number.isInteger(rank) && rank >= 1 });
      if (isFeedbackRequired(model, config)) {
        requirements.push({ id: 'feedback', label: 'Comment', done: feedbackDone });
      }
      break;
    }
    case 'custom': {
      (config?.custom?.fields || []).forEach((field, index) => {
        const id = `field-${index}`;
        const label = field.label || `Field ${index + 1}`;
        const required = field.required !== false;
        if (field.type === 'material') {
          requirements.push({ id, label, done: Boolean(flags[id]) });
        } else if (field.type === 'question' || field.type === 'feedback') {
          requirements.push({ id, label, done: required ? Boolean(String(textAnswers[id] || '').trim()) : true });
        } else {
          requirements.push({ id, label, done: required ? numericScoreDone(scores[id], 100) : true });
        }
      });
      break;
    }
    case 'criteria-based':
    default: {
      criteria.forEach((criterion) => {
        requirements.push({ id: criterion.id, label: criterion.name, done: numericScoreDone(scores[criterion.id], criterion.maxMarks) });
      });
      requirements.push({ id: 'feedback', label: 'Overall Feedback', done: feedbackDone });
      break;
    }
  }

  return requirements;
}
