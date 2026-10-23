import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import OrganizerLayout from './OrganizerLayout';
import EvaluationAiBuilder from './EvaluationAiBuilder';
import './EvaluationConfiguration.css';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

const EVALUATION_TYPES = [
  { id: 'criteria-based', label: 'Criteria Based' },
  { id: 'open-holistic', label: 'Overall / Holistic' },
  { id: 'live-demo', label: 'Live Demo' },
  { id: 'ranking-voting', label: 'Ranking' },
  { id: 'remote-async', label: 'Remote / Async' },
  { id: 'custom', label: 'Custom' },
];

const MATERIAL_TYPES = ['GitHub', 'Demo Video', 'Documentation', 'Project Link', 'Other Link'];
const EMPTY_CONFIG = {
  'criteria-based': { criteriaBased: { criteria: [] } },
  'open-holistic': {
    openHolistic: {
      scoreMin: 0,
      scoreMax: 100,
      githubReview: false,
      projectReview: false,
      overallFeedback: true,
    },
  },
  'live-demo': {
    liveDemo: {
      demoEvaluation: true,
      presentationEvaluation: true,
      judgeQuestions: true,
      overallScoreFeedback: true,
      criteria: [],
    },
  },
  'ranking-voting': { rankingVoting: { ranking: true, comments: true, rankCalculation: 'total' } },
  'remote-async': { remoteAsync: { materials: [] } },
  custom: { custom: { fields: [] } },
};

function toEditorCriteria(criteria, prefix) {
  if (!Array.isArray(criteria)) return [];
  return criteria.map((criterion, index) => ({
    name: typeof criterion?.name === 'string' ? criterion.name : '',
    description: typeof criterion?.description === 'string' ? criterion.description : '',
    maxMarks: String(criterion?.maxMarks ?? ''),
    weight: String(criterion?.weight ?? ''),
    editorId: String(criterion?._id || criterion?.id || `${prefix}-${index}`),
  }));
}

function normalizeConfiguration(data) {
  const defaults = structuredClone(EMPTY_CONFIG);
  if (!data || !defaults[data.model]) return { ...defaults, dynamicSchema: data?.dynamicSchema || null };
  const config = { ...defaults, [data.model]: { ...defaults[data.model] } };
  if (data.model === 'criteria-based') {
    config[data.model].criteriaBased = {
      criteria: toEditorCriteria(data.criteriaBased?.criteria, data.model),
    };
  } else if (data.model === 'live-demo') {
    config[data.model].liveDemo = {
      ...defaults[data.model].liveDemo,
      ...(data.liveDemo || {}),
      criteria: toEditorCriteria(data.liveDemo?.criteria, data.model),
    };
  } else if (data.model === 'open-holistic') {
    config[data.model].openHolistic = { ...defaults[data.model].openHolistic, ...(data.openHolistic || {}) };
  } else if (data.model === 'ranking-voting') {
    config[data.model].rankingVoting = { ...defaults[data.model].rankingVoting, ...(data.rankingVoting || {}) };
  } else if (data.model === 'remote-async') {
    config[data.model].remoteAsync = { materials: Array.isArray(data.remoteAsync?.materials) ? data.remoteAsync.materials : [] };
  } else if (data.model === 'custom') {
    config[data.model].custom = {
      fields: Array.isArray(data.custom?.fields)
        ? data.custom.fields.map((field) => ({
          ...field,
          type: ['criteria', 'question', 'material', 'feedback'].includes(field.type) ? field.type : 'criteria',
        }))
        : [],
    };
  }
  return { ...config, dynamicSchema: data.dynamicSchema || null };
}

function criteriaForApi(criteria) {
  return criteria.map(({ name, description, maxMarks, weight }) => ({
    name: name.trim(),
    description: description.trim(),
    maxMarks: Number(maxMarks),
    weight: Number(weight),
  }));
}

