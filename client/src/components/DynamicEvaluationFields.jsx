import '../pages/EvaluationSession.css';
import './DynamicEvaluationFields.css';

const answerKey = (id) => `ai_${id}`;

function DynamicField({ field, scores, textAnswers, flags, readOnly, onScoreChange, onTextChange, onFlagChange }) {
  const key = answerKey(field.id);
  const required = field.required ? <span className="dynamic-field-required">Required</span> : <span className="dynamic-field-optional">Optional</span>;
  if (field.type === 'group') return (
    <fieldset className="dynamic-evaluation-group">
      <legend>{field.label} {required}</legend>
      {field.description && <p>{field.description}</p>}
      {(field.children || []).map((child) => <DynamicField key={child.id} {...{ field: child, scores, textAnswers, flags, readOnly, onScoreChange, onTextChange, onFlagChange }} />)}
    </fieldset>
  );
  const help = <small className="dynamic-field-help">{field.description || field.rationale || ''} {required}</small>;
  if (field.type === 'score') return (
    <div className="score-row dynamic-evaluation-field">
      <div className="score-row-copy"><div className="score-row-header"><strong>{field.label}</strong><span>{field.weight}% of AI rubric</span></div>{help}</div>
      <div className="score-controls"><label><span>Score</span><input type="number" min="0" max={field.maxMarks} step="any" aria-label={`${field.label} score`} value={scores[key] ?? ''} disabled={readOnly} onChange={(event) => onScoreChange(key, event.target.value, field.maxMarks)} /></label><span className="score-max-text">/ {field.maxMarks}</span></div>
    </div>
  );
  if (field.type === 'boolean') return (
    <div className="score-row dynamic-evaluation-field"><div className="score-row-copy"><div className="score-row-header"><strong>{field.label}</strong></div>{help}</div><div className="attendance-controls" role="group" aria-label={field.label}>{[true, false].map((value) => <button key={String(value)} type="button" className={`attendance-option${flags[key] === value ? ' selected' : ''}`} aria-pressed={flags[key] === value} disabled={readOnly} onClick={() => onFlagChange(key, value)}>{value ? 'Yes' : 'No'}</button>)}</div></div>
  );
  if (field.type === 'single_select') return (
    <div className="dynamic-evaluation-field"><label className="dynamic-field-label"><strong>{field.label}</strong>{help}<select value={textAnswers[key] || ''} disabled={readOnly} onChange={(event) => onTextChange(key, event.target.value)}><option value="">Choose an option</option>{(field.options || []).map((option) => <option key={option}>{option}</option>)}</select></label></div>
  );
  if (field.type === 'multi_select') {
    let selected = [];
    try { selected = JSON.parse(textAnswers[key] || '[]'); } catch { selected = []; }
    return <fieldset className="dynamic-evaluation-field dynamic-select-options"><legend><strong>{field.label}</strong>{help}</legend>{(field.options || []).map((option) => <label key={option}><input type="checkbox" checked={selected.includes(option)} disabled={readOnly} onChange={(event) => { const next = event.target.checked ? [...selected, option] : selected.filter((value) => value !== option); onTextChange(key, JSON.stringify(next)); }} />{option}</label>)}</fieldset>;
  }
  return (
    <label className="dynamic-field-label dynamic-evaluation-field"><strong>{field.label}</strong>{help}<textarea className="model-textarea" rows={field.type === 'text' ? 3 : 2} maxLength={4000} value={textAnswers[key] || ''} disabled={readOnly} onChange={(event) => onTextChange(key, event.target.value)} placeholder={field.type === 'question' ? 'Write your answer…' : field.type === 'feedback' ? 'Write your feedback…' : 'Enter a response…'} /></label>
  );
}

export default function DynamicEvaluationFields({ schema, scores, textAnswers, flags, readOnly, onScoreChange, onTextChange, onFlagChange }) {
  if (!schema?.sections?.length) return null;
  return <section className="dynamic-evaluation-schema" aria-label={schema.title}>
    <header><span>ADDITIONAL RUBRIC</span><h3>{schema.title}</h3>{schema.description && <p>{schema.description}</p>}<small>Its numeric fields are weighted within this rubric. The event’s existing score calculation remains unchanged.</small></header>
    {schema.sections.map((section) => <section className="dynamic-evaluation-section" key={section.id}>
      <h4>{section.name}</h4>{section.description && <p>{section.description}</p>}
      {(section.fields || []).map((field) => <DynamicField key={field.id} {...{ field, scores, textAnswers, flags, readOnly, onScoreChange, onTextChange, onFlagChange }} />)}
    </section>)}
  </section>;
}
