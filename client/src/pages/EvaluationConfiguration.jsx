import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import OrganizerLayout from './OrganizerLayout';
import './EvaluationConfiguration.css';
import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

const MODEL_META = [
  {
    id: 'criteria-based',
    label: 'Criteria-Based Scoring',
    description: 'Score teams against predefined weighted criteria.',
  },
  {
    id: 'open-holistic',
    label: 'Open / Holistic Judging',
    description: 'Overall judgement with a score range and review prompts.',
  },
  {
    id: 'remote-async',
    label: 'Remote / Asynchronous Review',
    description: 'Judge reviews submitted materials and gives feedback.',
  },
  {
    id: 'live-demo',
    label: 'Live Demo & Presentation',
    description: 'Evaluate a live demo, presentation, judge questions, and overall score.',
  },
  {
    id: 'ranking-voting',
    label: 'Ranking / Voting',
    description: 'Judges rank teams instead of marking them.',
  },
  {
    id: 'custom',
    label: 'Custom Evaluation',
    description: 'Compose your own evaluation structure with reusable fields.',
  },
];

const MODELS = MODEL_META.map((m) => m.id);

const EMPTY_CRITERION = { name: '', description: '', maxMarks: '25', weight: '25' };
const EMPTY_MATERIAL = { label: '', url: '' };
const EMPTY_CUSTOM_FIELD = { type: 'criteria', label: '', required: false };
function totalWeight(criteria = []) {
  return criteria.reduce((sum, criterion) => sum + Number(criterion?.weight || 0), 0);
}