function validateCriteria(criteria, required = true) {
  if (required && criteria.length === 0) return 'Add at least one criterion.';
  const names = new Set();
  for (const criterion of criteria) {
    const name = criterion.name.trim();
    const maxMarks = Number(criterion.maxMarks);
    const weight = Number(criterion.weight);
    if (!name) return 'Every criterion needs a name.';
    if (names.has(name.toLocaleLowerCase())) return 'Criterion names must be unique.';
    names.add(name.toLocaleLowerCase());
    if (!Number.isFinite(maxMarks) || maxMarks <= 0) return `Enter maximum marks greater than zero for “${name}”.`;
    if (criterion.weight === '' || !Number.isFinite(weight) || weight < 0) return `Enter a weight of 0% or more for “${name}”.`;
  }
  if (criteria.length > 0) {
    const weight = criteria.reduce((sum, criterion) => sum + Number(criterion.weight), 0);
    if (Math.abs(weight - 100) > 0.01) return `Criterion weights must total 100%. Current total: ${weight}%.`;
  }
  return '';
}

function getConfigurationError(model, config, liveCriteriaEnabled, criteriaCreationMode = 'manual') {
  if (model === 'criteria-based') {
    if (criteriaCreationMode === 'ai') {
      return config.dynamicSchema ? '' : 'Generate and add an AI evaluation schema before saving.';
    }
    return validateCriteria(config['criteria-based'].criteriaBased.criteria);
  }
  if (model === 'open-holistic') {
    const { scoreMin, scoreMax } = config['open-holistic'].openHolistic;
    if (!Number.isFinite(Number(scoreMin)) || Number(scoreMin) < 0) return 'Minimum score must be zero or higher.';
    if (!Number.isFinite(Number(scoreMax)) || Number(scoreMax) <= Number(scoreMin)) return 'Maximum score must be greater than the minimum score.';
  }
  if (model === 'live-demo') {
    const live = config['live-demo'].liveDemo;
    const hasSection = live.demoEvaluation || live.presentationEvaluation || live.judgeQuestions || live.overallScoreFeedback || liveCriteriaEnabled;
    if (!hasSection) return 'Enable at least one live demo section.';
    if (liveCriteriaEnabled) return validateCriteria(live.criteria);
  }
  if (model === 'remote-async') {
    const materials = config['remote-async'].remoteAsync.materials;
    if (materials.length === 0) return 'Add at least one material for judges to review.';
    if (materials.some((material) => !material.label?.trim() || !material.url?.trim())) return 'Each material needs a label and link.';
  }
  if (model === 'ranking-voting') {
    const ranking = config['ranking-voting'].rankingVoting;
    if (!ranking.ranking && !ranking.comments) return 'Enable ranking, comments, or both.';
  }
  if (model === 'custom') {
    const fields = config.custom.custom.fields;
    if (fields.length === 0) return 'Add at least one evaluation field.';
    if (fields.some((field) => !field.label?.trim())) return 'Every custom field needs a label.';
  }
  return '';
}

