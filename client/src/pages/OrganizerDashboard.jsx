import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import OrganizerLayout from './OrganizerLayout';
import './OrganizerDashboard.css';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

function eventIdOf(event) {
  const id = event?.eventId ?? event?._id;
  return id == null ? '' : String(id);
}

function EventCard({ event }) {
  return (
    <article className="event-card">
      <div className="event-card-heading"><span className="event-status status-upcoming">Event</span></div>
      <h3>{event.name}</h3>
      <div className="event-meta">
        <span>{event.type}</span>
        <span>{event.date ? new Date(`${event.date.slice(0, 10)}T00:00:00`).toLocaleDateString() : 'Date not set'}</span>
        <span>{event.venue}</span>
      </div>
      <div className="event-actions">
        <Link className="dashboard-button dashboard-button-primary" to={`/organizer/events/${event.id}`}>Manage Event</Link>
        <Link className="dashboard-button dashboard-button-text" to={`/organizer/events/${event.id}`}>View Event</Link>
      </div>
    </article>
  );
}

function OrganizerDashboard() {
  const [events, setEvents] = useState([]);
  const [totals, setTotals] = useState({ teams: null, judges: null });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      setIsLoading(true);
      setError('');
      try {
        const response = await API.get('/events');
        if (!response.data?.success) throw new Error('Unable to load events. Try again.');
        const list = Array.isArray(response.data.data) ? response.data.data : [];
        const validEvents = list.filter((event) => eventIdOf(event) && typeof event.name === 'string' && event.name.trim());
        const counts = await Promise.all(validEvents.map(async (event) => {
          const id = eventIdOf(event);
          const [teams, judges] = await Promise.allSettled([
            API.get(`/events/${encodeURIComponent(id)}/teams`),
            API.get(`/events/${encodeURIComponent(id)}/judges`),
          ]);
          const count = (result) => result.status === 'fulfilled' && Array.isArray(result.value.data?.data)
            ? result.value.data.data.filter((item) => String(item.eventId) === id).length
            : null;
          return { teams: count(teams), judges: count(judges) };
        }));
        if (cancelled) return;
        setEvents(validEvents.map((event) => ({ ...event, id: eventIdOf(event) })));
        setTotals({
          teams: counts.every((item) => item.teams != null) ? counts.reduce((sum, item) => sum + item.teams, 0) : null,
          judges: counts.every((item) => item.judges != null) ? counts.reduce((sum, item) => sum + item.judges, 0) : null,
        });
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to load dashboard data. Check the API connection and try again.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadDashboard();
    return () => { cancelled = true; };
  }, []);

  const overview = useMemo(() => [
    { label: 'Total Events', value: events.length, note: 'Events created', tone: 'icon-blue' },
    { label: 'Total Teams', value: totals.teams ?? '—', note: 'Across all events', tone: 'icon-violet' },
    { label: 'Total Judges', value: totals.judges ?? '—', note: 'Across all events', tone: 'icon-amber' },
  ], [events.length, totals]);

  return (
    <OrganizerLayout activeKey="dashboard">
      <section className="dashboard-welcome">
        <div><h1>Organizer Dashboard</h1><p>Manage your events, teams, judges and evaluations in one place.</p></div>
        <Link className="dashboard-button dashboard-button-primary create-event-button" to="/organizer/events">+ Create Event</Link>
      </section>
      <section className="overview-grid" aria-label="Dashboard overview">
        {overview.map((item) => (
          <article className="overview-card" key={item.label}>
            <div className={`overview-icon ${item.tone}`} aria-hidden="true">{item.label.slice(6, 7)}</div>
            <div className="overview-copy"><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></div>
          </article>
        ))}
      </section>
      <section className="dashboard-section">
        <div className="section-title-row"><div><h2>My Events</h2><p>Open an event workspace to manage its teams, judges and evaluation.</p></div></div>
        {isLoading ? <div className="dashboard-empty-state"><h3>Loading events...</h3><p>Fetching events and counts from the server.</p></div>
          : error ? <div className="dashboard-empty-state" role="alert"><h3>Unable to load dashboard</h3><p>{error}</p></div>
            : events.length ? <div className="events-grid">{events.map((event) => <EventCard key={event.id} event={event} />)}</div>
              : <div className="dashboard-empty-state"><h3>No events yet</h3><p>Create your first competition to start managing teams and judges.</p><Link className="dashboard-button dashboard-button-primary" to="/organizer/events">Create Event</Link></div>}
      </section>
    </OrganizerLayout>
  );
}

export default OrganizerDashboard;
