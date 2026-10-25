import { useMemo, useState } from 'react';
import axios from 'axios';
import './EvaluationAiBuilder.css';
import { buildEvaluationSchemaPreview } from '../data/evaluationSchemaPreview';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });
const FIELD_TYPES = ['score', 'boolean', 'text', 'question', 'feedback', 'single_select', 'multi_select', 'group'];
const idFor = () => `field_${globalThis.crypto?.randomUUID?.().replaceAll('-', '') || Date.now()}`;

function updateFieldTree(fields, id, update) {
  return fields.map((field) => field.id === id
    ? update(field)
    : field.type === 'group' ? { ...field, children: updateFieldTree(field.children || [], id, update) } : field);
}

function removeFieldTree(fields, id) {
  return fields.filter((field) => field.id !== id).map((field) => field.type === 'group'
    ? { ...field, children: removeFieldTree(field.children || [], id) } : field);
}

function FieldEditor({ field, onChange, onRemove, onMove, readOnly }) {
  return (
    <article className="ai-schema-field">
      <div className="ai-schema-field-heading">
        <strong>{field.label || 'New field'}</strong>
        <div>
          <button type="button" onClick={() => onMove(-1)} aria-label="Move field up" disabled={readOnly}>Up</button>
          <button type="button" onClick={() => onMove(1)} aria-label="Move field down" disabled={readOnly}>Down</button>
          <button type="button" onClick={onRemove} aria-label="Remove field" disabled={readOnly}>Remove</button>
        </div>
      </div>
      <div className="ai-schema-edit-grid">
        <label>Label<input value={field.label} onChange={(event) => onChange({ ...field, label: event.target.value })} maxLength={150} /></label>
        <label>Field type<select value={field.type} onChange={(event) => {
          const type = event.target.value;
          onChange({ ...field, type, options: ['single_select', 'multi_select'].includes(type) ? (field.options || ['Option 1', 'Option 2']) : undefined, children: type === 'group' ? (field.children?.length ? field.children : [{ id: idFor(), type: 'text', label: 'Details', description: '', rationale: '', required: false }]) : undefined, maxMarks: type === 'score' ? (field.maxMarks || 10) : undefined, weight: type === 'score' ? (field.weight ?? 0) : undefined });
        }}>{FIELD_TYPES.map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}</select></label>
        <label className="ai-schema-edit-wide">Description<textarea value={field.description || ''} onChange={(event) => onChange({ ...field, description: event.target.value })} maxLength={1000} rows={2} /></label>
        <label className="ai-schema-required"><input type="checkbox" checked={field.required} onChange={(event) => onChange({ ...field, required: event.target.checked })} /> Required</label>
        {field.type === 'score' && <>
          <label>Maximum marks<input type="number" min="0.01" max="10000" step="any" value={field.maxMarks ?? ''} onChange={(event) => onChange({ ...field, maxMarks: Number(event.target.value) })} /></label>
          <label>Rubric weight (%)<input type="number" min="0" max="100" step="any" value={field.weight ?? ''} onChange={(event) => onChange({ ...field, weight: Number(event.target.value) })} /></label>
        </>}
        {['single_select', 'multi_select'].includes(field.type) && <label className="ai-schema-edit-wide">Options (one per line)<textarea rows={3} value={(field.options || []).join('\n')} onChange={(event) => onChange({ ...field, options: event.target.value.split('\n').map((option) => option.trim()).filter(Boolean) })} /></label>}
      </div>
      {field.rationale && <p className="ai-schema-rationale"><strong>Why:</strong> {field.rationale}</p>}
      {field.type === 'group' && <div className="ai-schema-children">{(field.children || []).map((child, index) => <FieldEditor key={child.id} field={child} readOnly={readOnly} onChange={(value) => onChange({ ...field, children: updateFieldTree(field.children || [], child.id, () => value) })} onRemove={() => onChange({ ...field, children: removeFieldTree(field.children || [], child.id) })} onMove={(direction) => {
        const children = [...(field.children || [])]; const target = index + direction;
        if (target >= 0 && target < children.length) [children[index], children[target]] = [children[target], children[index]];
        onChange({ ...field, children });
      }} />)}<button type="button" className="ai-builder-add-field" onClick={() => onChange({ ...field, children: [...(field.children || []), { id: idFor(), type: 'text', label: 'New detail', description: '', rationale: '', required: false }] })}>+ Add sub-field</button></div>}
    </article>
  );
}

