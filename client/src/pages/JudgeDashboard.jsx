import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { readSavedCriteria, readSavedEvaluationSessions } from '../data/evaluationStorage';
import { readSavedTeams } from '../data/teamStorage';
import './EventManagement.css';
import './OrganizerJudges.css';
import './JudgeDashboard.css';

function getTeamId(team) {
  return String(team.id || team.number);
}

function JudgeDashboard() {
  const { eventId = 'default', judgeId } = useParams();
  const teamStorageKey = `scoreflow.organizer.event.${eventId}.teams`;
  const judgeStorageKey = `scoreflow.organizer.event.${eventId}.judges`;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const stored = window.localStorage.getItem('scoreflow.sidebar.collapsed');
      return stored === 'true';
    } catch {
      return false;
    }
  });
  const [teamData] = useState(() => readSavedTeams(teamStorageKey, eventId));
  const [criteria] = useState(() => readSavedCriteria(eventId).criteria);
  const [judges] = useState(() => {
    try {
      const stored = window.localStorage.getItem(judgeStorageKey);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('scoreflow.sidebar.collapsed', String(sidebarCollapsed));
    } catch {
      // storage unavailable; ignore silently
    }
  }, [sidebarCollapsed]);
  const judge = judges.find((item) => item.id === judgeId) || null;
  const assignedTeams = judge ? teamData.teams.filter((team) => (judge.teamIds || []).includes(getTeamId(team))) : [];
  const sessions = readSavedEvaluationSessions(eventId);

  if (!judge) {
    return (
      <div className="judge-dashboard-page">
        <div className="judge-dashboard-empty">
          <h1>Access denied</h1>
          <p>You are not assigned to this event or this judge profile.</p>
          <Link to="/organizer/events" className="judges-primary-button">Back to Events</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`judge-dashboard-page ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`event-sidebar ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Link to="/organizer/dashboard" className="event-brand" aria-label="ScoreFlow home">
          <span className="event-brand-mark">S</span>
          <span className="event-brand-text">ScoreFlow</span>
        </Link>
        <button
          type="button"
          className="event-sidebar-toggle"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setSidebarCollapsed((current) => !current)}
        >
          {sidebarCollapsed ? '⟩' : '⟨'}
        </button>
        <nav className="event-navigation" aria-label="Judge navigation">
          <Link to={`/judge/${eventId}/${judgeId}`} className="event-navigation-active" aria-current="page"><span aria-hidden="true">♙</span><span className="event-nav-label">Dashboard</span></Link>
          <Link to={`/organizer/events/${eventId}/judges`}><span aria-hidden="true">▣</span><span className="event-nav-label">Organizer</span></Link>
        </nav>
      </aside>

      <main className="judge-dashboard-main">
        <header className="event-topbar">
          <div className="judge-dashboard-header-copy">
            <p className="judges-context">Event dashboard</p>
            <h1>{judge.name}</h1>
          </div>
          <div className="judge-summary-pill">
            <span>Assigned Teams</span>
            <strong>{assignedTeams.length}</strong>
          </div>
        </header>

        <section className="judge-overview-card">
          <div>
            <span className="judges-eyebrow">JUDGE PROFILE</span>
            <h2>{judge.name}</h2>
            <p>{judge.email}</p>
          </div>
          <div>
            <span className="judges-eyebrow">CURRENT EVENT</span>
            <h2>{eventId}</h2>
          </div>
        </section>

        <section className="judge-dashboard-grid">
          {assignedTeams.length === 0 ? (
            <div className="judge-empty-state">No teams assigned yet. Please check back later.</div>
          ) : assignedTeams.map((team) => {
            const session = sessions.find((item) => item.eventId === eventId && item.judgeId === judge.id && item.teamId === getTeamId(team));
            const status = session?.status || 'NOT_STARTED';
            const sessionPath = `/organizer/events/${eventId}/judges/${judge.id}/evaluation/${getTeamId(team)}`;
            const completedCount = session && session.scores ? Object.keys(session.scores).length : 0;
            const criteriaCount = criteria.length;
            return (
              <article key={getTeamId(team)} className="judge-team-card">
                <div className="judge-team-header">
                  <div>
                    <span className="judge-team-number">Team {team.number}</span>
                    <h3>{team.name}</h3>
                  </div>
                  <span className={`judge-status judge-status-${status.toLowerCase()}`}>{status === 'COMPLETED' ? 'Completed' : status === 'IN_PROGRESS' ? 'In Progress' : 'Pending'}</span>
                </div>
                <p className="judge-project-name">{team.project}</p>
                <ul className="judge-member-list">
                  {team.members?.map((member) => <li key={`${team.id}-${member.name}`}>{member.name}</li>) || <li>No members listed</li>}
                </ul>
                <div className="judge-card-footer">
                  <div>
                    <strong>{completedCount}/{criteriaCount}</strong>
                    <span>Criteria</span>
                  </div>
                  <Link to={sessionPath} className="judges-primary-button">
                    {status === 'COMPLETED' ? 'Review' : status === 'IN_PROGRESS' ? 'Continue' : 'Start Evaluation'}
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}

export default JudgeDashboard;