function CriteriaForm({
  criteria = [],
  onAddCriterion,
  onUpdateCriterion,
  onDeleteCriterion,
  totalWeight: currentTotal,
}) {
  const [draft, setDraft] = useState(EMPTY_CRITERION);
  const [editingId, setEditingId] = useState(null);

  function applyDraft(nextDraft) {
    setDraft(nextDraft);
  }

  function saveCriterion(event) {
    event.preventDefault();
    const name = draft.name.trim();
    const description = draft.description.trim();
    const maxMarks = Number(draft.maxMarks);
    const weight = Number(draft.weight);

    if (!name) {
      alert('Criterion name is required.');
      return;
    }
    if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
      alert('Maximum marks must be greater than zero.');
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      alert('Weight must be greater than zero.');
      return;
    }

    const nextCriteria = [...criteria];
    const nextCriterion = {
      id: editingId || `criterion-${Date.now()}`,
      eventId: 'default',
      name,
      description,
      maxMarks,
      weight,
    };

    if (editingId) {
      const index = nextCriteria.findIndex((c) => c.id === editingId);
      if (index >= 0) nextCriteria[index] = nextCriterion;
    } else {
      nextCriteria.push(nextCriterion);
    }

    const nextTotal = nextCriteria.reduce((sum, c) => sum + Number(c.weight || 0), 0);
    if (Math.abs(nextTotal - 100) > 0.01) {
      alert(`Total weight must equal 100%. Current total: ${nextTotal}.`);
      return;
    }

    if (onAddCriterion) onAddCriterion(nextCriteria);
    else onUpdateCriterion(nextCriterion);
    setDraft(EMPTY_CRITERION);
    setEditingId(null);
  }

  function startEdit(criterion) {
    setEditingId(criterion.id);
    setDraft({
      name: criterion.name,
      description: criterion.description,
      maxMarks: String(criterion.maxMarks),
      weight: String(criterion.weight),
    });
  }

  function deleteCriterionById(criterionId) {
    const nextCriteria = criteria.filter((c) => c.id !== criterionId);
    const nextTotal = nextCriteria.reduce((sum, c) => sum + Number(c.weight || 0), 0);
    if (nextCriteria.length > 0 && Math.abs(nextTotal - 100) > 0.01) {
      alert(`Total weight must equal 100%. Current total: ${nextTotal}.`);
      return;
    }
    if (onDeleteCriterion) onDeleteCriterion(criterionId);
    else onUpdateCriterion(nextCriteria);
  }

  return (
    <div className="evaluation-criteria-form">
      <div className="evaluation-criteria-form-grid">
        <div className="evaluation-criteria-form-row">
          <label className="event-field">
            <span>Criterion Name <b aria-hidden="true">*</b></span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => applyDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Innovation"
            />
          </label>
          <label className="event-field">
            <span>Description</span>
            <input
              type="text"
              value={draft.description}
              onChange={(e) => applyDraft({ ...draft, description: e.target.value })}
              placeholder="Brief description"
            />
          </label>
        </div>
        <div className="evaluation-criteria-form-row">
          <label className="event-field">
            <span>Maximum Marks <b aria-hidden="true">*</b></span>
            <input
              type="number"
              min="1"
              value={draft.maxMarks}
              onChange={(e) => applyDraft({ ...draft, maxMarks: e.target.value })}
            />
          </label>
          <label className="event-field">
            <span>Weight (%) <b aria-hidden="true">*</b></span>
            <input
              type="number"
              min="1"
              max="100"
              value={draft.weight}
              onChange={(e) => applyDraft({ ...draft, weight: e.target.value })}
            />
          </label>
        </div>
        <div className="evaluation-criteria-form-actions">
          <button type="button" className="judges-secondary-button" onClick={() => {
            setEditingId(null);
            setDraft(EMPTY_CRITERION);
          }}>
            Clear
          </button>
          <button type="button" className="judges-primary-button" onClick={saveCriterion}>
            {editingId ? 'Save Changes' : 'Add Criterion'}
          </button>
        </div>
      </div>
      <div className="evaluation-criteria-summary">
        <div className="evaluation-criteria-total">
          <span>Total Weight</span>
          <strong>{currentTotal}%</strong>
        </div>
        <div className={`evaluation-criteria-weight-state ${currentTotal === 100 ? 'valid' : 'invalid'}`}>
          {currentTotal === 100 ? 'Weight configuration is valid.' : 'Total weight must equal 100%.'}
        </div>
      </div>

      <div className="evaluation-criteria-list">
        {criteria.length === 0 ? (
          <p className="judges-empty-message">No criteria configured yet.</p>
        ) : (
          criteria.map((criterion) => (
            <article key={criterion.id} className="evaluation-criterion-item">
              <div className="evaluation-criterion-main">
                <strong>{criterion.name}</strong>
                {criterion.description && <p>{criterion.description}</p>}
                <div className="evaluation-criterion-meta">
                  <span>{criterion.maxMarks} marks</span>
                  <span>{criterion.weight}%</span>
                </div>
              </div>
              <div className="evaluation-criterion-actions">
                <button
                  type="button"
                  className="judges-view-button"
                  onClick={() => startEdit(criterion)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="judges-assign-button"
                  onClick={() => deleteCriterionById(criterion.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function OpenHolisticForm({ data = {}, onChange }) {
  return (
    <div className="evaluation-form-grid">
      <label className="event-field">
        <span>Minimum Score</span>
        <input
          type="number"
          min="0"
          value={data.scoreMin ?? ''}
          onChange={(e) => onChange('openHolistic.scoreMin', e.target.value)}
        />
      </label>
      <label className="event-field">
        <span>Maximum Score</span>
        <input
          type="number"
          min="1"
          value={data.scoreMax ?? ''}
          onChange={(e) => onChange('openHolistic.scoreMax', e.target.value)}
        />
      </label>
      <label className="event-field">
        <span>GitHub / Project Review</span>
        <input
          type="checkbox"
          checked={Boolean(data.githubReview)}
          onChange={(e) => onChange('openHolistic.githubReview', e.target.checked)}
        />
      </label>
      <label className="event-field">
        <span>Overall Feedback</span>
        <input
          type="checkbox"
          checked={Boolean(data.overallFeedback)}
          onChange={(e) => onChange('openHolistic.overallFeedback', e.target.checked)}
        />
      </label>
    </div>
  );
}

function RemoteAsyncForm({ materials = [], onChange, onAddMaterial, onDeleteMaterial }) {
  const [draft, setDraft] = useState(EMPTY_MATERIAL);

  function applyDraft(nextDraft) {
    setDraft(nextDraft);
  }

  function submitMaterial(event) {
    event.preventDefault();
    if (!draft.label.trim() || !draft.url.trim()) {
      alert('Please enter a label and URL.');
      return;
    }
    if (onAddMaterial) onAddMaterial([...materials, { label: draft.label.trim(), url: draft.url.trim() }]);
    else onChange('remoteAsync.materials', materials.concat({ label: draft.label.trim(), url: draft.url.trim() }));
    setDraft(EMPTY_MATERIAL);
  }

  return (
    <div className="evaluation-criteria-form">
      <div className="evaluation-criteria-form-row">
        <label className="event-field">
          <span>Material Label</span>
          <input
            type="text"
            value={draft.label}
            onChange={(e) => applyDraft({ ...draft, label: e.target.value })}
            placeholder="e.g. GitHub"
          />
        </label>
        <label className="event-field">
          <span>URL / Link</span>
          <input
            type="text"
            value={draft.url}
            onChange={(e) => applyDraft({ ...draft, url: e.target.value })}
            placeholder="https://..."
          />
        </label>
        <button type="button" className="judges-primary-button" onClick={submitMaterial}>
          Add Material
        </button>
      </div>
      <div className="evaluation-criteria-list">
        {materials.length === 0 ? (
          <p className="judges-empty-message">No materials configured. Add a GitHub link, demo video, documentation, or project description.</p>
        ) : (
          materials.map((material, index) => (
            <div key={index} className="evaluation-criterion-item">
              <div className="evaluation-criterion-main">
                <strong>{material.label || `Material ${index + 1}`}</strong>
                <a href={material.url} target="_blank" rel="noreferrer">{material.url}</a>
              </div>
              <div className="evaluation-criterion-actions">
                <button
                  type="button"
                  className="judges-assign-button"
                  onClick={() =>
                    onDeleteMaterial
                      ? onDeleteMaterial(index)
                      : onChange('remoteAsync.materials', materials.filter((_, i) => i !== index))
                  }
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LiveDemoForm({ data = {}, onChange, onAddCriterion, onUpdateCriterion, onDeleteCriterion, totalWeight: currentTotal }) {
  return (
    <div className="evaluation-form-grid">
      <label className="event-field">
        <span>Live Demo</span>
        <input
          type="checkbox"
          checked={Boolean(data.demoEvaluation)}
          onChange={(e) => onChange('liveDemo.demoEvaluation', e.target.checked)}
        />
      </label>
      <label className="event-field">
        <span>Presentation</span>
        <input
          type="checkbox"
          checked={Boolean(data.presentationEvaluation)}
          onChange={(e) => onChange('liveDemo.presentationEvaluation', e.target.checked)}
        />
      </label>
      <label className="event-field">
        <span>Judge Questions</span>
        <input
          type="checkbox"
          checked={Boolean(data.judgeQuestions)}
          onChange={(e) => onChange('liveDemo.judgeQuestions', e.target.checked)}
        />
      </label>
      <label className="event-field">
        <span>Overall Score / Feedback</span>
        <input
          type="checkbox"
          checked={Boolean(data.overallScoreFeedback)}
          onChange={(e) => onChange('liveDemo.overallScoreFeedback', e.target.checked)}
        />
      </label>
      <div className="evaluation-criteria-form" style={{ marginTop: '24px' }}>
        <CriteriaForm
          criteria={data.criteria || []}
          onAddCriterion={onAddCriterion}
          onUpdateCriterion={onUpdateCriterion}
          onDeleteCriterion={onDeleteCriterion}
          totalWeight={currentTotal}
        />
      </div>
    </div>
  );
}

function RankingForm({ data = {}, onChange }) {
  return (
    <div className="evaluation-form-grid">
      <label className="event-field">
        <span>Enable Ranking</span>
        <input
          type="checkbox"
          checked={Boolean(data.ranking)}
          onChange={(e) => onChange('rankingVoting.ranking', e.target.checked)}
        />
      </label>
      <label className="event-field">
        <span>Allow Judge Comments</span>
        <input
          type="checkbox"
          checked={Boolean(data.comments)}
          onChange={(e) => onChange('rankingVoting.comments', e.target.checked)}
        />
      </label>
      <label className="event-field">
        <span>Rank Calculation</span>
        <select
          value={data.rankCalculation || 'total'}
          onChange={(e) => onChange('rankingVoting.rankCalculation', e.target.value)}
        >
          <option value="total">Total</option>
          <option value="average">Average</option>
          <option value="points">Points</option>
          <option value="composite">Composite</option>
        </select>
      </label>
    </div>
  );
}

function CustomForm({ fields = [], onChange, onAddField, onDeleteField }) {
  const [draft, setDraft] = useState(EMPTY_CUSTOM_FIELD);

  function applyDraft(nextDraft) {
    setDraft(nextDraft);
  }

  function submitField(event) {
    event.preventDefault();
    if (!draft.label.trim()) {
      alert('Please enter a label for the custom field.');
      return;
    }
    if (onAddField) onAddField([...fields, { type: draft.type, label: draft.label.trim(), required: draft.required }]);
    else onChange('custom.fields', fields.concat({ type: draft.type, label: draft.label.trim(), required: draft.required }));
    setDraft(EMPTY_CUSTOM_FIELD);
  }

  return (
    <div className="evaluation-criteria-form">
      <div className="evaluation-criteria-form-row">
        <label className="event-field">
          <span>Field Type</span>
          <select
            value={draft.type}
            onChange={(e) => applyDraft({ ...draft, type: e.target.value })}
          >
            <option value="criteria">Criteria</option>
            <option value="marks">Marks</option>
            <option value="weight">Weight</option>
            <option value="question">Question</option>
            <option value="material">Material Link</option>
            <option value="feedback">Feedback</option>
          </select>
        </label>
        <label className="event-field">
          <span>Label</span>
          <input
            type="text"
            value={draft.label}
            onChange={(e) => applyDraft({ ...draft, label: e.target.value })}
            placeholder="e.g. Technical Depth"
          />
        </label>
        <label className="event-field">
          <span>Required</span>
          <input
            type="checkbox"
            checked={draft.required}
            onChange={(e) => applyDraft({ ...draft, required: e.target.checked })}
          />
        </label>
        <button type="button" className="judges-primary-button" onClick={submitField}>
          Add Field
        </button>
      </div>
      <div className="evaluation-criteria-list">
        {fields.length === 0 ? (
          <p className="judges-empty-message">No custom fields configured yet.</p>
        ) : (
          fields.map((field, index) => (
            <div key={index} className="evaluation-criterion-item">
              <div className="evaluation-criterion-main">
                <strong>{field.label || `Field ${index + 1}`}</strong>
                <span className="evaluation-criterion-meta">{field.type}</span>
              </div>
              <div className="evaluation-criterion-actions">
                <button
                  type="button"
                  className="judges-assign-button"
                  onClick={() =>
                    onDeleteField
                      ? onDeleteField(index)
                      : onChange('custom.fields', fields.filter((_, i) => i !== index))
                  }
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function addCriterion(criteria) {
  setModelConfig((current) => ({ ...current, criteriaBased: { criteria } }));
}

function updateCriterion(criterion) {
  setModelConfig((current) => ({
    ...current,
    criteriaBased: {
      criteria: current.criteriaBased?.criteria
        ? current.criteriaBased.criteria.map((c) => (c.id === criterion.id ? criterion : c))
        : [criterion],
    },
  }));
}

function deleteCriterion(criterionId) {
  setModelConfig((current) => ({
    ...current,
    criteriaBased: {
      criteria: current.criteriaBased?.criteria
        ? current.criteriaBased.criteria.filter((c) => c.id !== criterionId)
        : [],
    },
  }));
}

function addMaterial(materials) {
  setModelConfig((current) => ({ ...current, remoteAsync: { materials } }));
}

function deleteMaterial(index) {
  setModelConfig((current) => ({
    ...current,
    remoteAsync: {
      materials: current.remoteAsync?.materials
        ? current.remoteAsync.materials.filter((_, i) => i !== index)
        : [],
    },
  }));
}

function addCustomField(fields) {
  setModelConfig((current) => ({ ...current, custom: { fields } }));
}

function deleteCustomField(index) {
  setModelConfig((current) => ({
    ...current,
    custom: {
      fields: current.custom?.fields
        ? current.custom.fields.filter((_, i) => i !== index)
        : [],
    },
  }));
}

function mergeModelConfig(model, data) {
  if (!data) return {};
  const merged = {};
  if (model === 'criteria-based') {
    merged.criteriaBased = data.criteriaBased || { criteria: [] };
  } else if (model === 'open-holistic') {
    merged.openHolistic = data.openHolistic || {};
  } else if (model === 'remote-async') {
    merged.remoteAsync = data.remoteAsync || { materials: [] };
  } else if (model === 'live-demo') {
    merged.liveDemo = data.liveDemo || {
      demoEvaluation: true,
      presentationEvaluation: true,
      judgeQuestions: true,
      overallScoreFeedback: true,
      criteria: [],
    };
  } else if (model === 'ranking-voting') {
    merged.rankingVoting = data.rankingVoting || { ranking: true, comments: true, rankCalculation: 'total' };
  } else if (model === 'custom') {
    merged.custom = data.custom || { fields: [] };
  }
  return merged;
}

function EvaluationConfiguration() {
  const { eventId = 'default' } = useParams();
  return <EvaluationConfigurationPage key={eventId} eventId={eventId} />;
}

function EvaluationConfigurationPage({ eventId }) {
  const [configError, setConfigError] = useState('');
  const [loading, setLoading] = useState(true);

  const [selectedModel, setSelectedModel] = useState(MODELS[0]);

  const [saved, setSaved] = useState(false);

  const [modelConfig, setModelConfig] = useState({});

  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      try {
        const response = await API.get(
          `/events/${encodeURIComponent(eventId)}/evaluation-config`,
        );
        if (cancelled) return;
        if (response.data.success) {
          const savedConfig = response.data.data;
          if (savedConfig?.model) {
            setSelectedModel(savedConfig.model);
            setModelConfig(mergeModelConfig(savedConfig.model, savedConfig));
          } else {
            setSelectedModel(MODELS[0]);
            setModelConfig({});
          }
        } else {
          setConfigError(response.data.error || 'Failed to load evaluation configuration.');
        }
      } catch {
        if (!cancelled) setConfigError('Unable to reach the evaluation API. Check the server and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadConfig();
    return () => { cancelled = true; };
  }, [eventId]);

  function updateModelField(field, value) {
    setModelConfig((current) => ({ ...current, [field]: value }));
  }

  async function handleSave() {
    const payload = {
      model: selectedModel,
      ...modelConfig,
    };

    try {
      const response = await API.put(
        `/events/${encodeURIComponent(eventId)}/evaluation-config`,
        payload,
      );
      if (response.data.success) {
        setSaved(true);
      } else {
        alert(response.data.error || 'Failed to save the evaluation configuration.');
      }
    } catch {
      alert('Unable to save the evaluation configuration. Check the server and try again.');
    }
  }

  function handleCancel() {
    setSaved(false);
    setConfigError('');
  }

  if (loading) {
    return (
      <OrganizerLayout
        activeKey="criteria"
        eventId={eventId}
        wrapperClassName="evaluation-criteria"
        contentClassName="evaluation-criteria"
        userName="Admin"
        userRole="Organizer"
        userInitial="A"
      >
        <div className="evaluation-criteria-main">
          <div className="evaluation-center-spinner">Analyzing configuration...</div>
        </div>
      </OrganizerLayout>
    );
  }

  return (
    <OrganizerLayout
      activeKey="criteria"
      eventId={eventId}
      wrapperClassName="evaluation-criteria"
      contentClassName="evaluation-criteria"
      userName="Admin"
      userRole="Organizer"
      userInitial="A"
    >
      <div className="evaluation-criteria-main">
        <div className="evaluation-criteria-header">
          <Link className="event-back-link" to={`/organizer/events/${eventId}`}>
            &larr; Back to Event
          </Link>
          <div>
            <h1>Configure Evaluation</h1>
            <p>Select a model and configure the evaluation for this event.</p>
          </div>
        </div>

        <section className="evaluation-criteria-card evaluation-model-picker">
          <div className="evaluation-model-grid">
            {MODEL_META.map((model) => (
              <button
                key={model.id}
                type="button"
                className={`evaluation-model-card ${selectedModel === model.id ? 'evaluation-model-card-active' : ''}`}
                onClick={() => setSelectedModel(model.id)}
              >
                <span className="evaluation-model-card-icon" aria-hidden="true">
                  {model.id === 'criteria-based' && '&#9881;'}
                  {model.id === 'open-holistic' && '&#9780;'}
                  {model.id === 'remote-async' && '&#x1F50D;'}
                  {model.id === 'live-demo' && '&#x1F3A8;'}
                  {model.id === 'ranking-voting' && '&#x1F465;'}
                  {model.id === 'custom' && '&#x1F4DD;'}
                </span>
                <span className="evaluation-model-card-label">{model.label}</span>
                <span className="evaluation-model-card-desc">{model.description}</span>
              </button>
            ))}
          </div>
        </section>

        {configError && (
          <p className="evaluation-feedback evaluation-feedback-error" role="alert">{configError}</p>
        )}


        {selectedModel && (
          <section className="evaluation-criteria-card">
            <h2 className="evaluation-section-title">{MODEL_META.find((m) => m.id === selectedModel)?.label}</h2>
            <div className="evaluation-section-body">
              {selectedModel === 'criteria-based' && (
                <CriteriaForm
                  criteria={modelConfig.criteriaBased?.criteria || []}
                  onAddCriterion={addCriterion}
                  onUpdateCriterion={updateCriterion}
                  onDeleteCriterion={deleteCriterion}
                  totalWeight={totalWeight}
                />
              )}
              {selectedModel === 'open-holistic' && (
                <OpenHolisticForm
                  data={modelConfig.openHolistic}
                  onChange={updateModelField}
                />
              )}
              {selectedModel === 'remote-async' && (
                <RemoteAsyncForm
                  materials={modelConfig.remoteAsync?.materials || []}
                  onChange={updateModelField}
                  onAddMaterial={addMaterial}
                  onDeleteMaterial={deleteMaterial}
                />
              )}
              {selectedModel === 'live-demo' && (
                <LiveDemoForm
                  data={modelConfig.liveDemo}
                  onChange={updateModelField}
                  onAddCriterion={addCriterion}
                  onUpdateCriterion={updateCriterion}
                  onDeleteCriterion={deleteCriterion}
                  totalWeight={totalWeight}
                />
              )}
              {selectedModel === 'ranking-voting' && (
                <RankingForm
                  data={modelConfig.rankingVoting}
                  onChange={updateModelField}
                />
              )}
              {selectedModel === 'custom' && (
                <CustomForm
                  fields={modelConfig.custom?.fields || []}
                  onChange={updateModelField}
                  onAddField={addCustomField}
                  onDeleteField={deleteCustomField}
                />
              )}
            </div>
          </section>
        )}

        <div className="evaluation-criteria-actions">
          <button
            type="button"
            className="judges-secondary-button"
            onClick={handleCancel}
            disabled={saved}
          >
            Cancel
          </button>
          <button
            type="button"
            className="judges-primary-button"
            onClick={handleSave}
            disabled={saved}
          >
            {saved ? 'Saved & Returning to Event' : 'Save Evaluation'}
          </button>
        </div>
      </div>
    </OrganizerLayout>
  );
}

export default EvaluationConfiguration;


