import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import OrganizerLayout from './OrganizerLayout';
import { readSavedCriteria, saveCriteria } from '../data/evaluationStorage';
import './OrganizerDashboard.css';
import './OrganizerJudges.css';
import './EvaluationCriteria.css';

const emptyDraft = {
  name: '',
  description: '',
  maxMarks: '25',
  weight: '25',
};

function EvaluationCriteria() {
  const { eventId = 'default' } = useParams();
  const initialData = useMemo(() => readSavedCriteria(eventId), [eventId]);
  const [criteria, setCriteria] = useState(initialData.criteria);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(initialData.error);

  const totalWeight = criteria.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0);

  function applyDraft(nextDraft) {
    setDraft(nextDraft);
    setError('');
  }

  function saveCriterion(event) {
    event.preventDefault();
    const name = draft.name.trim();
    const description = draft.description.trim();
    const maxMarks = Number(draft.maxMarks);
    const weight = Number(draft.weight);

    if (!name) {
      setError('Criterion name is required.');
      return;
    }
    if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
      setError('Maximum marks must be greater than zero.');
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      setError('Weight must be greater than zero.');
      return;
    }

    const nextCriteria = [...criteria];
    const nextCriterion = {
      id: editingId || `criterion-${Date.now()}`,
      eventId,
      name,
      description,
      maxMarks,
      weight,
    };

    if (editingId) {
      const index = nextCriteria.findIndex((criterion) => criterion.id === editingId);
      if (index >= 0) nextCriteria[index] = nextCriterion;
    } else {
      nextCriteria.push(nextCriterion);
    }

    const nextTotalWeight = nextCriteria.reduce((total, criterion) => total + Number(criterion.weight || 0), 0);
    if (Math.abs(nextTotalWeight - 100) > 0.0001) {
      setError('Total weight must equal 100%.');
      return;
    }

    const saved = saveCriteria(eventId, nextCriteria);
    setCriteria(saved);
    setDraft(emptyDraft);
    setEditingId(null);
    setError('');
  }

  function startEdit(criterion) {
    setEditingId(criterion.id);
    setDraft({
      name: criterion.name,
      description: criterion.description,
      maxMarks: String(criterion.maxMarks),
      weight: String(criterion.weight),
    });
    setError('');
  }

  function deleteCriterion(criterionId) {
    const nextCriteria = criteria.filter((criterion) => criterion.id !== criterionId);
    const nextTotalWeight = nextCriteria.reduce((total, criterion) => total + Number(criterion.weight || 0), 0);
    if (nextCriteria.length > 0 && Math.abs(nextTotalWeight - 100) > 0.0001) {
      setError('Total weight must equal 100%.');
      return;
    }
    const saved = saveCriteria(eventId, nextCriteria);
    setCriteria(saved);
    setError('');
    if (editingId === criterionId) {
      setEditingId(null);
      setDraft(emptyDraft);
    }
  }

  return (
    <OrganizerLayout
      activeKey="criteria"
      eventId={eventId}
      searchPlaceholder="Search criteria"
      searchAriaLabel="Search criteria"
      userName="Admin"
      userRole="Organizer"
      userInitial="A"
    >
      <div className="criteria-content">
          <div className="criteria-header-row">
            <div>
              <p className="judges-context">Event configuration</p>
              <h1>Evaluation Criteria</h1>
            </div>
          </div>

          {error && <p className="judges-alert" role="alert">{error}</p>}

          <section className="criteria-grid">
            <div className="criteria-card criteria-form-card">
              <h2>{editingId ? 'Edit Criterion' : 'Add Criterion'}</h2>
              <form onSubmit={saveCriterion} className="criteria-form">
                <label className="event-field">
                  <span>Criterion Name</span>
                  <input value={draft.name} onChange={(event) => applyDraft({ ...draft, name: event.target.value })} />
                </label>
                <label className="event-field">
                  <span>Description</span>
                  <textarea rows="3" value={draft.description} onChange={(event) => applyDraft({ ...draft, description: event.target.value })} />
                </label>
                <div className="criteria-field-row">
                  <label className="event-field">
                    <span>Max Marks</span>
                    <input type="number" min="1" value={draft.maxMarks} onChange={(event) => applyDraft({ ...draft, maxMarks: event.target.value })} />
                  </label>
                  <label className="event-field">
                    <span>Weight (%)</span>
                    <input type="number" min="1" max="100" value={draft.weight} onChange={(event) => applyDraft({ ...draft, weight: event.target.value })} />
                  </label>
                </div>
                <div className="criteria-form-actions">
                  <button type="button" className="judges-secondary-button" onClick={() => { setEditingId(null); setDraft(emptyDraft); setError(''); }}>Clear</button>
                  <button type="submit" className="judges-primary-button">{editingId ? 'Save Changes' : 'Add Criterion'}</button>
                </div>
              </form>
            </div>

            <div className="criteria-card criteria-summary-card">
              <h2>Configuration</h2>
              <div className="criteria-total-row">
                <span>Total Weight</span>
                <strong>{totalWeight}%</strong>
              </div>
              <div className={`criteria-total-state ${totalWeight === 100 ? 'valid' : 'invalid'}`}>
                {totalWeight === 100 ? 'Weight configuration is valid.' : 'Total weight must equal 100%.'}
              </div>
              <ul className="criteria-summary-list">
                {criteria.length === 0 ? <li>No criteria configured yet.</li> : criteria.map((criterion) => (
                  <li key={criterion.id}>
                    <div>
                      <strong>{criterion.name}</strong>
                      <small>{criterion.maxMarks} marks · {criterion.weight}%</small>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="criteria-card">
            <h2>Configured Criteria</h2>
            {criteria.length === 0 ? (
              <p className="judges-empty-message">No evaluation criteria have been added for this event.</p>
            ) : (
              <div className="criteria-list">
                {criteria.map((criterion) => (
                  <article key={criterion.id} className="criterion-item">
                    <div className="criterion-main">
                      <div>
                        <strong>{criterion.name}</strong>
                        {criterion.description && <p>{criterion.description}</p>}
                      </div>
                      <div className="criterion-meta">
                        <span>{criterion.maxMarks} marks</span>
                        <span>{criterion.weight}%</span>
                      </div>
                    </div>
                    <div className="criterion-actions">
                      <button type="button" className="judges-view-button" onClick={() => startEdit(criterion)}>Edit</button>
                      <button type="button" className="judges-assign-button" onClick={() => deleteCriterion(criterion.id)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
      </div>
    </OrganizerLayout>
  );
}

export default EvaluationCriteria;
