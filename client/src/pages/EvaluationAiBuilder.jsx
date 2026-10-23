import { useMemo, useState } from 'react';
import axios from 'axios';
import './EvaluationAiBuilder.css';

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
          <button type="button" onClick={() => onMove(-1)} aria-label="Move field up" disabled={readOnly}>↑</button>
          <button type="button" onClick={() => onMove(1)} aria-label="Move field down" disabled={readOnly}>↓</button>
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

export default function EvaluationAiBuilder({ eventId, event, model, existingCriteria = [], value, onApply }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [schema, setSchema] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const scoreFields = useMemo(() => {
    const result = [];
    const visit = (fields) => (fields || []).forEach((field) => { if (field.type === 'score') result.push(field); if (field.type === 'group') visit(field.children); });
    (schema?.sections || []).forEach((section) => visit(section.fields));
    return result;
  }, [schema]);
  const scoreWeightTotal = scoreFields.reduce((total, field) => total + Number(field.weight || 0), 0);

  async function generate() {
    if (prompt.trim().length < 10) { setError('Describe the evaluation in at least 10 characters.'); return; }
    setIsGenerating(true); setError('');
    try {
      const response = await API.post(`/events/${encodeURIComponent(eventId)}/evaluation/ai-generate`, { prompt: prompt.trim() });
      if (!response.data?.success || !response.data.data?.schema) throw new Error(response.data?.error || 'Unable to generate an evaluation schema.');
      setSchema(response.data.data.schema);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || requestError.message || 'Unable to generate an evaluation schema.');
    } finally { setIsGenerating(false); }
  }

  function updateSection(index, changes) { setSchema((current) => ({ ...current, sections: current.sections.map((section, sectionIndex) => sectionIndex === index ? { ...section, ...changes } : section) })); }
  function apply() {
    if (!schema || (scoreFields.length && Math.abs(scoreWeightTotal - 100) > 0.01)) return;
    onApply(schema); setOpen(false); setSchema(null); setPrompt(''); setError('');
  }

  return (
    <section className="ai-builder-entry">
      <div className="ai-builder-entry-copy"><strong>Build a richer rubric with AI</strong><span>Generate structured judge fields from your event brief, then review every suggestion.</span></div>
      <button type="button" className="ai-builder-open-button" onClick={() => { setOpen(true); setSchema(value || null); setError(''); }}>✨ AI Assist</button>
      {value && <div className="ai-schema-saved"><span><strong>{value.title}</strong> · {value.sections.length} sections added</span><button type="button" onClick={() => { setOpen(true); setSchema(value); }}>Edit schema</button><button type="button" onClick={() => onApply(null)}>Remove</button></div>}
      {open && <div className="ai-builder-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isGenerating) setOpen(false); }}>
        <section className="ai-builder-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-builder-title">
          <header className="ai-builder-dialog-header"><div><span>ORGANIZER TOOL</span><h2 id="ai-builder-title">AI Criteria Builder</h2><p>AI drafts the form. You stay in control of what judges see.</p></div><button type="button" aria-label="Close AI builder" onClick={() => setOpen(false)}>×</button></header>
          <div className="ai-builder-context"><strong>Event context</strong><span>{event?.name || 'Event'} · {event?.type || 'Type not set'}</span><p>{event?.description || 'No event description has been added.'}</p><small>Current evaluation: {model} · Existing criteria: {existingCriteria.length ? existingCriteria.join(', ') : 'None yet'}</small></div>
          {!schema && <>
            <label className="ai-builder-prompt">Describe how judges should evaluate this event<textarea rows={5} maxLength={5000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Create a detailed evaluation focusing on innovation, technical implementation, practical impact and presentation. Include sub-criteria and required judge questions." /></label>
            <div className="ai-builder-dialog-actions"><button type="button" className="ai-builder-secondary" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="ai-builder-primary" onClick={generate} disabled={isGenerating}>{isGenerating ? 'Generating…' : 'Generate schema'}</button></div>
          </>}
          {schema && <div className="ai-schema-review">
            <div className="ai-schema-review-heading"><div><span>REVIEW BEFORE APPLYING</span><h3>Suggested evaluation structure</h3></div><button type="button" className="ai-builder-secondary" onClick={generate} disabled={isGenerating}>{isGenerating ? 'Generating…' : 'Regenerate'}</button></div>
            <label className="ai-schema-title">Title<input value={schema.title} onChange={(event) => setSchema({ ...schema, title: event.target.value })} maxLength={150} /></label>
            <label className="ai-schema-title">Description<textarea value={schema.description || ''} onChange={(event) => setSchema({ ...schema, description: event.target.value })} rows={2} maxLength={1000} /></label>
            {schema.sections.map((section, sectionIndex) => <article className="ai-schema-section" key={section.id}>
              <div className="ai-schema-section-tools"><strong>Section {sectionIndex + 1}</strong><div><button type="button" onClick={() => setSchema({ ...schema, sections: moveItem(schema.sections, sectionIndex, -1) })}>↑</button><button type="button" onClick={() => setSchema({ ...schema, sections: moveItem(schema.sections, sectionIndex, 1) })}>↓</button><button type="button" onClick={() => setSchema({ ...schema, sections: schema.sections.filter((_, index) => index !== sectionIndex) })}>Remove section</button></div></div>
              <label>Section name<input value={section.name} onChange={(event) => updateSection(sectionIndex, { name: event.target.value })} maxLength={150} /></label>
              <label>Description<input value={section.description || ''} onChange={(event) => updateSection(sectionIndex, { description: event.target.value })} maxLength={1000} /></label>
              {section.fields.map((field, fieldIndex) => <FieldEditor key={field.id} field={field} onChange={(updated) => updateSection(sectionIndex, { fields: updateFieldTree(section.fields, field.id, () => updated) })} onRemove={() => updateSection(sectionIndex, { fields: removeFieldTree(section.fields, field.id) })} onMove={(direction) => updateSection(sectionIndex, { fields: moveItem(section.fields, fieldIndex, direction) })} />)}
              <button type="button" className="ai-builder-add-field" onClick={() => updateSection(sectionIndex, { fields: [...section.fields, { id: idFor(), type: 'text', label: 'New field', description: '', rationale: '', required: false }] })}>+ Add field</button>
            </article>)}
            <button type="button" className="ai-builder-add-section" onClick={() => setSchema({ ...schema, sections: [...schema.sections, { id: idFor(), name: 'New section', description: '', fields: [{ id: idFor(), type: 'text', label: 'New field', description: '', rationale: '', required: false }] }] })}>+ Add section</button>
            {scoreFields.length > 0 && <p className={`ai-schema-weight ${Math.abs(scoreWeightTotal - 100) <= 0.01 ? 'valid' : ''}`}>AI rubric score weights: {Number(scoreWeightTotal.toFixed(2))}% / 100%. {Math.abs(scoreWeightTotal - 100) > 0.01 && 'Adjust weights before adding.'}</p>}
            <p className="ai-schema-scoring-note">Numeric fields form a separate AI rubric. Existing evaluation criteria and their weighting stay unchanged.</p>
            <div className="ai-builder-dialog-actions"><button type="button" className="ai-builder-secondary" onClick={() => setSchema(null)}>Back to prompt</button><button type="button" className="ai-builder-secondary" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="ai-builder-primary" onClick={apply} disabled={!schema.sections.length || (scoreFields.length > 0 && Math.abs(scoreWeightTotal - 100) > 0.01)}>Add to Evaluation</button></div>
          </div>}
          {error && <p className="ai-builder-error" role="alert">{error}</p>}
        </section>
      </div>}
    </section>
  );
}
