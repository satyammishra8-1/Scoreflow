import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { readSavedEvaluationSessions } from '../data/evaluationStorage';
import './OrganizerDashboard.css';

const navigation = [
  { label: 'Dashboard', icon: '▦', active: true },
  { label: 'Events', icon: '▣', href: '/organizer/events' },
  { label: 'Teams', icon: '♧', href: '/organizer/events/default/teams' },
  { label: 'Judges', icon: '♙', href: '/organizer/events/default/judges' },
  { label: 'Evaluation Criteria', icon: '☷' },
  { label: 'Results', icon: '▤' },
  { label: 'Feedback & Emails', icon: '✉' },
];

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

function getEventIdsFromStorage() {
  const eventIds = new Set();

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (!key || !key.startsWith(EVENT_KEY_PREFIX)) {
        continue;
      }

      const remaining = key.slice(EVENT_KEY_PREFIX.length);
      const eventId = remaining.split('.')[0];

      if (eventId) {
        eventIds.add(eventId);
      }
    }
  } catch {
    return [];
  }

  return [...eventIds];
}

function readEvent(eventId) {
  const possibleKeys = [
    `${EVENT_KEY_PREFIX}${eventId}`,
    `${EVENT_KEY_PREFIX}${eventId}.event`,
    `${EVENT_KEY_PREFIX}${eventId}.details`,
  ];

  for (const key of possibleKeys) {
    const stored = readJSON(key, null);

    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      return stored;
    }
  }

  return {
    id: eventId,
    name: eventId === 'default' ? 'Event' : eventId,
  };
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

function getEvaluationStats(eventId, teams, judges) {
  const sessions = readSavedEvaluationSessions(eventId);

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

function buildDashboardData() {
  const eventIds = getEventIdsFromStorage();

  const events = eventIds
    .map((eventId) => {
      const rawEvent = readEvent(eventId);
      const teams = readTeams(eventId);
      const judges = readJudges(eventId);
      const evaluation = getEvaluationStats(
        eventId,
        teams,
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

function Sidebar({ isOpen, closeMenu }) {
  return (
    <>
      <button
        className={`dashboard-scrim ${
          isOpen ? 'visible' : ''
        }`}
        type="button"
        aria-label="Close navigation"
        onClick={closeMenu}
      />

      <aside
        className={`dashboard-sidebar ${
          isOpen ? 'sidebar-open' : ''
        }`}
      >
        <Link
          to="/"
          className="dashboard-brand"
          onClick={closeMenu}
        >
          <span className="dashboard-brand-mark">
            S
          </span>
          <span>ScoreFlow</span>
        </Link>

        <nav
          className="sidebar-navigation"
          aria-label="Organizer navigation"
        >
          {navigation.map((item) => (
            <Link
              to={item.href || '/organizer/dashboard'}
              className={`sidebar-link ${
                item.active
                  ? 'sidebar-link-active'
                  : ''
              }`}
              key={item.label}
              onClick={closeMenu}
            >
              <span
                className="sidebar-icon"
                aria-hidden="true"
              >
                {item.icon}
              </span>

              <span>{item.label}</span>

              {item.active && (
                <span className="active-indicator" />
              )}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <Link
            to="/organizer/settings"
            className="sidebar-link"
            onClick={closeMenu}
          >
            <span
              className="sidebar-icon"
              aria-hidden="true"
            >
              ⚙
            </span>
            <span>Settings</span>
          </Link>
        </div>
      </aside>
    </>
  );
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const dashboard = useMemo(
    () => buildDashboardData(),
    [],
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
    ? getEvaluationStats(
        activeEvent.id,
        readTeams(activeEvent.id),
        readJudges(activeEvent.id),
      )
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

  const judgeProgress =
    judgeTotal > 0
      ? Math.round(
          (judgeCompleted / judgeTotal) * 100,
        )
      : 0;

  return (
    <div className="sf-dashboard">
      <Sidebar
        isOpen={isMenuOpen}
        closeMenu={() => setIsMenuOpen(false)}
      />

      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <button
            className="mobile-menu-button"
            type="button"
            aria-label="Open navigation"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>

          <label className="dashboard-search">
            <span aria-hidden="true">⌕</span>

            <input
              aria-label="Search"
              placeholder="Search events, teams, judges..."
            />
          </label>

          <div className="topbar-actions">
            <button
              className="notification-button"
              type="button"
              aria-label="Notifications"
            >
              <span aria-hidden="true">♧</span>
              <i />
            </button>

            <span className="topbar-divider" />

            <div className="topbar-user">
              <div className="profile-avatar">
                O
              </div>

              <div className="topbar-user-name">
                <strong>Organizer</strong>
                <span>Administrator</span>
              </div>

              <span
                className="dropdown-chevron"
                aria-hidden="true"
              >
                ⌄
              </span>
            </div>
          </div>
        </header>

        <main className="dashboard-content">
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

            {events.length > 0 ? (
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
        </main>
      </div>
    </div>
  );
}

export default OrganizerDashboard;