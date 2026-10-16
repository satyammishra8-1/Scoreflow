import '../pages/EvaluationSession.css';

function ToggleButton({ label, active, disabled, onToggle }) {
  return (
    <button
      type="button"
      className={`attendance-option${active ? ' selected' : ''}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}

function CriteriaGrid({ criteria, scores, readOnly, onCriterionScoreChange }) {
  return (
    <div className="score-grid">
      {criteria.map((criterion) => {
        const current = Number(scores[criterion.id] ?? 0);
        return (
          <div className="score-row" key={criterion.id}>
            <div className="score-row-copy">
              <div className="score-row-header">
                <strong>{criterion.name}</strong>
                <span>Weight: {criterion.weight || 0}%</span>
              </div>
              <small>{criterion.description || 'No description provided.'}</small>
              <div className="score-meta-row">
                <span>Maximum: {criterion.maxMarks} marks</span>
                <span className="score-meta-chip">{current} scored</span>
              </div>
            </div>
            <div className="score-controls">
              <label>
                <span>Score</span>
                <input
                  type="number"
                  min="0"
                  max={criterion.maxMarks}
                  step="0.5"
                  value={current}
                  readOnly={readOnly}
                  onChange={(event) => onCriterionScoreChange(criterion.id, event.target.value)}
                />
              </label>
              <span className="score-max-text">/ {criterion.maxMarks}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NumberRow({ title, hint, value, max, step = '0.5', readOnly, onValueChange, suffix }) {
  return (
    <div className="score-row">
      <div className="score-row-copy">
        <div className="score-row-header">
          <strong>{title}</strong>
        </div>
        <small>{hint}</small>
      </div>
      <div className="score-controls">
        <label>
          <span>Score</span>
          <input
            type="number"
            min="0"
            max={max}
            step={step}
            value={value === undefined ? '' : String(value)}
            readOnly={readOnly}
            onChange={(event) => onValueChange(event.target.value)}
          />
        </label>
        <span className="score-max-text">{suffix ?? `/ ${max}`}</span>
      </div>
    </div>
  );
}

function TextRow({ title, hint, value, readOnly, onValueChange, placeholder }) {
  return (
    <div className="score-row">
      <div className="score-row-copy">
        <div className="score-row-header">
          <strong>{title}</strong>
        </div>
        <small>{hint}</small>
        <textarea
          className="model-textarea"
          rows={3}
          value={value || ''}
          readOnly={readOnly}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

function ReviewRow({ title, hint, resourceLabel, resourceUrl, active, readOnly, onToggle }) {
  return (
    <div className="score-row">
      <div className="score-row-copy">
        <div className="score-row-header">
          <strong>{title}</strong>
        </div>
        <small>
          {resourceUrl ? (
            <a className="team-resource-link" href={resourceUrl} target="_blank" rel="noreferrer">
              {resourceLabel}
            </a>
          ) : (
            hint
          )}
        </small>
      </div>
      <div className="attendance-controls" role="group" aria-label={title}>
        <ToggleButton
          label="Reviewed"
          active={Boolean(active)}
          disabled={readOnly}
          onToggle={onToggle}
        />
      </div>
    </div>
  );
}

function ModelEvaluationFields({
  model = 'criteria-based',
  config = null,
  criteria = [],
  scores = {},
  textAnswers = {},
  flags = {},
  team = null,
  readOnly = false,
  onScoreChange,
  onTextChange,
  onFlagChange,
  onCriterionScoreChange,
}) {
  if (model === 'open-holistic') {
    const cfg = config?.openHolistic || {};
    const min = Number(cfg.scoreMin ?? 0);
    const max = Number(cfg.scoreMax ?? 100);
    return (
      <div>
        <div className="score-grid">
          <NumberRow
            title="Overall Score"
            hint={`Give an overall score between ${min} and ${max}.`}
            value={scores.overall}
            max={max}
            readOnly={readOnly}
            onValueChange={(value) => onScoreChange('overall', value, max)}
          />
          {cfg.githubReview !== false && (
            <ReviewRow
              title="GitHub Review"
              hint="Open the team's repository, review the code, then mark as reviewed."
              resourceLabel="Open GitHub repository"
              resourceUrl={team?.github || ''}
              active={flags.githubReviewed}
              readOnly={readOnly}
              onToggle={() => onFlagChange('githubReviewed', !flags.githubReviewed)}
            />
          )}
          {cfg.projectReview !== false && (
            <ReviewRow
              title="Project Review"
              hint="Inspect the submitted project materials, then mark as reviewed."
              resourceLabel="Open project material"
              resourceUrl={team?.demo || ''}
              active={flags.projectReviewed}
              readOnly={readOnly}
            />
          )}
        </div>
      </div>
    );
  }

  if (model === 'remote-async') {
    const materials = config?.remoteAsync?.materials || [];
    return (
      <div>
        <div className="score-grid">
          {materials.length === 0 && (
            <p className="judges-empty-message">No review materials are configured for this event.</p>
          )}
          {materials.map((material, index) => (
            <ReviewRow
              key={`material-${index}`}
              title={material.label || `Material ${index + 1}`}
              hint="No link was provided for this material."
              resourceLabel="Open material"
              resourceUrl={material.url || ''}
              active={flags[`material-${index}`]}
              readOnly={readOnly}
              onToggle={() => onFlagChange(`material-${index}`, !flags[`material-${index}`])}
            />
          ))}
          <NumberRow
            title="Review Score"
            hint="Score the submission after reviewing all required materials."
            value={scores.overall}
            max={100}
            readOnly={readOnly}
            onValueChange={(value) => onScoreChange('overall', value, 100)}
          />
        </div>
      </div>
    );
  }

  if (model === 'live-demo') {
    const cfg = config?.liveDemo || {};
    return (
      <div>
        <div className="score-grid">
          {cfg.demoEvaluation !== false && (
            <NumberRow
              title="Demo Score"
              hint="Score the live demonstration of the project."
              value={scores.demo}
              max={100}
              readOnly={readOnly}
              onValueChange={(value) => onScoreChange('demo', value, 100)}
            />
          )}
          {cfg.presentationEvaluation !== false && (
            <NumberRow
              title="Presentation Score"
              hint="Score the clarity, structure and delivery of the presentation."
              value={scores.presentation}
              max={100}
              readOnly={readOnly}
              onValueChange={(value) => onScoreChange('presentation', value, 100)}
            />
          )}
          {cfg.judgeQuestions !== false && (
            <TextRow
              title="Judge Questions"
              hint="Record the questions asked and the team's answers."
              value={textAnswers.questions || ''}
              readOnly={readOnly}
              onValueChange={(value) => onTextChange('questions', value)}
              placeholder="Questions asked and the team's responses..."
            />
          )}
        </div>
        {criteria.length > 0 && (
          <CriteriaGrid
            criteria={criteria}
            scores={scores}
            readOnly={readOnly}
            onCriterionScoreChange={onCriterionScoreChange}
          />
        )}
      </div>
    );
  }

  if (model === 'ranking-voting') {
    const cfg = config?.rankingVoting || {};
    const calculationLabels = {
      total: 'Total points',
      average: 'Average score',
      points: 'Weighted points',
      composite: 'Composite score',
    };
    return (
      <div>
        <div className="score-grid">
          <NumberRow
            title="Team Rank"
            hint={`Enter this team's final rank (1 = best). Calculation: ${calculationLabels[cfg.rankCalculation] || 'Total points'}.`}
            value={scores.rank}
            max={999}
            step="1"
            readOnly={readOnly}
            suffix="#"
            onValueChange={(value) => onScoreChange('rank', value, 999)}
          />
        </div>
        <p className="judges-empty-message">Only one rank entry is required for this team.</p>
      </div>
    );
  }

  if (model === 'custom') {
    const fields = config?.custom?.fields || [];
    if (fields.length === 0) {
      return <p className="judges-empty-message">No custom evaluation fields are configured for this event.</p>;
    }
    const typeLabels = {
      criteria: 'Criteria',
      marks: 'Marks',
      weight: 'Weight (%)',
      question: 'Question',
      material: 'Material',
      feedback: 'Feedback',
    };
    return (
      <div>
        <div className="score-grid">
          {fields.map((field, index) => {
            const id = `field-${index}`;
            const label = field.label || `Field ${index + 1}`;
            const requiredText = field.required !== false ? 'Required' : 'Optional';

            if (field.type === 'material') {
              return (
                <ReviewRow
                  key={id}
                  title={label}
                  hint="Review the team's submitted materials, then mark as reviewed."
                  resourceLabel="Open GitHub"
                  resourceUrl={team?.github || ''}
                  active={flags[id]}
                  readOnly={readOnly}
                  onToggle={() => onFlagChange(id, !flags[id])}
                />
              );
            }

            if (field.type === 'question' || field.type === 'feedback') {
              return (
                <TextRow
                  key={id}
                  title={label}
                  hint={`${typeLabels[field.type] || 'Text'} · ${requiredText}`}
                  value={textAnswers[id] || ''}
                  readOnly={readOnly}
                  onValueChange={(value) => onTextChange(id, value)}
                  placeholder={field.type === 'question' ? 'Write your answer...' : 'Write your feedback...'}
                />
              );
            }

            return (
              <NumberRow
                key={id}
                title={label}
                hint={`${typeLabels[field.type] || 'Score'} · ${requiredText}`}
                value={scores[id]}
                max={100}
                readOnly={readOnly}
                onValueChange={(value) => onScoreChange(id, value, 100)}
              />
            );
          })}
        </div>
      </div>
    );
  }

  if (criteria.length === 0) {
    return <p className="judges-empty-message">No evaluation criteria are configured for this event.</p>;
  }

  return (
    <CriteriaGrid
      criteria={criteria}
      scores={scores}
      readOnly={readOnly}
      onCriterionScoreChange={onCriterionScoreChange}
    />
  );
}

export default ModelEvaluationFields;

