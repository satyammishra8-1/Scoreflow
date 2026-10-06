import { useState } from 'react';
import { Link } from 'react-router-dom';
import './OrganizerDashboard.css';

const navigation = [
  { label: 'Dashboard', icon: '▦', active: true },
  { label: 'Events', icon: '▣', href: '/organizer/events' },
  { label: 'Teams', icon: '♧', href: '/organizer/events/default/teams' },
  { label: 'Judges', icon: '♙' },
  { label: 'Evaluation Criteria', icon: '☷' },
  { label: 'Results', icon: '▤' },
  { label: 'Feedback & Emails', icon: '✉' },
];

const events = [
  {
    name: 'Annual Innovation Hackathon 2026',
    status: 'Active',
    date: '12 Oct 2026',
    location: 'GCEM, Bengaluru',
    teams: 24,
    judges: 6,
    progress: 72,
    completed: '36 / 50 evaluations completed',
    action: 'Manage Event',
    tone: 'active',
  },
  {
    name: 'Tech Expo 2026',
    status: 'Upcoming',
    date: '5 Sep 2026',
    location: 'Project Exhibition',
    teams: 12,
    judges: 4,
    progress: 0,
    completed: '0 / 24 evaluations completed',
    action: 'Manage Event',
    tone: 'upcoming',
  },
  {
    name: 'AI Buildathon',
    status: 'Completed',
    date: '20 Aug 2026',
    location: 'Hackathon',
    teams: 10,
    judges: 4,
    progress: 100,
    completed: '40 / 40 evaluations completed',
    action: 'View Results',
    tone: 'completed',
  },
];

const judges = [
  { name: 'Dr. Priya Sharma', assigned: 8, completed: 8, progress: 100 },
  { name: 'Prof. Rahul Mehta', assigned: 8, completed: 6, progress: 75 },
  { name: 'Dr. Ankit Verma', assigned: 8, completed: 4, progress: 50 },
  { name: 'Ms. Neha Kapoor', assigned: 8, completed: 8, progress: 100 },
];

const actions = [
  { title: 'Create Event', description: 'Set up a new competition', icon: '+' },
  { title: 'Import Teams', description: 'Upload teams via Excel', icon: '⇧' },
  { title: 'Add Judges', description: 'Invite and assign judges', icon: '♙' },
  { title: 'View Results', description: 'Check rankings and reports', icon: '▤' },
];

