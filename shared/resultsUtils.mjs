const idOf = (value) => String(value?.teamId || value?.judgeId || value?._id || value?.id || '');

function criteriaFor(config) {
  const source = config?.model === 'criteria-based'
    ? config.criteriaBased?.criteria
    : config?.model === 'live-demo'
      ? config.liveDemo?.criteria
      : [];
  return (Array.isArray(source) ? source : []).map((criterion, index) => ({
    id: typeof criterion.id === 'string' && criterion.id ? criterion.id : `criterion-${index + 1}`,
    name: criterion.name || `Criterion ${index + 1}`,
    maxMarks: Number(criterion.maxMarks),
    weight: Number(criterion.weight),
  }));
}

function weightedResult(scores, criteria) {
  if (!criteria.length || criteria.some((criterion) => !Number.isFinite(criterion.maxMarks) || criterion.maxMarks <= 0)) return null;
  const totalWeight = criteria.reduce((sum, criterion) => sum + (Number.isFinite(criterion.weight) ? criterion.weight : 0), 0);
  if (totalWeight <= 0) return null;
  const score = criteria.reduce((sum, criterion) => {
    if (!Object.hasOwn(scores || {}, criterion.id)) return sum;
    const value = Number(scores[criterion.id]);
    return sum + (Number.isFinite(value) ? Math.min(Math.max(value, 0), criterion.maxMarks) / criterion.maxMarks * criterion.weight : 0);
  }, 0);
  return Number(score.toFixed(2));
}

function scoreDetails(evaluation, config, criteria) {
  const scores = evaluation.scores || {};
  const model = config?.model;
  if (model === 'criteria-based') {
    const hasAllScores = criteria.length > 0 && criteria.every((criterion) => Object.hasOwn(scores, criterion.id));
    return {
      criteria: criteria.map((criterion) => ({
        ...criterion,
        score: Object.hasOwn(scores, criterion.id) ? Number(scores[criterion.id]) : null,
      })),
      weighted: hasAllScores ? weightedResult(scores, criteria) : null,
      raw: hasAllScores ? criteria.reduce((sum, criterion) => sum + (Number(scores[criterion.id]) || 0), 0) : null,
    };
  }
  if (model === 'ranking-voting') {
    return { rank: Object.hasOwn(scores, 'rank') ? Number(scores.rank) : null };
  }
  if (model === 'open-holistic' || model === 'remote-async') {
    return { overall: Object.hasOwn(scores, 'overall') ? Number(scores.overall) : null };
  }
  if (model === 'live-demo') {
    return {
      named: [
        ...(config.liveDemo?.demoEvaluation !== false ? [{ label: 'Demo', key: 'demo' }] : []),
        ...(config.liveDemo?.presentationEvaluation !== false ? [{ label: 'Presentation', key: 'presentation' }] : []),
      ].flatMap(({ label, key }) => Object.hasOwn(scores, key) ? [{ label, value: Number(scores[key]) }] : []),
      criteria: criteria.map((criterion) => ({ ...criterion, score: Object.hasOwn(scores, criterion.id) ? Number(scores[criterion.id]) : null })),
    };
  }
  if (model === 'custom') {
    return {
      named: (config.custom?.fields || []).flatMap((field, index) => {
        const key = `field-${index}`;
        const value = ['question', 'feedback'].includes(field.type) ? evaluation.textAnswers?.[key] : scores[key];
        return value == null || value === '' ? [] : [{ label: field.label || `Field ${index + 1}`, value }];
      }),
    };
  }
  return { named: [] };
}

export function buildEventResults({ eventId, teams = [], judges = [], evaluations = [], config = null }) {
  const eventKey = String(eventId);
  const scopedTeams = teams.filter((team) => String(team.eventId) === eventKey && idOf(team));
  const teamIds = new Set(scopedTeams.map(idOf));
  const scopedJudges = judges.filter((judge) => String(judge.eventId) === eventKey && idOf(judge));
  const judgeById = new Map(scopedJudges.map((judge) => [idOf(judge), judge]));
  const teamById = new Map(scopedTeams.map((team) => [idOf(team), team]));
  const validEvaluations = evaluations.filter((evaluation) => {
    const judgeId = String(evaluation.judgeId);
    const teamId = String(evaluation.teamId);
    const judge = judgeById.get(judgeId);
    return String(evaluation.eventId) === eventKey
      && teamIds.has(teamId)
      && judge
      && Array.isArray(judge.assignedTeamIds)
      && judge.assignedTeamIds.map(String).includes(teamId);
  });
  const criteria = criteriaFor(config);
  const completed = validEvaluations.filter((evaluation) => evaluation.status === 'COMPLETED');
  const teamResults = scopedTeams.map((team) => {
    const teamId = idOf(team);
    const assignedJudges = scopedJudges.filter((judge) => (judge.assignedTeamIds || []).map(String).includes(teamId));
    const submitted = completed.filter((evaluation) => String(evaluation.teamId) === teamId);
    const judgeRows = assignedJudges.map((judge) => {
      const evaluation = submitted.find((item) => String(item.judgeId) === idOf(judge));
      return { judge, evaluation, scores: evaluation ? scoreDetails(evaluation, config, criteria) : null };
    });
    const weightedScores = judgeRows.map((row) => row.scores?.weighted).filter(Number.isFinite);
    return {
      team,
      status: assignedJudges.length > 0 && submitted.length === assignedJudges.length ? 'Completed' : 'Pending',
      submittedCount: submitted.length,
      assignedCount: assignedJudges.length,
      judgeRows,
      averageWeighted: weightedScores.length ? Number((weightedScores.reduce((sum, value) => sum + value, 0) / weightedScores.length).toFixed(2)) : null,
    };
  });
  const judgeResults = scopedJudges.map((judge) => {
    const assigned = (judge.assignedTeamIds || []).map(String).filter((teamId) => teamById.has(teamId));
    const judgeCompleted = completed.filter((evaluation) => String(evaluation.judgeId) === idOf(judge));
    const evaluatedTeamIds = new Set(judgeCompleted.map((evaluation) => String(evaluation.teamId)));
    return { judge, assignedCount: assigned.length, completedCount: evaluatedTeamIds.size, pendingCount: Math.max(assigned.length - evaluatedTeamIds.size, 0) };
  });
  return { criteria, teams: teamResults, judges: judgeResults, submittedCount: completed.length };
}
