import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import OrganizerLayout from './OrganizerLayout';
import './OrganizerDashboard.css';
import './EventManagement.css';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

const STORAGE_KEY = 'scoreflow.organizer.event';
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

function isStoredEvent(value) {
  return value && typeof value === 'object' &&
    ['name', 'type', 'date', 'venue', 'description'].every(
      (field) => typeof value[field] === 'string',
    ) &&
    eventTypes.includes(value.type);
}

function EventManagement() {
  const { eventId: urlEventId } = useParams();
  const navigate = useNavigate();

  const [initialStorage, setInitialStorage] = useState(() => {
    try {
      const storedValue = window.localStorage.getItem(STORAGE_KEY);
      if (storedValue === null) {
        return { event: null, error: '' };
      }
      const parsedValue = JSON.parse(storedValue);
      if (!isStoredEvent(parsedValue)) {
        throw new Error('The saved event data is invalid.');
      }
      return { event: parsedValue, error: '' };
    } catch {
      return {
        event: null,
        error: 'Unable to load the saved event. Check browser storage and try again.',
      };
    }
  });

  const [eventData, setEventData] = useState(initialStorage.event || emptyEvent);
  const [savedEvent, setSavedEvent] = useState(initialStorage.event);
  const [isEditing, setIsEditing] = useState(!initialStorage.event);
  const [errors, setErrors] = useState({});
  const [storageError, setStorageError] = useState(initialStorage.error);
  const [saveConfirmation, setSaveConfirmation] = useState('');
  const [evaluationConfig, setEvaluationConfig] = useState(null);
  const [evaluationLoading, setEvaluationLoading] = useState(true);
  const [hasEvaluationConfig, setHasEvaluationConfig] = useState(false);

  useEffect(() => {
    async function loadEvaluationConfig() {
      if (!initialStorage.event) {
        setEvaluationLoading(false);
        return;
      }
      try {
        const response = await API.get(
          `/events/${encodeURIComponent(initialStorage.event.name)}/evaluation`,
        );
        if (response.data.success) {
          setEvaluationConfig(response.data.data);
          setHasEvaluationConfig(!!response.data.data);
        }
      } catch {
        // Config may not exist yet; that is OK.
      } finally {
        setEvaluationLoading(false);
      }
    }

    loadEvaluationConfig();
  }, [initialStorage.event]);

  function updateField(field, value) {
    setEventData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setStorageError('');
    setSaveConfirmation('');
  }

  function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
    const normalizedEvent = Object.fromEntries(
      Object.entries(eventData).map(([field, value]) => [field, value.trim()]),
    );
    const nextErrors = {};

    if (!normalizedEvent.name) nextErrors.name = 'Enter an event name.';
    if (!eventTypes.includes(normalizedEvent.type)) nextErrors.type = 'Choose an event type.';
    if (!normalizedEvent.date) nextErrors.date = 'Choose an event date.';
    if (!normalizedEvent.venue) nextErrors.venue = 'Enter a venue.';
    if (!normalizedEvent.description) nextErrors.description = 'Enter an event description.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedEvent));
      setEventData(normalizedEvent);
      setSavedEvent(normalizedEvent);
      setIsEditing(false);
      setStorageError('');
      setSaveConfirmation('Event saved successfully.');
    } catch {
      setStorageError('Unable to save the event. Check browser storage and try again.');
    }
  }

  function startEditing() {
    setEventData(savedEvent || emptyEvent);
    setErrors({});
    setStorageError('');
    setSaveConfirmation('');
    setIsEditing(true);
  }

  function openEvaluationConfig() {
    const currentEventName = eventData.name || savedEvent?.name || urlEventId || 'default';
    navigate(`/organizer/events/${currentEventName}/evaluation`);
  }

  const eventId = eventData.name || savedEvent?.name || urlEventId || 'default';
  const isConfigured = hasEvaluationConfig;

  return (
    <OrganizerLayout
      activeKey="events"
      wrapperClassName="event-management"
      contentClassName="event-content"
    >
      <div className="event-page-heading">
        <div>
          <Link className="event-back-link" to="/organizer/dashboard">
            &larr; Dashboard
          </Link>
          <h1>Event Management</h1>
          <p>Set up the basic information for your event.</p>
        </div>
        <div className="event-heading-actions">
          {savedEvent && !isEditing && !evaluationLoading && (
            <>
              {isConfigured && (
                <span className="event-configured-badge">Evaluation Configured</span>
              )}
              <button
                className="event-primary-button"
                type="button"
                onClick={openEvaluationConfig}
              >
                Configure Evaluation
              </button>
            </>
          )}
          {savedEvent && !isEditing && !evaluationLoading && (
            <button className="event-primary-button" type="button" onClick={startEditing}>
              Edit Event
            </button>
          )}
        </div>
      </div>

      <section className="event-information-card" aria-labelledby="event-information-title">
        <div className="event-information-heading">
          <div className="event-heading-icon" aria-hidden="true">&#9881;</div>
          <div>
            <h2 id="event-information-title">Basic Information</h2>
            <p>Provide the essential details participants need to know.</p>
          </div>
        </div>

        {storageError && (
          <p className="event-feedback event-feedback-error" role="alert">{storageError}</p>
        )}
        {saveConfirmation && (
          <p className="event-feedback event-feedback-success" role="status">{saveConfirmation}</p>
        )}

        {savedEvent && !isEditing ? (
          <dl className="saved-event-details">
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
            <div className="saved-event-description">
              <dt>Description</dt>
              <dd>{savedEvent.description}</dd>
            </div>
          </dl>
        ) : (
          <form className="event-form" onSubmit={handleSubmit} noValidate>
            <div className="event-form-grid">
              <label className="event-field">
                <span>Event Name <b aria-hidden="true">*</b></span>
                <input
                  required
                  autoComplete="off"
                  value={eventData.name}
                  onChange={(changeEvent) => updateField('name', changeEvent.target.value)}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'event-name-error' : undefined}
                />
                {errors.name && (
                  <small id="event-name-error" className="event-field-error">{errors.name}</small>
                )}
              </label>

              <label className="event-field">
                <span>Event Type <b aria-hidden="true">*</b></span>
                <select
                  required
                  value={eventData.type}
                  onChange={(changeEvent) => updateField('type', changeEvent.target.value)}
                  aria-invalid={Boolean(errors.type)}
                  aria-describedby={errors.type ? 'event-type-error' : undefined}
                >
                  <option value="">Select event type</option>
                  {eventTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                {errors.type && (
                  <small id="event-type-error" className="event-field-error">{errors.type}</small>
                )}
              </label>

              <label className="event-field">
                <span>Event Date <b aria-hidden="true">*</b></span>
                <input
                  required
                  type="date"
                  value={eventData.date}
                  onChange={(changeEvent) => updateField('date', changeEvent.target.value)}
                  aria-invalid={Boolean(errors.date)}
                  aria-describedby={errors.date ? 'event-date-error' : undefined}
                />
                {errors.date && (
                  <small id="event-date-error" className="event-field-error">{errors.date}</small>
                )}
              </label>

              <label className="event-field">
                <span>Venue <b aria-hidden="true">*</b></span>
                <input
                  required
                  value={eventData.venue}
                  onChange={(changeEvent) => updateField('venue', changeEvent.target.value)}
                  aria-invalid={Boolean(errors.venue)}
                  aria-describedby={errors.venue ? 'event-venue-error' : undefined}
                />
                {errors.venue && (
                  <small id="event-venue-error" className="event-field-error">{errors.venue}</small>
                )}
              </label>
            </div>
          </form>
        )}
      </section>
    </OrganizerLayout>
  );
}

export default EventManagement;