function CriterionEditor({ criteria, onChange }) {
  const [draft, setDraft] = useState({ name: '', description: '', maxMarks: '', weight: '' });
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');
  const weightTotal = criteria.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);

  function submit(event) {
    event.preventDefault();
    const name = draft.name.trim();
    const maxMarks = Number(draft.maxMarks);
    const weight = Number(draft.weight);
    if (!name) return setError('Enter a criterion name.');
    if (!Number.isFinite(maxMarks) || maxMarks <= 0) return setError('Maximum marks must be greater than zero.');
    if (draft.weight === '' || !Number.isFinite(weight) || weight < 0) return setError('Weight must be zero or greater.');
    const duplicate = criteria.some((item) => item.editorId !== editingId && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    if (duplicate) return setError('Criterion names must be unique.');

    const next = { ...draft, name, maxMarks: String(maxMarks), weight: String(weight), editorId: editingId || `criterion-${Date.now()}-${Math.random()}` };
    onChange(editingId
      ? criteria.map((item) => item.editorId === editingId ? next : item)
      : [...criteria, next]);
    setDraft({ name: '', description: '', maxMarks: '', weight: '' });
    setEditingId('');
    setError('');
  }

  function edit(criterion) {
    setEditingId(criterion.editorId);
    setDraft({ name: criterion.name, description: criterion.description, maxMarks: criterion.maxMarks, weight: criterion.weight });
    setError('');
  }

  function remove(editorId) {
    onChange(criteria.filter((criterion) => criterion.editorId !== editorId));
    if (editingId === editorId) {
      setEditingId('');
      setDraft({ name: '', description: '', maxMarks: '', weight: '' });
    }
  }

  return (
    <div className="evaluation-simple-section">
      <div className="evaluation-simple-section-heading">
        <div><h3>Evaluation Criteria</h3><p>Add the scores judges will use for each team.</p></div>
      </div>
      <form className="evaluation-criterion-editor" onSubmit={submit}>
        <label className="evaluation-simple-field">
          <span>Name <b>*</b></span>
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Technical Implementation" required />
        </label>
        <label className="evaluation-simple-field">
          <span>Description <small>(optional)</small></span>
          <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="What should judges look for?" />
        </label>
        <label className="evaluation-simple-field">
          <span>Maximum Marks <b>*</b></span>
          <input type="number" min="0.01" step="any" value={draft.maxMarks} onChange={(event) => setDraft({ ...draft, maxMarks: event.target.value })} required />
        </label>
        <label className="evaluation-simple-field">
          <span>Weight (%) <b>*</b></span>
          <input type="number" min="0" step="any" value={draft.weight} onChange={(event) => setDraft({ ...draft, weight: event.target.value })} required />
        </label>
        <div className="evaluation-criterion-editor-actions">
          {editingId && <button className="evaluation-secondary-button" type="button" onClick={() => { setEditingId(''); setDraft({ name: '', description: '', maxMarks: '', weight: '' }); setError(''); }}>Cancel edit</button>}
          <button className="evaluation-secondary-button" type="submit">{editingId ? 'Save Criterion' : '+ Add Criterion'}</button>
        </div>
      </form>
      {error && <p className="evaluation-inline-error" role="alert">{error}</p>}
      {criteria.map((criterion) => (
        <article className="evaluation-simple-list-item" key={criterion.editorId}>
          <div><strong>{criterion.name}</strong>{criterion.description && <p>{criterion.description}</p>}<small>Maximum {criterion.maxMarks} marks · Weight {criterion.weight}%</small></div>
          <div className="evaluation-simple-item-actions">
            <button type="button" onClick={() => edit(criterion)}>Edit</button>
            <button type="button" onClick={() => remove(criterion.editorId)}>Remove</button>
          </div>
        </article>
      ))}
      <div className={`evaluation-weight-total${Math.abs(weightTotal - 100) < 0.01 ? ' valid' : ''}`}>
        {Math.abs(weightTotal - 100) < 0.01
          ? <>Total Weight: {weightTotal}% ✓</>
          : weightTotal < 100
            ? <>Total Weight: {weightTotal}% — Add {Number((100 - weightTotal).toFixed(2))}%</>
            : <>Total Weight: {weightTotal}% — Reduce by {Number((weightTotal - 100).toFixed(2))}%</>}
      </div>
      {criteria.length === 0 && <p className="evaluation-simple-hint">Add one or more criteria. Weights must total 100% before saving.</p>}
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="evaluation-toggle-row">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function EvaluationConfiguration() {
  const { eventId } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedModel, setSelectedModel] = useState('criteria-based');
  const [criteriaCreationMode, setCriteriaCreationMode] = useState('manual');
  const [configuration, setConfiguration] = useState(() => structuredClone(EMPTY_CONFIG));
  const [liveCriteriaEnabled, setLiveCriteriaEnabled] = useState(false);
  const [materialType, setMaterialType] = useState(MATERIAL_TYPES[0]);
  const [materialUrl, setMaterialUrl] = useState('');
  const [otherMaterialLabel, setOtherMaterialLabel] = useState('');
  const [customDraft, setCustomDraft] = useState({ label: '', type: 'criteria', required: true });
  const [customError, setCustomError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!eventId) {
        setPageError('An event is required to configure evaluation.');
        setLoading(false);
        return;
      }
      try {
        const [eventResponse, configResponse] = await Promise.all([
          API.get(`/events/${encodeURIComponent(eventId)}`),
          API.get(`/events/${encodeURIComponent(eventId)}/evaluation-config`),
        ]);
        if (cancelled) return;
        setEvent(eventResponse.data?.data || null);
        const savedConfig = configResponse.data?.data;
        if (savedConfig?.model && EMPTY_CONFIG[savedConfig.model]) {
          setSelectedModel(savedConfig.model);
          setConfiguration(normalizeConfiguration(savedConfig));
          setCriteriaCreationMode(savedConfig.dynamicSchema ? 'ai' : 'manual');
          setLiveCriteriaEnabled(savedConfig.model === 'live-demo' && (savedConfig.liveDemo?.criteria?.length || 0) > 0);
          setSaved(true);
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(error?.response?.data?.error || 'Unable to load this event and its evaluation configuration.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [eventId]);

  const criteriaBased = configuration['criteria-based'].criteriaBased.criteria;
  const liveDemo = configuration['live-demo'].liveDemo;
  const liveCriteria = liveDemo.criteria;
  const selectedLabel = useMemo(() => EVALUATION_TYPES.find((type) => type.id === selectedModel)?.label || 'Evaluation', [selectedModel]);

  function updateSection(model, section, field, value) {
    setConfiguration((current) => ({
      ...current,
      [model]: { ...current[model], [section]: { ...current[model][section], [field]: value } },
    }));
    setSaved(false);
    setSaveError('');
  }

  function updateCriteria(model, criteria) {
    const section = model === 'criteria-based' ? 'criteriaBased' : 'liveDemo';
    updateSection(model, section, 'criteria', criteria);
  }

  function addMaterial(event) {
    event.preventDefault();
    const label = materialType === 'Other Link' ? otherMaterialLabel.trim() : materialType;
    if (!label || !materialUrl.trim()) return setSaveError('Enter a material name and link.');
    const materials = [...configuration['remote-async'].remoteAsync.materials, { label, url: materialUrl.trim() }];
    updateSection('remote-async', 'remoteAsync', 'materials', materials);
    setMaterialUrl('');
    setOtherMaterialLabel('');
    setMaterialType(MATERIAL_TYPES[0]);
  }

  function addCustomField(event) {
    event.preventDefault();
    if (!customDraft.label.trim()) return setCustomError('Enter a field label.');
    const fields = [...configuration.custom.custom.fields, { ...customDraft, label: customDraft.label.trim() }];
    updateSection('custom', 'custom', 'fields', fields);
    setCustomDraft({ label: '', type: 'criteria', required: true });
    setCustomError('');
  }

  function validateSelectedConfiguration() {
    const validationConfig = structuredClone(configuration);
    validationConfig['criteria-based'].criteriaBased.criteria = criteriaForApi(criteriaBased);
    validationConfig['live-demo'].liveDemo.criteria = liveCriteriaEnabled ? criteriaForApi(liveCriteria) : [];
    return getConfigurationError(selectedModel, validationConfig, liveCriteriaEnabled, criteriaCreationMode);
  }

  async function saveConfiguration() {
    const error = validateSelectedConfiguration();
    if (error) {
      setSaveError(error);
      setSaved(false);
      return;
    }

    const modelConfig = structuredClone(configuration[selectedModel]);
    if (selectedModel === 'criteria-based') modelConfig.criteriaBased.criteria = criteriaForApi(criteriaBased);
    if (selectedModel === 'live-demo') modelConfig.liveDemo.criteria = liveCriteriaEnabled ? criteriaForApi(liveCriteria) : [];
    if (selectedModel === 'ranking-voting') modelConfig.rankingVoting.rankCalculation ||= 'total';

    setSaving(true);
    setSaveError('');
    try {
      const response = await API.put(`/events/${encodeURIComponent(eventId)}/evaluation-config`, {
        model: selectedModel,
        ...modelConfig,
        dynamicSchema: configuration.dynamicSchema || null,
      });
      if (!response.data?.success) throw new Error(response.data?.error || 'Unable to save evaluation configuration.');
      setSaved(true);
    } catch (error) {
      setSaved(false);
      setSaveError(error?.response?.data?.error || error.message || 'Unable to save evaluation configuration. Check the server and try again.');
    } finally {
      setSaving(false);
    }
  }

  function selectModel(model) {
    setSelectedModel(model);
    setSaved(false);
    setSaveError('');
  }

  function selectCriteriaCreationMode(mode) {
    setCriteriaCreationMode(mode);
    setSaved(false);
    setSaveError('');
  }

  if (loading) {
    return <OrganizerLayout activeKey="criteria" eventId={eventId}><div className="evaluation-wizard"><p role="status">Loading event evaluation…</p></div></OrganizerLayout>;
  }

  return (
    <OrganizerLayout activeKey="criteria" eventId={eventId}>
      <main className="evaluation-wizard">
        <Link className="evaluation-wizard-back" to={`/organizer/events/${eventId}`}>&larr; Back to Event</Link>
        <header className="evaluation-wizard-header">
          <p>{event?.name || 'Event'}</p>
          <h1>Evaluation</h1>
          <span>Choose how judges will evaluate teams.</span>
        </header>

        {pageError ? (
          <p className="evaluation-wizard-error" role="alert">{pageError}</p>
        ) : (
          <>
            <label className="evaluation-type-select">
              <span>Evaluation Type</span>
              <select value={selectedModel} onChange={(event) => selectModel(event.target.value)}>
                {EVALUATION_TYPES.map((type) => <option value={type.id} key={type.id}>{type.label}</option>)}
              </select>
            </label>

            {selectedModel === 'criteria-based' && (
              <fieldset className="evaluation-creation-mode">
                <legend>Choose how to create evaluation criteria</legend>
                <div className="evaluation-creation-mode-options">
                  <label className={criteriaCreationMode === 'manual' ? 'selected' : ''}>
                    <input type="radio" name="criteria-creation-mode" value="manual" checked={criteriaCreationMode === 'manual'} onChange={() => selectCriteriaCreationMode('manual')} />
                    <span><strong>Manual Criteria</strong><small>Add and edit each criterion yourself.</small></span>
                  </label>
                  <label className={criteriaCreationMode === 'ai' ? 'selected' : ''}>
                    <input type="radio" name="criteria-creation-mode" value="ai" checked={criteriaCreationMode === 'ai'} onChange={() => selectCriteriaCreationMode('ai')} />
                    <span><strong>✨ AI Evaluation Builder</strong><small>Describe your rubric, then review and edit the generated criteria.</small></span>
                  </label>
                </div>
              </fieldset>
            )}

            {!(selectedModel === 'criteria-based' && criteriaCreationMode === 'ai') && (
            <section className="evaluation-wizard-card" aria-label={`${selectedLabel} configuration`}>
              {selectedModel === 'criteria-based' && criteriaCreationMode === 'manual' && (
                <CriterionEditor criteria={criteriaBased} onChange={(criteria) => updateCriteria('criteria-based', criteria)} />
              )}

              {selectedModel === 'open-holistic' && (
                <div className="evaluation-type-fields">
                  <h2>Overall Score</h2>
                  <div className="evaluation-number-fields">
                    <label className="evaluation-simple-field"><span>Minimum Score</span><input type="number" min="0" value={configuration['open-holistic'].openHolistic.scoreMin} onChange={(event) => updateSection('open-holistic', 'openHolistic', 'scoreMin', event.target.value)} /></label>
                    <label className="evaluation-simple-field"><span>Maximum Score</span><input type="number" min="1" value={configuration['open-holistic'].openHolistic.scoreMax} onChange={(event) => updateSection('open-holistic', 'openHolistic', 'scoreMax', event.target.value)} /></label>
                  </div>
                  <div className="evaluation-toggle-list">
                    <Toggle label="Review GitHub" checked={configuration['open-holistic'].openHolistic.githubReview} onChange={(value) => updateSection('open-holistic', 'openHolistic', 'githubReview', value)} />
                    <Toggle label="Review Project" checked={configuration['open-holistic'].openHolistic.projectReview} onChange={(value) => updateSection('open-holistic', 'openHolistic', 'projectReview', value)} />
                    <Toggle label="Overall Feedback" checked={configuration['open-holistic'].openHolistic.overallFeedback} onChange={(value) => updateSection('open-holistic', 'openHolistic', 'overallFeedback', value)} />
                  </div>
                </div>
              )}

              {selectedModel === 'live-demo' && (
                <div className="evaluation-type-fields">
                  <div className="evaluation-toggle-list">
                    <Toggle label="Demo" checked={liveDemo.demoEvaluation} onChange={(value) => updateSection('live-demo', 'liveDemo', 'demoEvaluation', value)} />
                    <Toggle label="Presentation" checked={liveDemo.presentationEvaluation} onChange={(value) => updateSection('live-demo', 'liveDemo', 'presentationEvaluation', value)} />
                    <Toggle label="Judge Questions" checked={liveDemo.judgeQuestions} onChange={(value) => updateSection('live-demo', 'liveDemo', 'judgeQuestions', value)} />
                    <Toggle label="Overall Feedback" checked={liveDemo.overallScoreFeedback} onChange={(value) => updateSection('live-demo', 'liveDemo', 'overallScoreFeedback', value)} />
                    <Toggle label="Include scoring criteria" checked={liveCriteriaEnabled} onChange={(value) => { setLiveCriteriaEnabled(value); setSaved(false); setSaveError(''); }} />
                  </div>
                  {liveCriteriaEnabled && <CriterionEditor criteria={liveCriteria} onChange={(criteria) => updateCriteria('live-demo', criteria)} />}
                </div>
              )}

              {selectedModel === 'ranking-voting' && (
                <div className="evaluation-type-fields">
                  <div className="evaluation-toggle-list">
                    <Toggle label="Ranking" checked={configuration['ranking-voting'].rankingVoting.ranking} onChange={(value) => updateSection('ranking-voting', 'rankingVoting', 'ranking', value)} />
                    <Toggle label="Comments" checked={configuration['ranking-voting'].rankingVoting.comments} onChange={(value) => updateSection('ranking-voting', 'rankingVoting', 'comments', value)} />
                  </div>
                </div>
              )}

              {selectedModel === 'remote-async' && (
                <div className="evaluation-type-fields">
                  <h2>Materials for Judges</h2>
                  <p className="evaluation-wizard-hint">Add the links judges should review for each team.</p>
                  <form className="evaluation-material-editor" onSubmit={addMaterial}>
                    <label className="evaluation-simple-field"><span>Material</span><select value={materialType} onChange={(event) => setMaterialType(event.target.value)}>{MATERIAL_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
                    {materialType === 'Other Link' && <label className="evaluation-simple-field"><span>Link Name</span><input value={otherMaterialLabel} onChange={(event) => setOtherMaterialLabel(event.target.value)} /></label>}
                    <label className="evaluation-simple-field"><span>Link</span><input type="url" value={materialUrl} onChange={(event) => setMaterialUrl(event.target.value)} placeholder="https://…" /></label>
                    <button className="evaluation-secondary-button" type="submit">+ Add Material</button>
                  </form>
                  {configuration['remote-async'].remoteAsync.materials.map((material, index) => (
                    <article className="evaluation-simple-list-item" key={`${material.label}-${index}`}>
                      <div><strong>{material.label}</strong><p>{material.url}</p></div>
                      <button type="button" onClick={() => updateSection('remote-async', 'remoteAsync', 'materials', configuration['remote-async'].remoteAsync.materials.filter((_, i) => i !== index))}>Remove</button>
                    </article>
                  ))}
                </div>
              )}

              {selectedModel === 'custom' && (
                <div className="evaluation-type-fields">
                  <h2>Evaluation Fields</h2>
                  <p className="evaluation-wizard-hint">Add the questions or scores judges should complete.</p>
                  <form className="evaluation-custom-editor" onSubmit={addCustomField}>
                    <label className="evaluation-simple-field"><span>Label</span><input value={customDraft.label} onChange={(event) => setCustomDraft({ ...customDraft, label: event.target.value })} placeholder="e.g. Technical Depth" /></label>
                    <label className="evaluation-simple-field"><span>Field Type</span><select value={customDraft.type} onChange={(event) => setCustomDraft({ ...customDraft, type: event.target.value })}><option value="criteria">Score</option><option value="question">Question</option><option value="material">Review Link</option><option value="feedback">Feedback</option></select></label>
                    <Toggle label="Required" checked={customDraft.required} onChange={(required) => setCustomDraft({ ...customDraft, required })} />
                    <button className="evaluation-secondary-button" type="submit">+ Add Field</button>
                  </form>
                  {customError && <p className="evaluation-inline-error" role="alert">{customError}</p>}
                  {configuration.custom.custom.fields.map((field, index) => (
                    <article className="evaluation-simple-list-item" key={`${field.label}-${index}`}>
                      <div><strong>{field.label}</strong><small>{field.type === 'criteria' ? 'Score' : field.type === 'material' ? 'Review Link' : field.type} · {field.required ? 'Required' : 'Optional'}</small></div>
                      <button type="button" onClick={() => updateSection('custom', 'custom', 'fields', configuration.custom.custom.fields.filter((_, i) => i !== index))}>Remove</button>
                    </article>
                  ))}
                </div>
              )}
            </section>
            )}

            {(selectedModel !== 'criteria-based' || criteriaCreationMode === 'ai') && <EvaluationAiBuilder
              eventId={eventId}
              event={event}
              model={selectedModel}
              existingCriteria={[
                ...criteriaBased.map((criterion) => criterion.name),
                ...liveCriteria.map((criterion) => criterion.name),
                ...configuration.custom.custom.fields.map((field) => field.label),
              ].filter(Boolean)}
              value={configuration.dynamicSchema}
              onApply={(schema) => {
                setConfiguration((current) => ({ ...current, dynamicSchema: schema }));
                setSaved(false);
                setSaveError('');
              }}
            />}

            {saveError && <p className="evaluation-wizard-error" role="alert">{saveError}</p>}
            {saved && <p className="evaluation-wizard-success" role="status">Evaluation settings saved for this event.</p>}
            <footer className="evaluation-wizard-actions">
              <Link className="evaluation-secondary-button" to={`/organizer/events/${eventId}`}>Cancel</Link>
              <button className="evaluation-save-button" type="button" onClick={saveConfiguration} disabled={saving}>
                {saving ? 'Saving…' : 'Save Evaluation'}
              </button>
            </footer>
          </>
        )}
      </main>
    </OrganizerLayout>
  );
}

export default EvaluationConfiguration;