function Sidebar({ isOpen, closeMenu }) {
  return (
    <>
      <button
        className={`dashboard-scrim ${isOpen ? 'visible' : ''}`}
        type="button"
        aria-label="Close navigation"
        onClick={closeMenu}
      />
      <aside className={`dashboard-sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <Link to="/" className="dashboard-brand" onClick={closeMenu}>
          <span className="dashboard-brand-mark">S</span>
          <span>ScoreFlow</span>
        </Link>

        <nav className="sidebar-navigation" aria-label="Organizer navigation">
          {navigation.map((item) => (
            <a
              href={item.active ? '/organizer/dashboard' : item.href || '#'}
              className={`sidebar-link ${item.active ? 'sidebar-link-active' : ''}`}
              key={item.label}
              onClick={closeMenu}
            >
              <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.active && <span className="active-indicator" />}
            </a>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <a href="#" className="sidebar-link" onClick={closeMenu}>
            <span className="sidebar-icon" aria-hidden="true">⚙</span>
            <span>Settings</span>
          </a>
        </div>
      </aside>
    </>
  );
}

function ProgressRing({ value, label }) {
  return (
    <div
      className="progress-ring"
      style={{ '--ring-progress': `${value * 3.6}deg` }}
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
        <div className={`event-marker marker-${event.tone}`} />
        <span className={`event-status status-${event.tone}`}>{event.status}</span>
      </div>
      <h3>{event.name}</h3>
      <div className="event-meta">
        <span><i aria-hidden="true">▦</i>{event.date}</span>
        <span><i aria-hidden="true">⌖</i>{event.location}</span>
      </div>
      <div className="event-counts">
        <span><strong>{event.teams}</strong> Teams</span>
        <span><strong>{event.judges}</strong> Judges</span>
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
          <span style={{ width: `${event.progress}%` }} />
        </div>
        <small>{event.completed}</small>
      </div>
      <div className="event-actions">
        <Link className="dashboard-button dashboard-button-primary" to="/organizer/events">{event.action}</Link>
        <Link className="dashboard-button dashboard-button-text" to="/organizer/events">View Details</Link>
      </div>
    </article>
  );
}

function OrganizerDashboard() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="sf-dashboard">
      <Sidebar isOpen={isMenuOpen} closeMenu={() => setIsMenuOpen(false)} />

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
            <input aria-label="Search" placeholder="Search events, teams, judges..." />
          </label>
          <div className="topbar-actions">
            <button className="notification-button" type="button" aria-label="Notifications">
              <span aria-hidden="true">♧</span>
              <i />
            </button>
            <span className="topbar-divider" />
            <div className="topbar-user">
              <div className="profile-avatar">A</div>
              <div className="topbar-user-name">
                <strong>Admin</strong>
                <span>Organizer</span>
              </div>
              <span className="dropdown-chevron" aria-hidden="true">⌄</span>
            </div>
          </div>
        </header>

        <main className="dashboard-content">
          <section className="dashboard-welcome">
            <div>
              <h1>Welcome back, Organizer! <span aria-hidden="true">👋</span></h1>
              <p>Manage your events, teams, judges and evaluations all in one place.</p>
            </div>
            <Link className="dashboard-button dashboard-button-primary create-event-button" to="/organizer/events">
              <span aria-hidden="true">+</span> Create Event
            </Link>
          </section>

          <section className="overview-grid" aria-label="Dashboard overview">
            <article className="overview-card">
              <div className="overview-icon icon-blue" aria-hidden="true">▣</div>
              <div className="overview-copy">
                <span>Total Events</span>
                <strong>5</strong>
                <small><b>+2</b> this month</small>
              </div>
            </article>
            <article className="overview-card">
              <div className="overview-icon icon-green" aria-hidden="true">◷</div>
              <div className="overview-copy">
                <span>Active Events</span>
                <strong>2</strong>
                <small><span className="status-dot" /> Ongoing</small>
              </div>
            </article>
            <article className="overview-card">
              <div className="overview-icon icon-violet" aria-hidden="true">♧</div>
              <div className="overview-copy">
                <span>Total Teams</span>
                <strong>48</strong>
                <small><b>+12</b> recent</small>
              </div>
            </article>
            <article className="overview-card">
              <div className="overview-icon icon-amber" aria-hidden="true">♙</div>
              <div className="overview-copy">
                <span>Total Judges</span>
                <strong>12</strong>
                <small><b>+3</b> recent</small>
              </div>
            </article>
          </section>

          <section className="dashboard-section">
            <div className="section-title-row">
              <div>
                <h2>My Events</h2>
                <p>Manage and track your competitions</p>
              </div>
            </div>
            <div className="events-grid">
              {events.map((event) => <EventCard key={event.name} event={event} />)}
            </div>
          </section>

          <section className="dashboard-section tracking-section">
            <div className="section-title-row">
              <div>
                <h2>Evaluation Tracking</h2>
                <p>Monitor progress across your active event</p>
              </div>
            </div>
            <div className="tracking-grid">
              <article className="tracking-card">
                <h3>Event Evaluation Progress</h3>
                <p className="tracking-event-name">Annual Innovation Hackathon 2026</p>
                <div className="ring-and-legend">
                  <ProgressRing value={72} label="Complete" />
                  <div className="legend-list">
                    <div><span className="legend-dot legend-completed" /><span>Completed</span><strong>36</strong></div>
                    <div><span className="legend-dot legend-pending" /><span>Pending</span><strong>10</strong></div>
                    <div><span className="legend-dot legend-not-started" /><span>Not Started</span><strong>4</strong></div>
                  </div>
                </div>
                <p className="tracking-footnote">36 / 50 evaluations completed</p>
              </article>

              <article className="tracking-card">
                <h3>Judge Progress</h3>
                <p className="tracking-event-name">Annual Innovation Hackathon 2026</p>
                <div className="ring-and-legend judge-ring-layout">
                  <ProgressRing value={81} label="Complete" />
                  <div className="legend-list">
                    <div><span className="legend-dot legend-completed" /><span>Completed</span></div>
                    <div><span className="legend-dot legend-in-progress" /><span>In Progress</span></div>
                    <div><span className="legend-dot legend-pending" /><span>Pending</span></div>
                  </div>
                </div>
                <p className="tracking-footnote">26 / 32 evaluations completed</p>
              </article>

              <article className="tracking-card judge-status-card">
                <h3>Judge-wise Status</h3>
                <div className="judge-table-wrap">
                  <table className="judge-table">
                    <thead>
                      <tr><th>Judge</th><th>Assigned</th><th>Completed</th><th>Progress</th></tr>
                    </thead>
                    <tbody>
                      {judges.map((judge) => (
                        <tr key={judge.name}>
                          <td>{judge.name}</td>
                          <td>{judge.assigned}</td>
                          <td>{judge.completed}</td>
                          <td>
                            <div className="judge-progress-cell">
                              <div className="judge-progress-track" role="progressbar" aria-label={`${judge.name} progress`} aria-valuenow={judge.progress} aria-valuemin="0" aria-valuemax="100">
                                <span style={{ width: `${judge.progress}%` }} />
                              </div>
                              <strong>{judge.progress}%</strong>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          </section>

          <section className="dashboard-section quick-actions-section">
            <div className="section-title-row">
              <div>
                <h2>Quick Actions</h2>
                <p>Common tasks to keep things moving</p>
              </div>
            </div>
            <div className="quick-actions-grid">
              {actions.map((action) => (
                <Link className="quick-action-card" to="/organizer/events" key={action.title}>
                  <span className="quick-action-icon" aria-hidden="true">{action.icon}</span>
                  <span className="quick-action-copy">
                    <strong>{action.title}</strong>
                    <small>{action.description}</small>
                  </span>
                  <span className="quick-action-arrow" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default OrganizerDashboard;
