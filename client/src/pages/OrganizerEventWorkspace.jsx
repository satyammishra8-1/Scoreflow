import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import OrganizerLayout from './OrganizerLayout';
import './OrganizerDashboard.css';
import './EventManagement.css';
import './OrganizerEventWorkspace.css';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });

function OrganizerEventWorkspace() {
  const { eventId = '' } = useParams();
  const [event, setEvent] = useState(null);
  const [workspace, setWorkspace] = useState({ teams: null, judges: null, evaluation: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [eventResult, teamsResult, judgesResult, configResult] = await Promise.allSettled([
          API.get(`/events/${encodeURIComponent(eventId)}`),
          API.get(`/events/${encodeURIComponent(eventId)}/teams`),
          API.get(`/events/${encodeURIComponent(eventId)}/judges`),
          API.get(`/events/${encodeURIComponent(eventId)}/evaluation-config`),
        ]);
        if (cancelled) return;
        if (eventResult.status !== 'fulfilled' || !eventResult.value.data?.success) {
          throw new Error(eventResult.reason?.response?.data?.error || 'Unable to load this event.');
        }
        const eventData = eventResult.value.data.data;
        const id = String(eventData.eventId || eventData._id || eventId);
        const scoped = (result) => result.status === 'fulfilled' && Array.isArray(result.value.data?.data)
          ? result.value.data.data.filter((item) => String(item.eventId) === id).length
          : null;
        const config = configResult.status === 'fulfilled' ? configResult.value.data?.data : null;
        setEvent(eventData);
        setWorkspace({ teams: scoped(teamsResult), judges: scoped(judgesResult), evaluation: config || null });
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to load this event.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [eventId]);

  const cards = [
    { title: 'Teams', count: workspace.teams, detail: 'Manage teams registered for this event.', action: 'Open Teams', to: `/organizer/events/${eventId}/teams` },
    { title: 'Judges', count: workspace.judges, detail: 'Manage judges and their team assignments.', action: 'Open Judges', to: `/organizer/events/${eventId}/judges` },
    { title: 'Evaluation', count: null, detail: workspace.evaluation ? `Configured · ${workspace.evaluation.model}` : 'Not configured', action: 'Open Evaluation', to: `/organizer/events/${eventId}/evaluation`, evaluation: true },
    { title: 'Announcements', count: null, detail: 'Send event updates to judges or team members.', action: 'Open Announcements', to: `/organizer/events/${eventId}/announcements`, evaluation: true },
  ];

  return (
    <OrganizerLayout activeKey="events" wrapperClassName="event-management" contentClassName="event-content" eventId={eventId}>
      <div className="event-page-heading">
        <div><Link className="event-back-link" to="/organizer/dashboard">← Dashboard</Link><h1>Event Workspace</h1><p>Event details and management tools.</p></div>
        {event && <div className="event-heading-actions">
          <Link className="event-secondary-button" to={`/organizer/events/${encodeURIComponent(eventId)}/results`}>View Results</Link>
          <Link className="event-primary-button" to={`/organizer/events/${encodeURIComponent(eventId)}/result-reports`}>AI Result Reports</Link>
          <Link className="event-secondary-button" to={`/organizer/events?edit=${encodeURIComponent(eventId)}`}>Edit Event</Link>
        </div>}
      </div>
      {loading ? <section className="dashboard-empty-state"><h3>Loading event...</h3><p>Fetching event details and workspace data.</p></section>
        : error ? <section className="dashboard-empty-state" role="alert"><h3>Unable to open event</h3><p>{error}</p><Link className="event-secondary-button" to="/organizer/dashboard">Back to Dashboard</Link></section>
          : event && <>
            <section className="event-information-card" aria-labelledby="workspace-event-title">
              <h2 id="workspace-event-title">{event.name}</h2>
              <dl className="workspace-event-details">
                <div><dt>Event type</dt><dd>{event.type || '—'}</dd></div>
                <div><dt>Date</dt><dd>{event.date ? new Date(`${String(event.date).slice(0, 10)}T00:00:00`).toLocaleDateString() : '—'}</dd></div>
                <div><dt>Venue</dt><dd>{event.venue || '—'}</dd></div>
                {event.description && <div className="workspace-description"><dt>Description</dt><dd>{event.description}</dd></div>}
              </dl>
            </section>
            <section className="event-workspace-grid" aria-label="Event management sections">
              {cards.map((card) => <article className="event-workspace-card" key={card.title}>
                <div><span className="event-workspace-icon" aria-hidden="true">{card.title.slice(0, 1)}</span><h2>{card.title}</h2></div>
                {card.evaluation ? <p>{card.detail}</p> : <p>{card.count == null ? 'Count unavailable' : `${card.count} ${card.count === 1 ? card.title.slice(0, -1).toLowerCase() : card.title.toLowerCase()}`}</p>}
                <small>{card.detail}</small>
                <Link className="event-primary-button" to={card.to}>{card.action}</Link>
              </article>)}
            </section>
          </>}
    </OrganizerLayout>
  );
}

export default OrganizerEventWorkspace;