function moveItem(list, index, direction) {
  const next = [...list]; const target = index + direction;
  if (target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function PreviewField({ field, depth = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const childPanelId = `preview-${field.id}`;
  return (
    <div className={`ai-schema-preview-field${depth ? ' nested' : ''}`}>
      <div className="ai-schema-preview-row">
        <div className="ai-schema-preview-copy"><strong>{field.label}</strong><span>{field.kind}</span></div>
        <div className="ai-schema-preview-meta">
          {field.scoreSummary && <span className="ai-schema-preview-score">{field.scoreSummary}</span>}
          <small>{field.required ? 'Required' : 'Optional'}</small>
          {field.childCount > 0 && <button type="button" aria-expanded={expanded} aria-controls={childPanelId} onClick={() => setExpanded((open) => !open)}>{expanded ? 'Hide' : `View ${field.childCount} subcriteria`}</button>}
        </div>
      </div>
      {field.childCount > 0 && expanded && <div className="ai-schema-preview-children" id={childPanelId}>{field.children.map((child) => <PreviewField key={child.id} field={child} depth={depth + 1} />)}</div>}
    </div>
  );
}

export default function EvaluationAiBuilder({ eventId, event, model, existingCriteria = [], value, onApply }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [schema, setSchema] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');
  const scoreFields = useMemo(() => {
    const result = [];
    const visit = (fields) => (fields || []).forEach((field) => { if (field.type === 'score') result.push(field); if (field.type === 'group') visit(field.children); });
    (schema?.sections || []).forEach((section) => visit(section.fields));
    return result;
  }, [schema]);
  const scoreWeightTotal = scoreFields.reduce((total, field) => total + Number(field.weight || 0), 0);
  const preview = useMemo(() => buildEvaluationSchemaPreview(schema), [schema]);

  async function generate() {
    if (prompt.trim().length < 10) { setError('Describe the evaluation in at least 10 characters.'); return; }
    setIsGenerating(true); setError('');
    try {
      const response = await API.post(`/events/${encodeURIComponent(eventId)}/evaluation/ai-generate`, { prompt: prompt.trim() });
      if (!response.data?.success || !response.data.data?.schema) throw new Error(response.data?.error || 'Unable to generate an evaluation schema.');
      setSchema(response.data.data.schema);
      setIsEditing(false);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || requestError.message || 'Unable to generate an evaluation schema.');
    } finally { setIsGenerating(false); }
  }

  function updateSection(index, changes) { setSchema((current) => ({ ...current, sections: current.sections.map((section, sectionIndex) => sectionIndex === index ? { ...section, ...changes } : section) })); }
  async function apply() {
    if (!schema || (scoreFields.length && Math.abs(scoreWeightTotal - 100) > 0.01)) return;
    setIsApplying(true); setError('');
    try {
      const response = await API.post(`/events/${encodeURIComponent(eventId)}/evaluation/ai-validate`, { schema });
      if (!response.data?.success || !response.data.data?.schema) throw new Error(response.data?.error || 'Correct the evaluation structure before adding it.');
      onApply(response.data.data.schema); setOpen(false); setSchema(null); setPrompt(''); setError('');
    } catch (requestError) {
      const details = requestError?.response?.data?.details;
      setError([requestError?.response?.data?.error || requestError.message || 'Unable to validate the evaluation structure.', ...(Array.isArray(details) ? details.slice(0, 3) : [])].join(' '));
    } finally { setIsApplying(false); }
  }

  return (
    <section className="ai-builder-entry">
      <div className="ai-builder-entry-copy"><strong>Build a richer rubric with AI</strong><span>Generate structured judge fields from your event brief, then review every suggestion.</span></div>
      <button type="button" className="ai-builder-open-button" onClick={() => { setOpen(true); setSchema(value || null); setIsEditing(false); setPrompt(value ? (value.description?.trim() || `Improve the ${value.title} evaluation structure.`) : ''); setError(''); }}>AI Assist</button>
      {value && <div className="ai-schema-saved"><span><strong>{value.title}</strong> | {value.sections.length} sections added</span><button type="button" onClick={() => { setOpen(true); setSchema(value); setIsEditing(false); setPrompt(value.description?.trim() || `Improve the ${value.title} evaluation structure.`); setError(''); }}>Edit schema</button><button type="button" onClick={() => onApply(null)}>Remove</button></div>}
      {open && <div className="ai-builder-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isGenerating) setOpen(false); }}>
        <section className="ai-builder-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-builder-title">
          <header className="ai-builder-dialog-header"><div><span>ORGANIZER TOOL</span><h2 id="ai-builder-title">AI Criteria Builder</h2><p>AI drafts the form. You stay in control of what judges see.</p></div><button type="button" aria-label="Close AI builder" onClick={() => setOpen(false)}>Close</button></header>
          <div className="ai-builder-context"><strong>Event context</strong><span>{event?.name || 'Event'} | {event?.type || 'Type not set'}</span><p>{event?.description || 'No event description has been added.'}</p><small>Current evaluation: {model} | Existing criteria: {existingCriteria.length ? existingCriteria.join(', ') : 'None yet'}</small></div>
          {!schema && <>
            <label className="ai-builder-prompt">Describe how judges should evaluate this event<textarea rows={5} maxLength={5000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Create a detailed evaluation focusing on innovation, technical implementation, practical impact and presentation. Include sub-criteria and required judge questions." /></label>
            <div className="ai-builder-dialog-actions"><button type="button" className="ai-builder-secondary" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="ai-builder-primary" onClick={generate} disabled={isGenerating}>{isGenerating ? 'Generating...' : 'Generate schema'}</button></div>
          </>}
          {schema && !isEditing && preview && <div className="ai-schema-review ai-schema-preview">
            <div className="ai-schema-review-heading"><div><span>REVIEW BEFORE APPLYING</span><h3>Generated evaluation</h3></div></div>
            <label className="ai-builder-prompt">Regeneration instructions<textarea rows={3} maxLength={5000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe what you want to change." /></label>
            <div className="ai-schema-preview-card"><h4>{preview.title}</h4>{preview.description && <p>{preview.description}</p>}
              {preview.sections.map((section) => <section className="ai-schema-preview-section" key={section.id}>
                <div><h5>{section.name}</h5>{section.description && <p>{section.description}</p>}</div>
                {section.fields.map((field) => <PreviewField key={field.id} field={field} />)}
              </section>)}
            </div>
            {scoreFields.length > 0 && <p className="ai-schema-weight valid">Scores within this AI rubric total 100%.</p>}
            <div className="ai-builder-dialog-actions"><button type="button" className="ai-builder-secondary" onClick={() => setIsEditing(true)}>Edit</button><button type="button" className="ai-builder-secondary" onClick={generate} disabled={isGenerating || prompt.trim().length < 10}>{isGenerating ? 'Generating...' : 'Regenerate'}</button><button type="button" className="ai-builder-primary" onClick={apply} disabled={isApplying}>{isApplying ? 'Validating...' : 'Add to Evaluation'}</button></div>
          </div>}
          {schema && isEditing && <div className="ai-schema-review">
            <div className="ai-schema-review-heading"><div><span>EDIT GENERATED STRUCTURE</span><h3>{schema.title}</h3></div><div className="ai-schema-section-tools"><button type="button" className="ai-builder-secondary" onClick={() => setIsEditing(false)}>Preview</button><button type="button" className="ai-builder-secondary" onClick={generate} disabled={isGenerating || prompt.trim().length < 10}>{isGenerating ? 'Generating...' : 'Regenerate'}</button></div></div>
            <label className="ai-schema-title">Title<input value={schema.title} onChange={(event) => setSchema({ ...schema, title: event.target.value })} maxLength={150} /></label>
            <label className="ai-schema-title">Description<textarea value={schema.description || ''} onChange={(event) => setSchema({ ...schema, description: event.target.value })} rows={2} maxLength={1000} /></label>
            {schema.sections.map((section, sectionIndex) => <article className="ai-schema-section" key={section.id}>
              <div className="ai-schema-section-tools"><strong>Section {sectionIndex + 1}</strong><div><button type="button" onClick={() => setSchema({ ...schema, sections: moveItem(schema.sections, sectionIndex, -1) })}>Up</button><button type="button" onClick={() => setSchema({ ...schema, sections: moveItem(schema.sections, sectionIndex, 1) })}>Down</button><button type="button" onClick={() => setSchema({ ...schema, sections: schema.sections.filter((_, index) => index !== sectionIndex) })}>Remove section</button></div></div>
              <label>Section name<input value={section.name} onChange={(event) => updateSection(sectionIndex, { name: event.target.value })} maxLength={150} /></label>
              <label>Description<input value={section.description || ''} onChange={(event) => updateSection(sectionIndex, { description: event.target.value })} maxLength={1000} /></label>
              {section.fields.map((field, fieldIndex) => <FieldEditor key={field.id} field={field} onChange={(updated) => updateSection(sectionIndex, { fields: updateFieldTree(section.fields, field.id, () => updated) })} onRemove={() => updateSection(sectionIndex, { fields: removeFieldTree(section.fields, field.id) })} onMove={(direction) => updateSection(sectionIndex, { fields: moveItem(section.fields, fieldIndex, direction) })} />)}
              <button type="button" className="ai-builder-add-field" onClick={() => updateSection(sectionIndex, { fields: [...section.fields, { id: idFor(), type: 'text', label: 'New field', description: '', rationale: '', required: false }] })}>+ Add field</button>
            </article>)}
            <button type="button" className="ai-builder-add-section" onClick={() => setSchema({ ...schema, sections: [...schema.sections, { id: idFor(), name: 'New section', description: '', fields: [{ id: idFor(), type: 'text', label: 'New field', description: '', rationale: '', required: false }] }] })}>+ Add section</button>
            {scoreFields.length > 0 && <p className={`ai-schema-weight ${Math.abs(scoreWeightTotal - 100) <= 0.01 ? 'valid' : ''}`}>AI rubric score weights: {Number(scoreWeightTotal.toFixed(2))}% / 100%. {Math.abs(scoreWeightTotal - 100) > 0.01 && 'Adjust weights before adding.'}</p>}
            <p className="ai-schema-scoring-note">Numeric fields form a separate AI rubric. Existing evaluation criteria and their weighting stay unchanged.</p>
            <div className="ai-builder-dialog-actions"><button type="button" className="ai-builder-secondary" onClick={() => setSchema(null)}>Back to prompt</button><button type="button" className="ai-builder-secondary" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="ai-builder-primary" onClick={apply} disabled={isApplying || !schema.sections.length || (scoreFields.length > 0 && Math.abs(scoreWeightTotal - 100) > 0.01)}>{isApplying ? 'Validating...' : 'Add to Evaluation'}</button></div>
          </div>}
          {error && <p className="ai-builder-error" role="alert">{error}</p>}
        </section>
      </div>}
    </section>
  );
}
