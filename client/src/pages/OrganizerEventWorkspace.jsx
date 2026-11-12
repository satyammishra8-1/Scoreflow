import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api as API } from '../auth/api';
import OrganizerLayout from './OrganizerLayout';
import './OrganizerDashboard.css';
import './EventManagement.css';
import './OrganizerEventWorkspace.css';

function OrganizerEventWorkspace() {
  const { eventId = '' } = useParams();
  const [event, setEvent] = useState(null);
  const [workspace, setWorkspace] = useState({ teams: null, judges: null, evaluation: null });
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState('');
  const [analyticsAttempt, setAnalyticsAttempt] = useState(0);
  const analyticsRequestKey = `${eventId}:${analyticsAttempt}`;
  const eventAnalytics = analytics?.key === analyticsRequestKey ? analytics.data : null;
  const eventAnalyticsError = analyticsError?.key === analyticsRequestKey ? analyticsError.message : '';
  const eventAnalyticsIsLoading = !eventAnalytics && !eventAnalyticsError;
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

  useEffect(() => {
    let cancelled = false;
    API.get(`/events/${encodeURIComponent(eventId)}/analytics`)
      .then((response) => {
        if (!cancelled && response.data?.success) setAnalytics({ key: analyticsRequestKey, data: response.data.data });
        if (!cancelled && !response.data?.success) setAnalyticsError({ key: analyticsRequestKey, message: response.data?.error || 'Unable to load event analytics.' });
      })
      .catch((loadError) => {
        if (!cancelled) setAnalyticsError({ key: analyticsRequestKey, message: loadError.response?.data?.error || 'Unable to load event analytics.' });
      });
    return () => { cancelled = true; };
  }, [eventId, analyticsRequestKey]);

  const cards = [
    { title: 'Teams', count: workspace.teams, detail: 'Manage teams registered for this event.', action: 'Open Teams', to: `/organizer/events/${eventId}/teams` },
    { title: 'Judges', count: workspace.judges, detail: 'Manage judges and their team assignments.', action: 'Open Judges', to: `/organizer/events/${eventId}/judges` },
    { title: 'Evaluation', count: null, detail: workspace.evaluation ? `Configured · ${workspace.evaluation.model}` : 'Not configured', action: 'Open Evaluation', to: `/organizer/events/${eventId}/evaluation`, evaluation: true },
    { title: 'Announcements', count: null, detail: 'Send event updates to judges or team members.', action: 'Open Announcements', to: `/organizer/events/${eventId}/announcements`, evaluation: true },
    { title: 'Results', count: null, detail: 'Review event results and standings.', action: 'Open Results', to: `/organizer/events/${eventId}/results`, evaluation: true },
  ];

  return (
    <OrganizerLayout activeKey="events" wrapperClassName="event-management" contentClassName="event-content" eventId={eventId}>
      <div className="event-page-heading">
        <div><Link className="event-back-link" to="/organizer/dashboard">← Dashboard</Link><h1>{event?.name || 'Event Workspace'}</h1><p>Event details and management tools.</p></div>
        {event && <div className="event-heading-actions">
          <Link className="event-secondary-button" to={`/organizer/events/${encodeURIComponent(eventId)}/results`}>View Results</Link>
          <Link className="event-primary-button" to={`/organizer/events/${encodeURIComponent(eventId)}/result-reports`}>Result Reports</Link>
          <Link className="event-secondary-button" to={`/organizer/events?edit=${encodeURIComponent(eventId)}`}>Edit Event</Link>
        </div>}
      </div>
      {loading ? <section className="dashboard-empty-state"><h3>Loading event...</h3><p>Fetching event details and workspace data.</p></section>
        : error ? <section className="dashboard-empty-state" role="alert"><h3>Unable to open event</h3><p>{error}</p><Link className="event-secondary-button" to="/organizer/dashboard">Back to Dashboard</Link></section>
          : event && <>
            <section className="event-analytics" aria-labelledby="event-analytics-title">
              <div className="event-analytics-heading"><div><h2 id="event-analytics-title">Event progress</h2><p>Completion at a glance, based on saved event activity.</p></div></div>
              {eventAnalyticsIsLoading ? <div className="dashboard-empty-state" role="status"><p>Loading event progress…</p></div>
                : eventAnalyticsError ? <div className="dashboard-empty-state" role="alert"><p>{eventAnalyticsError}</p><button className="event-secondary-button" type="button" onClick={() => setAnalyticsAttempt((attempt) => attempt + 1)}>Retry</button></div>
                  : eventAnalytics && <>
                    <div className="event-analytics-cards">
                      <article className="event-analytics-card"><span>Total Teams</span><strong>{eventAnalytics.totalTeams}</strong><small>Registered for this event</small></article>
                      <article className="event-analytics-card"><span>Evaluation Progress</span><strong>{eventAnalytics.completedEvaluations} <small>completed</small></strong><small>{eventAnalytics.pendingEvaluations} pending of {eventAnalytics.totalAssignments} assigned evaluations</small></article>
                      <article className="event-analytics-card"><span>Judge Progress</span><strong>{eventAnalytics.completedJudges} / {eventAnalytics.totalJudges}</strong><small>{eventAnalytics.judgesWithAssignments} judges have assignments · {eventAnalytics.pendingJudges} still have evaluations pending</small></article>
                      <article className="event-analytics-card event-analytics-report-email"><span>Reports &amp; Emails</span>
                        <div><strong>{eventAnalytics.reportsGenerated}</strong><small>Reports generated</small></div>
                        <div><strong>{eventAnalytics.emailsAccepted}</strong><small>Emails accepted by provider · delivery status tracked separately</small></div>
                      </article>
                    </div>
                    <div className="event-analytics-charts">
                      <article className="event-analytics-chart"><div><h3>Evaluation progress</h3><strong>{eventAnalytics.evaluationProgressPercent}%</strong></div>
                        <div className="analytics-progress-track" role="progressbar" aria-label="Completed evaluations" aria-valuemin="0" aria-valuemax="100" aria-valuenow={eventAnalytics.evaluationProgressPercent}><span style={{ width: `${eventAnalytics.evaluationProgressPercent}%` }} /></div>
                        <p>{eventAnalytics.completedEvaluations} completed <span>·</span> {eventAnalytics.pendingEvaluations} pending</p></article>
                      <article className="event-analytics-chart"><div><h3>Judge progress</h3><strong>{eventAnalytics.judgeProgressPercent}%</strong></div>
                        <div className="analytics-progress-track judge-progress-track" role="progressbar" aria-label="Judges who completed all assigned evaluations" aria-valuemin="0" aria-valuemax="100" aria-valuenow={eventAnalytics.judgeProgressPercent}><span style={{ width: `${eventAnalytics.judgeProgressPercent}%` }} /></div>
                        <p>{eventAnalytics.completedJudges} completed <span>·</span> {eventAnalytics.pendingJudges} with pending evaluations <span>·</span> {eventAnalytics.totalJudges - eventAnalytics.judgesWithAssignments} unassigned</p>
                      </article>
                    </div>
                  </>}
            </section>
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
