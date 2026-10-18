import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import OrganizerLayout from './OrganizerLayout';
import { readSavedEvaluationSessions } from '../data/evaluationStorage';
import './OrganizerDashboard.css';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

const EVENT_KEY_PREFIX = 'scoreflow.organizer.event.';

function readJSON(key, fallback = []) {
  try {
    const value = window.localStorage.getItem(key);

    if (!value) {
      return fallback;
    }

    const parsed = JSON.parse(value);

    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function getEventId(event) {
  const rawId = event?.eventId ?? event?._id ?? event?.id;
  return rawId != null ? String(rawId) : '';
}

function readTeams(eventId) {
  const stored = readJSON(
    `${EVENT_KEY_PREFIX}${eventId}.teams`,
    [],
  );

  return Array.isArray(stored) ? stored : [];
}

function readJudges(eventId) {
  const stored = readJSON(
    `${EVENT_KEY_PREFIX}${eventId}.judges`,
    [],
  );

  return Array.isArray(stored) ? stored : [];
}

function getEventName(event, eventId) {
  return (
    event?.name ||
    event?.eventName ||
    event?.title ||
    `Event ${eventId}`
  );
}

function getEventDate(event) {
  return (
    event?.date ||
    event?.eventDate ||
    event?.startDate ||
    event?.startAt ||
    ''
  );
}

function getEventLocation(event) {
  return (
    event?.location ||
    event?.venue ||
    event?.place ||
    ''
  );
}

function getEventStatus(event) {
  const explicitStatus = String(
    event?.status || '',
  ).trim();

  if (explicitStatus) {
    const normalized = explicitStatus.toLowerCase();

    if (normalized === 'active' || normalized === 'ongoing') {
      return {
        label: 'Active',
        tone: 'active',
      };
    }

    if (
      normalized === 'completed' ||
      normalized === 'complete' ||
      normalized === 'finished'
    ) {
      return {
        label: 'Completed',
        tone: 'completed',
      };
    }

    if (
      normalized === 'upcoming' ||
      normalized === 'pending' ||
      normalized === 'scheduled'
    ) {
      return {
        label: 'Upcoming',
        tone: 'upcoming',
      };
    }

    return {
      label: explicitStatus,
      tone: 'upcoming',
    };
  }

  const now = Date.now();
  const start = event?.startDate
    ? new Date(event.startDate).getTime()
    : null;
  const end = event?.endDate
    ? new Date(event.endDate).getTime()
    : null;

  if (start && !Number.isNaN(start) && start > now) {
    return {
      label: 'Upcoming',
      tone: 'upcoming',
    };
  }

  if (end && !Number.isNaN(end) && end < now) {
    return {
      label: 'Completed',
      tone: 'completed',
    };
  }

  return {
    label: 'Active',
    tone: 'active',
  };
}

function getTeamId(team) {
  return String(team?.id || team?.number || '');
}

function getJudgeId(judge) {
  return String(judge?.id || judge?.email || judge?.name || '');
}

function getJudgeName(judge) {
  return (
    judge?.name ||
    judge?.fullName ||
    judge?.email ||
    'Unnamed Judge'
  );
}

function getEvaluationStats(sessions, judges) {
  const completedSessions = sessions.filter(
    (session) => session.status === 'COMPLETED',
  );

  const totalAssigned = judges.reduce(
    (total, judge) => {
      const assigned = Array.isArray(judge?.teamIds)
        ? judge.teamIds.length
        : 0;

      return total + assigned;
    },
    0,
  );

  const totalEvaluations =
    totalAssigned > 0
      ? totalAssigned
      : sessions.length;

  const completed = completedSessions.length;

  const pending = Math.max(
    totalEvaluations - completed,
    0,
  );

  const progress =
    totalEvaluations > 0
      ? Math.round((completed / totalEvaluations) * 100)
      : 0;

  return {
    sessions,
    totalEvaluations,
    completed,
    pending,
    progress,
  };
}

function buildDashboardData(apiEvents) {
  const list = Array.isArray(apiEvents) ? apiEvents : [];

  const events = list
    .map((rawEvent) => {
      const eventId = getEventId(rawEvent);
      const teams = readTeams(eventId);
      const judges = readJudges(eventId);
      const evaluation = getEvaluationStats(
        readSavedEvaluationSessions(eventId),
        judges,
      );

      const status = getEventStatus(rawEvent);

      return {
        ...rawEvent,
        id: eventId,
        name: getEventName(rawEvent, eventId),
        date: getEventDate(rawEvent),
        location: getEventLocation(rawEvent),
        status: status.label,
        tone: status.tone,
        teams: teams.length,
        judges: judges.length,
        progress: evaluation.progress,
        completed: `${evaluation.completed} / ${evaluation.totalEvaluations} evaluations completed`,
        totalEvaluations: evaluation.totalEvaluations,
        completedEvaluations: evaluation.completed,
        pendingEvaluations: evaluation.pending,
      };
    })
    .filter(Boolean);

  const totalEvents = events.length;

  const activeEvents = events.filter(
    (event) => event.tone === 'active',
  ).length;

  const totalTeams = events.reduce(
    (total, event) => total + event.teams,
    0,
  );

  const totalJudges = events.reduce(
    (total, event) => total + event.judges,
    0,
  );

  const activeEvent =
    events.find((event) => event.tone === 'active') ||
    events[0] ||
    null;

  let judges = [];

  if (activeEvent) {
    judges = readJudges(activeEvent.id).map((judge) => {
      const sessions = readSavedEvaluationSessions(
        activeEvent.id,
      );

      const judgeId = getJudgeId(judge);

      const assignedTeamIds = Array.isArray(
        judge?.teamIds,
      )
        ? judge.teamIds.map(String)
        : [];

      const assigned =
        assignedTeamIds.length > 0
          ? assignedTeamIds.length
          : sessions.filter(
              (session) =>
                String(session.judgeId) === judgeId,
            ).length;

      const completed = sessions.filter(
        (session) =>
          String(session.judgeId) === judgeId &&
          session.status === 'COMPLETED',
      ).length;

      const progress =
        assigned > 0
          ? Math.round((completed / assigned) * 100)
          : 0;

      return {
        ...judge,
        name: getJudgeName(judge),
        assigned,
        completed,
        progress,
      };
    });
  }

  return {
    events,
    activeEvent,
    judges,
    totalEvents,
    activeEvents,
    totalTeams,
    totalJudges,
  };
}

/**
 * Calculates team results from submitted (COMPLETED) evaluations.
 * Only evaluations with status COMPLETED affect results.
 */
function calculateTeamResults(evaluations, teams, judges) {
  const completed = evaluations.filter(
    (evaluation) => evaluation.status === 'COMPLETED',
  );

  const teamMap = {};
  teams.forEach((team) => {
    const id = String(team.teamId || team._id);
    teamMap[id] = team;
  });

  const judgeMap = {};
  judges.forEach((judge) => {
    const id = String(judge.judgeId || judge._id);
    judgeMap[id] = judge;
  });

  const byTeam = {};
  completed.forEach((evaluation) => {
    const teamId = String(evaluation.teamId);
    if (!byTeam[teamId]) {
      byTeam[teamId] = [];
    }
    byTeam[teamId].push(evaluation);
  });

  const results = Object.entries(byTeam).map(([teamId, evals]) => {
    const team = teamMap[teamId] || {};
    const judgeScores = {};
    let totalScore = 0;

    evals.forEach((evaluation) => {
      const judgeId = String(evaluation.judgeId);
      judgeScores[judgeId] = {
        judgeName:
          (judgeMap[judgeId] && judgeMap[judgeId].name) || 'Unknown Judge',
        score: Number(evaluation.totalScore || 0),
      };
      totalScore += Number(evaluation.totalScore || 0);
    });

    return {
      teamId,
      teamName: team.teamName || team.name || 'Unknown Team',
      teamNumber: team.teamNumber || team.number || '',
      completedEvaluations: evals.length,
      totalScore,
      averageScore:
        evals.length > 0
          ? Math.round((totalScore / evals.length) * 100) / 100
          : 0,
      judgeScores,
    };
  });

  // Rank by total score descending; ties share the same rank position order
  results.sort((a, b) => b.totalScore - a.totalScore || a.teamName.localeCompare(b.teamName));
  results.forEach((result, index) => {
    result.rank = index + 1;
  });

  return results;
}

function ProgressRing({ value, label }) {
  return (
    <div
      className="progress-ring"
      style={{
        '--ring-progress': `${value * 3.6}deg`,
      }}
      role="img"
      aria-label={`${value}% ${label}`}
    >
      <div className="progress-ring-inner">
        <strong>{value}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function EventCard({ event }) {
  return (
    <article className="event-card">
      <div className="event-card-heading">
        <div
          className={`event-marker marker-${event.tone}`}
        />

        <span
          className={`event-status status-${event.tone}`}
        >
          {event.status}
        </span>
      </div>

      <h3>{event.name}</h3>

      <div className="event-meta">
        {event.date && (
          <span>
            <i aria-hidden="true">▦</i>
            {event.date}
          </span>
        )}

        {event.location && (
          <span>
            <i aria-hidden="true">⌖</i>
            {event.location}
          </span>
        )}
      </div>

      <div className="event-counts">
        <span>
          <strong>{event.teams}</strong> Teams
        </span>

        <span>
          <strong>{event.judges}</strong> Judges
        </span>
      </div>

      <div className="event-progress">
        <div className="event-progress-heading">
          <span>Evaluation Progress</span>
          <strong>{event.progress}%</strong>
        </div>

        <div
          className="linear-progress"
          role="progressbar"
          aria-label={`${event.name} evaluation progress`}
          aria-valuenow={event.progress}
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span
            style={{
              width: `${event.progress}%`,
            }}
          />
        </div>

        <small>{event.completed}</small>
      </div>

      <div className="event-actions">
        <Link
          className="dashboard-button dashboard-button-primary"
          to={`/organizer/events/${event.id}/teams`}
        >
          Manage Event
        </Link>

        <Link
          className="dashboard-button dashboard-button-text"
          to={`/organizer/events/${event.id}/teams`}
        >
          View Details
        </Link>
      </div>
    </article>
  );
}

function OrganizerDashboard() {
  const [apiEvents, setApiEvents] = useState([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState('');

  // MongoDB-backed results data for the active event
  const [activeEvaluations, setActiveEvaluations] = useState([]);
  const [activeTeams, setActiveTeams] = useState([]);
  const [activeJudges, setActiveJudges] = useState([]);
  const [isLoadingActiveData, setIsLoadingActiveData] = useState(false);
  const [activeDataError, setActiveDataError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      setIsLoadingEvents(true);
      setEventsError('');
      try {
        const response = await API.get('/events');
        if (cancelled) return;
        if (response.data && response.data.success) {
          setApiEvents(Array.isArray(response.data.data) ? response.data.data : []);
        } else {
          setEventsError('Unable to load events. Try again.');
        }
      } catch {
        if (cancelled) return;
        setEventsError('Unable to load events. Check the API connection and try again.');
      } finally {
        if (!cancelled) setIsLoadingEvents(false);
      }
    }

    loadEvents();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadActiveEventData() {
      if (!activeEvent) {
        setActiveEvaluations([]);
        setActiveTeams([]);
        setActiveJudges([]);
        setIsLoadingActiveData(false);
        setActiveDataError('');
        return;
      }

      const eventId = String(activeEvent.id);
      setIsLoadingActiveData(true);
      setActiveDataError('');

      try {
        const [evalRes, teamRes, judgeRes] = await Promise.all([
          API.get(`/events/${encodeURIComponent(eventId)}/evaluations`),
          API.get(`/events/${encodeURIComponent(eventId)}/teams`),
          API.get(`/events/${encodeURIComponent(eventId)}/judges`),
        ]);

        if (cancelled) return;

        setActiveEvaluations(
          Array.isArray(evalRes.data?.data) ? evalRes.data.data : [],
        );
        setActiveTeams(
          Array.isArray(teamRes.data?.data) ? teamRes.data.data : [],
        );
        setActiveJudges(
          Array.isArray(judgeRes.data?.data) ? judgeRes.data.data : [],
        );
      } catch {
        if (cancelled) return;
        setActiveDataError(
          'Unable to load results data. Check the API connection and try again.',
        );
      } finally {
        if (!cancelled) setIsLoadingActiveData(false);
      }
    }

    loadActiveEventData();
    return () => {
      cancelled = true;
    };
  }, [activeEvent]);

  const dashboard = useMemo(
    () => buildDashboardData(apiEvents),
    [apiEvents],
  );

  const {
    events,
    activeEvent,
    judges,
    totalEvents,
    activeEvents,
    totalTeams,
    totalJudges,
  } = dashboard;

  const activeEvaluation = activeEvent
    ? getEvaluationStats(activeEvaluations, activeJudges)
    : {
        progress: 0,
        completed: 0,
        pending: 0,
        totalEvaluations: 0,
      };

  const judgeTotal =
    activeEvaluation.totalEvaluations;

  const judgeCompleted =
    activeEvaluation.completed;

  const teamResults = useMemo(
    () => calculateTeamResults(activeEvaluations, activeTeams, activeJudges),
    [activeEvaluations, activeTeams, activeJudges],
  );

  const judgeProgress =
    judgeTotal > 0
      ? Math.round(
          (judgeCompleted / judgeTotal) * 100,
        )
      : 0;

  return (
    <OrganizerLayout activeKey="dashboard">
      <section className="dashboard-welcome">
            <div>
              <h1>
                Welcome back, Organizer!{' '}
                <span aria-hidden="true">
                  👋
                </span>
              </h1>

              <p>
                Manage your events, teams, judges and
                evaluations all in one place.
              </p>
            </div>

            <Link
              className="dashboard-button dashboard-button-primary create-event-button"
              to="/organizer/events"
            >
              <span aria-hidden="true">+</span>
              Create Event
            </Link>
          </section>

          <section
            className="overview-grid"
            aria-label="Dashboard overview"
          >
            <article className="overview-card">
              <div
                className="overview-icon icon-blue"
                aria-hidden="true"
              >
                ▣
              </div>

              <div className="overview-copy">
                <span>Total Events</span>
                <strong>{totalEvents}</strong>
                <small>
                  Events created
                </small>
              </div>
            </article>

            <article className="overview-card">
              <div
                className="overview-icon icon-green"
                aria-hidden="true"
              >
                ◷
              </div>

              <div className="overview-copy">
                <span>Active Events</span>
                <strong>{activeEvents}</strong>
                <small>
                  <span className="status-dot" />
                  Ongoing
                </small>
              </div>
            </article>

            <article className="overview-card">
              <div
                className="overview-icon icon-violet"
                aria-hidden="true"
              >
                ♧
              </div>

              <div className="overview-copy">
                <span>Total Teams</span>
                <strong>{totalTeams}</strong>
                <small>
                  Across all events
                </small>
              </div>
            </article>

            <article className="overview-card">
              <div
                className="overview-icon icon-amber"
                aria-hidden="true"
              >
                ♙
              </div>

              <div className="overview-copy">
                <span>Total Judges</span>
                <strong>{totalJudges}</strong>
                <small>
                  Across all events
                </small>
              </div>
            </article>
          </section>

          <section className="dashboard-section">
            <div className="section-title-row">
              <div>
                <h2>My Events</h2>
                <p>
                  Manage and track your competitions
                </p>
              </div>
            </div>

            {isLoadingEvents ? (
              <div className="dashboard-empty-state">
                <h3>Loading events...</h3>
                <p>
                  Fetching your competitions from the server.
                </p>
              </div>
            ) : eventsError ? (
              <div className="dashboard-empty-state">
                <h3>Unable to load events</h3>
                <p>
                  {eventsError}
                </p>
              </div>
            ) : events.length > 0 ? (
              <div className="events-grid">
                {events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                  />
                ))}
              </div>
            ) : (
              <div className="dashboard-empty-state">
                <h3>No events yet</h3>
                <p>
                  Create your first competition to
                  start managing teams and judges.
                </p>

                <Link
                  className="dashboard-button dashboard-button-primary"
                  to="/organizer/events"
                >
                  Create Event
                </Link>
              </div>
            )}
          </section>

          {activeEvent && (
            <section className="dashboard-section tracking-section">
              <div className="section-title-row">
                <div>
                  <h2>Evaluation Tracking</h2>
                  <p>
                    Monitor progress across your
                    active event
                  </p>
                </div>
              </div>

              <div className="tracking-grid">
                <article className="tracking-card">
                  <h3>
                    Event Evaluation Progress
                  </h3>

                  <p className="tracking-event-name">
                    {activeEvent.name}
                  </p>

                  <div className="ring-and-legend">
                    <ProgressRing
                      value={activeEvaluation.progress}
                      label="Complete"
                    />

                    <div className="legend-list">
                      <div>
                        <span className="legend-dot legend-completed" />
                        <span>Completed</span>
                        <strong>
                          {activeEvaluation.completed}
                        </strong>
                      </div>

                      <div>
                        <span className="legend-dot legend-pending" />
                        <span>Pending</span>
                        <strong>
                          {activeEvaluation.pending}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <p className="tracking-footnote">
                    {activeEvaluation.completed} /{' '}
                    {activeEvaluation.totalEvaluations}{' '}
                    evaluations completed
                  </p>
                </article>

                <article className="tracking-card">
                  <h3>Judge Progress</h3>

                  <p className="tracking-event-name">
                    {activeEvent.name}
                  </p>

                  <div className="ring-and-legend judge-ring-layout">
                    <ProgressRing
                      value={judgeProgress}
                      label="Complete"
                    />

                    <div className="legend-list">
                      <div>
                        <span className="legend-dot legend-completed" />
                        <span>Completed</span>
                      </div>

                      <div>
                        <span className="legend-dot legend-in-progress" />
                        <span>In Progress</span>
                      </div>

                      <div>
                        <span className="legend-dot legend-pending" />
                        <span>Pending</span>
                      </div>
                    </div>
                  </div>

                  <p className="tracking-footnote">
                    {judgeCompleted} / {judgeTotal}{' '}
                    evaluations completed
                  </p>
                </article>

                <article className="tracking-card judge-status-card">
                  <h3>Judge-wise Status</h3>

                  {judges.length > 0 ? (
                    <div className="judge-table-wrap">
                      <table className="judge-table">
                        <thead>
                          <tr>
                            <th>Judge</th>
                            <th>Assigned</th>
                            <th>Completed</th>
                            <th>Progress</th>
                          </tr>
                        </thead>

                        <tbody>
                          {judges.map((judge) => (
                            <tr
                              key={getJudgeId(judge)}
                            >
                              <td>{judge.name}</td>
                              <td>{judge.assigned}</td>
                              <td>{judge.completed}</td>

                              <td>
                                <div className="judge-progress-cell">
                                  <div
                                    className="judge-progress-track"
                                    role="progressbar"
                                    aria-label={`${judge.name} progress`}
                                    aria-valuenow={
                                      judge.progress
                                    }
                                    aria-valuemin="0"
                                    aria-valuemax="100"
                                  >
                                    <span
                                      style={{
                                        width: `${judge.progress}%`,
                                      }}
                                    />
                                  </div>

                                  <strong>
                                    {judge.progress}%
                                  </strong>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="dashboard-empty-state">
                      <p>
                        No judges have been added to
                        this event yet.
                      </p>
                    </div>
                  )}
                </article>
              </div>
            </section>
          )}

          {activeEvent && (
            <section className="dashboard-section results-section">
              <div className="section-title-row">
                <div>
                  <h2>Team Results</h2>
                  <p>
                    Rankings calculated from submitted evaluations for{' '}
                    <strong>{activeEvent.name}</strong>.
                  </p>
                </div>
              </div>

              {isLoadingActiveData ? (
                <div className="dashboard-empty-state">
                  <h3>Loading results...</h3>
                  <p>
                    Fetching evaluations, teams, and judges from the server.
                  </p>
                </div>
              ) : activeDataError ? (
                <div className="dashboard-empty-state">
                  <h3>Unable to load results</h3>
                  <p>{activeDataError}</p>
                </div>
              ) : teamResults.length > 0 ? (
                <div className="results-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Team</th>
                        <th>Completed Evaluations</th>
                        <th>Total Score</th>
                        <th>Average Score</th>
                        <th>Judge-wise Scores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamResults.map((result) => (
                        <tr key={result.teamId}>
                          <td>
                            <strong>#{result.rank}</strong>
                          </td>
                          <td>
                            <strong>{result.teamName}</strong>{' '}
                            {result.teamNumber && (
                              <>
                                <br />
                                <small>Team #{result.teamNumber}</small>
                              </>
                            )}
                          </td>
                          <td>{result.completedEvaluations}</td>
                          <td>{result.totalScore}</td>
                          <td>{result.averageScore}</td>
                          <td>
                            {Object.values(result.judgeScores).length > 0 ? (
                              Object.values(result.judgeScores).map(
                                (js) => (
                                  <div key={js.judgeName}>
                                    {js.judgeName}: {js.score}
                                  </div>
                                ),
                              )
                            ) : (
                              <em>No scores</em>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="dashboard-empty-state">
                  <h3>No results yet</h3>
                  <p>
                    No completed evaluations have been submitted for this
                    event. Results will appear here once judges complete their
                    evaluations.
                  </p>
                </div>
              )}
            </section>
          )}

          <section className="dashboard-section quick-actions-section">
            <div className="section-title-row">
              <div>
                <h2>Quick Actions</h2>
                <p>
                  Common tasks to keep things moving
                </p>
              </div>
            </div>

            <div className="quick-actions-grid">
              <Link
                className="quick-action-card"
                to="/organizer/events"
              >
                <span
                  className="quick-action-icon"
                  aria-hidden="true"
                >
                  +
                </span>

                <span className="quick-action-copy">
                  <strong>Create Event</strong>
                  <small>
                    Set up a new competition
                  </small>
                </span>

                <span
                  className="quick-action-arrow"
                  aria-hidden="true"
                >
                  →
                </span>
              </Link>

              <Link
                className="quick-action-card"
                to={
                  activeEvent
                    ? `/organizer/events/${activeEvent.id}/teams`
                    : '/organizer/events'
                }
              >
                <span
                  className="quick-action-icon"
                  aria-hidden="true"
                >
                  ⇧
                </span>

                <span className="quick-action-copy">
                  <strong>Import Teams</strong>
                  <small>
                    Upload teams via Excel
                  </small>
                </span>

                <span
                  className="quick-action-arrow"
                  aria-hidden="true"
                >
                  →
                </span>
              </Link>

              <Link
                className="quick-action-card"
                to={
                  activeEvent
                    ? `/organizer/events/${activeEvent.id}/judges`
                    : '/organizer/events'
                }
              >
                <span
                  className="quick-action-icon"
                  aria-hidden="true"
                >
                  ♙
                </span>

                <span className="quick-action-copy">
                  <strong>Add Judges</strong>
                  <small>
                    Invite and assign judges
                  </small>
                </span>

                <span
                  className="quick-action-arrow"
                  aria-hidden="true"
                >
                  →
                </span>
              </Link>

              <Link
                className="quick-action-card"
                to="/organizer/events"
              >
                <span
                  className="quick-action-icon"
                  aria-hidden="true"
                >
                  ▤
                </span>

                <span className="quick-action-copy">
                  <strong>View Results</strong>
                  <small>
                    Check rankings and reports
                  </small>
                </span>

                <span
                  className="quick-action-arrow"
                  aria-hidden="true"
                >
                  →
                </span>
              </Link>
            </div>
          </section>
    </OrganizerLayout>
  );
}

export default OrganizerDashboard;