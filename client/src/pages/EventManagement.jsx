import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import OrganizerLayout from './OrganizerLayout';
import './OrganizerDashboard.css';
import './EventManagement.css';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

const eventTypes = [
  'Hackathon',
  'Mini Project Exhibition',
  'Project Competition',
  'Other',
];

const emptyEvent = {
  name: '',
  type: '',
  date: '',
  venue: '',
  description: '',
};

function toFormValues(event) {
  if (!event || typeof event !== 'object') return { ...emptyEvent };
  const rawDate = typeof event.date === 'string' ? event.date : '';
  return {
    name: typeof event.name === 'string' ? event.name : '',
    type: typeof event.type === 'string' ? event.type : '',
    date: rawDate.slice(0, 10),
    venue: typeof event.venue === 'string' ? event.venue : '',
    description: typeof event.description === 'string' ? event.description : '',
  };
}

function getApiErrorMessage(error, fallback) {
  const data = error && error.response && error.response.data;
  if (data && typeof data.error === 'string' && data.error.trim()) {
    return data.error;
  }
  return fallback;
}

function EventManagement() {
  const { eventId: urlEventId } = useParams();
  const navigate = useNavigate();

  const [eventData, setEventData] = useState(emptyEvent);
  const [savedEvent, setSavedEvent] = useState(null);
  const [isEditing, setIsEditing] = useState(true);
  const [errors, setErrors] = useState({});
  const [storageError, setStorageError] = useState('');
  const [saveConfirmation, setSaveConfirmation] = useState('');
  const [isLoading, setIsLoading] = useState(Boolean(urlEventId));
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [evaluationConfig, setEvaluationConfig] = useState(null);
  const [evaluationLoading, setEvaluationLoading] = useState(true);
  const [hasEvaluationConfig, setHasEvaluationConfig] = useState(false);
  const [teamCount, setTeamCount] = useState(null);
  const [judgeCount, setJudgeCount] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEvent() {
      if (!urlEventId) {
        setSavedEvent(null);
        setEventData({ ...emptyEvent });
        setIsEditing(true);
        setStorageError('');
        return;
      }
      setIsLoading(true);
      setStorageError('');
      try {
        const response = await API.get('/events/' + encodeURIComponent(urlEventId));
        if (cancelled) return;
        if (response.data.success && response.data.data) {
          const event = response.data.data;
          setSavedEvent(event);
          setEventData(toFormValues(event));
          setIsEditing(false);
        }
      } catch (error) {
        if (cancelled) return;
        if (error && error.response && error.response.status === 404) {
          setSavedEvent(null);
          setEventData({ ...emptyEvent });
          setIsEditing(true);
          setStorageError('Event not found. Create a new event below.');
        } else {
          setStorageError(getApiErrorMessage(error, 'Unable to load the event. Try again.'));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadEvent();
    return () => {
      cancelled = true;
    };
  }, [urlEventId]);

  useEffect(() => {
    let cancelled = false;

    async function loadEvaluationConfig() {
      const eventId = (savedEvent && (savedEvent.eventId || savedEvent._id)) || null;
      if (!eventId) {
        setEvaluationLoading(false);
        return;
      }
      setEvaluationLoading(true);
      try {
        const response = await API.get('/events/' + encodeURIComponent(String(eventId)) + '/evaluation-config');
        if (cancelled) return;
        if (response.data.success) {
          setEvaluationConfig(response.data.data);
          setHasEvaluationConfig(Boolean(response.data.data));
        }
      } catch {
        if (cancelled) return;
      } finally {
        if (!cancelled) setEvaluationLoading(false);
      }
    }

    loadEvaluationConfig();
    return () => {
      cancelled = true;
    };
  }, [savedEvent]);

  useEffect(() => {
    let cancelled = false;
    const eventId = (savedEvent && (savedEvent.eventId || savedEvent._id)) || null;
    if (!eventId) return () => { cancelled = true; };
    async function loadWorkspaceCounts() {
      const [teamsResult, judgesResult] = await Promise.allSettled([
        API.get(`/events/${encodeURIComponent(String(eventId))}/teams`),
        API.get(`/events/${encodeURIComponent(String(eventId))}/judges`),
      ]);
      if (cancelled) return;
      if (teamsResult.status === 'fulfilled') setTeamCount(Array.isArray(teamsResult.value.data?.data) ? teamsResult.value.data.data.length : 0);
      if (judgesResult.status === 'fulfilled') setJudgeCount(Array.isArray(judgesResult.value.data?.data) ? judgesResult.value.data.data.length : 0);
    }
    loadWorkspaceCounts();
    return () => { cancelled = true; };
  }, [savedEvent]);

  function updateField(field, value) {
    setEventData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setStorageError('');
    setSaveConfirmation('');
  }

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
    const normalizedEvent = Object.fromEntries(
      Object.entries(eventData).map(([field, value]) => [field, String(value == null ? '' : value).trim()]),
    );
    const nextErrors = {};

    if (!normalizedEvent.name) nextErrors.name = 'Enter an event name.';
    if (!eventTypes.includes(normalizedEvent.type)) nextErrors.type = 'Choose an event type.';
    if (!normalizedEvent.date) nextErrors.date = 'Choose an event date.';
    if (!normalizedEvent.venue) nextErrors.venue = 'Enter a venue.';
    if (!normalizedEvent.description) nextErrors.description = 'Enter an event description.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const existingId = (savedEvent && (savedEvent.eventId || savedEvent._id)) || urlEventId;
    const isUpdate = Boolean(existingId && savedEvent);

    setIsSaving(true);
    setStorageError('');
    setSaveConfirmation('');
    try {
      const response = isUpdate
        ? await API.put('/events/' + encodeURIComponent(String(existingId)), normalizedEvent)
        : await API.post('/events', normalizedEvent);
      const event = response.data.data;
      setSavedEvent(event);
      setEventData(toFormValues(event));
      setIsEditing(false);
      setErrors({});
      setSaveConfirmation(isUpdate ? 'Event updated successfully.' : 'Event saved successfully.');
      const returnedId = String((event && (event.eventId || event._id)) || '');
      if (returnedId && returnedId !== urlEventId) {
        navigate('/organizer/events/' + returnedId, { replace: true });
      }
    } catch (error) {
      const details = error && error.response && error.response.data && error.response.data.details;
      if (details && typeof details === 'object') {
        setErrors(details);
      }
      setStorageError(getApiErrorMessage(error, 'Unable to save the event. Try again.'));
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing() {
    setEventData(toFormValues(savedEvent));
    setErrors({});
    setStorageError('');
    setSaveConfirmation('');
    setIsEditing(true);
  }

  async function deleteSavedEvent() {
    const eventId = savedEvent && (savedEvent.eventId || savedEvent._id);
    if (!eventId) {
      setDeleteError('Unable to identify this event. Reload the page and try again.');
      return;
    }

    setIsDeleting(true);
    setDeleteError('');
    try {
      await API.delete('/events/' + encodeURIComponent(String(eventId)));
      navigate('/organizer/dashboard', { replace: true });
    } catch (error) {
      setDeleteError(getApiErrorMessage(error, 'Unable to delete the event. Check the server connection and try again.'));
    } finally {
      setIsDeleting(false);
    }
  }

  function openEvaluationConfig() {
    const currentEventId = (savedEvent && (savedEvent.eventId || savedEvent._id)) || urlEventId || 'default';
    navigate('/organizer/events/' + currentEventId + '/evaluation');
  }

  const isConfigured = hasEvaluationConfig;

  return (
    <OrganizerLayout
      activeKey='events'
      wrapperClassName='event-management'
      contentClassName='event-content'
    >
      <div className='event-page-heading'>
        <div>
          <Link className='event-back-link' to='/organizer/dashboard'>
            &larr; Dashboard
          </Link>
          <h1>Event Management</h1>
          <p>Set up the basic information for your event.</p>
        </div>
        <div className='event-heading-actions'>
          {savedEvent && !isEditing && !evaluationLoading && (
            <>
              {isConfigured && (
                <span className='event-configured-badge'>Evaluation Configured</span>
              )}
              <button
                className='event-primary-button'
                type='button'
                onClick={openEvaluationConfig}
              >
                Configure Evaluation
              </button>
            </>
          )}
          {savedEvent && !isEditing && !evaluationLoading && (
            <button className='event-primary-button' type='button' onClick={startEditing}>
              Edit Event
            </button>
          )}
          {savedEvent && !isEditing && (
            <button
              className='event-danger-button'
              type='button'
              onClick={() => {
                setDeleteError('');
                setShowDeleteConfirmation(true);
              }}
            >
              Delete Event
            </button>
          )}
        </div>
      </div>

      <section className='event-information-card' aria-labelledby='event-information-title'>
        <div className='event-information-heading'>
          <div className='event-heading-icon' aria-hidden='true'>&#9881;</div>
          <div>
            <h2 id='event-information-title'>Basic Information</h2>
            <p>Provide the essential details participants need to know.</p>
          </div>
        </div>

        {storageError && (
          <p className='event-feedback event-feedback-error' role='alert'>{storageError}</p>
        )}
        {saveConfirmation && (
          <p className='event-feedback event-feedback-success' role='status'>{saveConfirmation}</p>
        )}        {isLoading ? (
          <p className='event-loading'>Loading event...</p>
        ) : savedEvent && !isEditing ? (
          <dl className='saved-event-details'>
            <div>
              <dt>Event Name</dt>
              <dd>{savedEvent.name}</dd>
            </div>
            <div>
              <dt>Event Type</dt>
              <dd>{savedEvent.type}</dd>
            </div>
            <div>
              <dt>Event Date</dt>
              <dd>
                <time dateTime={savedEvent.date}>{savedEvent.date}</time>
              </dd>
            </div>
            <div>
              <dt>Venue</dt>
              <dd>{savedEvent.venue}</dd>
            </div>
            <div className='saved-event-description'>
              <dt>Description</dt>
              <dd>{savedEvent.description}</dd>
            </div>
          </dl>
        ) : (
          <form className='event-form' onSubmit={handleSubmit} noValidate>
            <div className='event-form-grid'>
              <label className='event-field'>
                <span>Event Name <b aria-hidden='true'>*</b></span>
                <input
                  required
                  autoComplete='off'
                  value={eventData.name}
                  onChange={(changeEvent) => updateField('name', changeEvent.target.value)}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'event-name-error' : undefined}
                />
                {errors.name && (
                  <small id='event-name-error' className='event-field-error'>{errors.name}</small>
                )}
              </label>

              <label className='event-field'>
                <span>Event Type <b aria-hidden='true'>*</b></span>
                <select
                  required
                  value={eventData.type}
                  onChange={(changeEvent) => updateField('type', changeEvent.target.value)}
                  aria-invalid={Boolean(errors.type)}
                  aria-describedby={errors.type ? 'event-type-error' : undefined}
                >
                  <option value=''>Select event type</option>
                  {eventTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                {errors.type && (
                  <small id='event-type-error' className='event-field-error'>{errors.type}</small>
                )}
              </label>

              <label className='event-field'>
                <span>Event Date <b aria-hidden='true'>*</b></span>
                <input
                  required
                  type='date'
                  value={eventData.date}
                  onChange={(changeEvent) => updateField('date', changeEvent.target.value)}
                  aria-invalid={Boolean(errors.date)}
                  aria-describedby={errors.date ? 'event-date-error' : undefined}
                />
                {errors.date && (
                  <small id='event-date-error' className='event-field-error'>{errors.date}</small>
                )}
              </label>

              <label className='event-field'>
                <span>Venue <b aria-hidden='true'>*</b></span>
                <input
                  required
                  autoComplete='off'
                  value={eventData.venue}
                  onChange={(changeEvent) => updateField('venue', changeEvent.target.value)}
                  aria-invalid={Boolean(errors.venue)}
                  aria-describedby={errors.venue ? 'event-venue-error' : undefined}
                />
                {errors.venue && (
                  <small id='event-venue-error' className='event-field-error'>{errors.venue}</small>
                )}
              </label>

              <label className='event-field event-description-field'>
                <span>Event Description <b aria-hidden='true'>*</b></span>
                <textarea
                  required
                  value={eventData.description}
                  onChange={(changeEvent) => updateField('description', changeEvent.target.value)}
                  aria-invalid={Boolean(errors.description)}
                  aria-describedby={errors.description ? 'event-description-error' : undefined}
                />
                {errors.description && (
                  <small id='event-description-error' className='event-field-error'>{errors.description}</small>
                )}
              </label>
            </div>
            <div className='event-form-footer'>
              <p><b aria-hidden='true'>*</b> Required fields</p>
              <button className='event-primary-button' type='submit' disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Event'}
              </button>
            </div>
          </form>
        )}
      </section>

      {savedEvent && !isEditing && (
        <section className="event-workspace-grid" aria-label="Event workspace">
          <article className="event-workspace-card">
            <div><span className="event-workspace-icon" aria-hidden="true">T</span><h2>Teams</h2></div>
            <p>{teamCount == null ? 'Loading teams…' : `${teamCount} ${teamCount === 1 ? 'team' : 'teams'} in this event`}</p>
            <Link className="event-primary-button" to={`/organizer/events/${savedEvent.eventId || savedEvent._id}/teams`}>Manage Teams</Link>
          </article>
          <article className="event-workspace-card">
            <div><span className="event-workspace-icon" aria-hidden="true">J</span><h2>Judges</h2></div>
            <p>{judgeCount == null ? 'Loading judges…' : `${judgeCount} ${judgeCount === 1 ? 'judge' : 'judges'} in this event`}</p>
            <Link className="event-primary-button" to={`/organizer/events/${savedEvent.eventId || savedEvent._id}/judges`}>Manage Judges</Link>
          </article>
          <article className="event-workspace-card">
            <div><span className="event-workspace-icon" aria-hidden="true">E</span><h2>Evaluation</h2></div>
            <p>{evaluationLoading ? 'Checking configuration…' : hasEvaluationConfig ? `Configured · ${evaluationConfig?.model || 'Evaluation type selected'}` : 'Not configured'}</p>
            <button className="event-primary-button" type="button" onClick={openEvaluationConfig}>{hasEvaluationConfig ? 'Edit Evaluation' : 'Configure Evaluation'}</button>
          </article>
        </section>
      )}

      {showDeleteConfirmation && (
        <div
          className='event-modal-backdrop'
          role='presentation'
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isDeleting) setShowDeleteConfirmation(false);
          }}
        >
          <section
            className='event-delete-modal'
            role='alertdialog'
            aria-modal='true'
            aria-labelledby='delete-event-title'
            aria-describedby='delete-event-description'
          >
            <h2 id='delete-event-title'>Delete Event?</h2>
            <p id='delete-event-description'>This will permanently delete the event and its associated teams, judges, assignments, evaluation configuration, and evaluations.</p>
            {deleteError && <p className='event-feedback event-feedback-error' role='alert'>{deleteError}</p>}
            <div className='event-delete-actions'>
              <button
                className='event-secondary-button'
                type='button'
                onClick={() => setShowDeleteConfirmation(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className='event-danger-button'
                type='button'
                onClick={deleteSavedEvent}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Delete Event'}
              </button>
            </div>
          </section>
        </div>
      )}
    </OrganizerLayout>
  );
}

export default EventManagement;
