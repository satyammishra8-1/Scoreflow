import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { readSavedEvaluationSessions } from '../data/evaluationStorage';
import './EventManagement.css';
import './OrganizerJudges.css';
import './JudgeDashboard.css';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

function getTeamId(team) {
  return String(team.id || team.teamId || team.number || team.teamNumber);
}

function toUiJudge(apiJudge) {
  if (!apiJudge || typeof apiJudge !== 'object') return null;
  return {
    ...apiJudge,
    id: apiJudge.judgeId,
    teamIds: Array.isArray(apiJudge.assignedTeamIds) ? apiJudge.assignedTeamIds : [],
  };
}

function extractCriteria(config) {
  if (!config) return [];
  if (Array.isArray(config.criteriaBased?.criteria)) return config.criteriaBased.criteria;
  if (Array.isArray(config.liveDemo?.criteria)) return config.liveDemo.criteria;
  return [];
}

function JudgeDashboard() {
  const { eventId = 'default', judgeId } = useParams();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const stored = window.localStorage.getItem('scoreflow.sidebar.collapsed');
      return stored === 'true';
    } catch {
      return false;
    }
  });
  const [judges, setJudges] = useState([]);
  const [judgesLoading, setJudgesLoading] = useState(true);
  const [judgesError, setJudgesError] = useState('');
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');
  const [evaluationConfig, setEvaluationConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadJudges() {
      try {
        const response = await API.get(`/events/${encodeURIComponent(eventId)}/judges`);
        if (!cancelled) {
          const list = Array.isArray(response.data?.data) ? response.data.data : [];
          setJudges(list.map(toUiJudge).filter(Boolean));
        }
      } catch (err) {
        if (!cancelled) {
          const message = err?.response?.data?.error;
          setJudgesError(
            typeof message === 'string' && message.trim()
              ? message
              : 'Unable to load judges. Please try again.',
          );
        }
      } finally {
        if (!cancelled) setJudgesLoading(false);
      }
    }

    loadJudges();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTeams() {
      try {
        const response = await API.get(`/events/${encodeURIComponent(eventId)}/teams`);
        if (!cancelled) {
          const list = Array.isArray(response.data?.data) ? response.data.data : [];
          setTeams(
            list.map((team) => ({
              ...team,
              id: team.teamId,
              number: team.teamNumber,
              name: team.teamName,
            })),
          );
        }
      } catch (err) {
        if (!cancelled) {
          const message = err?.response?.data?.error;
          setTeamsError(
            typeof message === 'string' && message.trim()
              ? message
              : 'Unable to load teams. Please try again.',
          );
        }
      } finally {
        if (!cancelled) setTeamsLoading(false);
      }
    }

    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;

    async function loadEvaluationConfig() {
      try {
        const response = await API.get(`/events/${encodeURIComponent(eventId)}/evaluation-config`);
        if (!cancelled) {
          const config = response.data?.data ?? null;
          setEvaluationConfig(config);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err?.response?.data?.error;
          setConfigError(
            typeof message === 'string' && message.trim()
              ? message
              : 'Unable to load evaluation configuration. Please try again.',
          );
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    }

    loadEvaluationConfig();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    try {
      window.localStorage.setItem('scoreflow.sidebar.collapsed', String(sidebarCollapsed));
    } catch {
      // storage unavailable; ignore silently
    }
  }, [sidebarCollapsed]);
  const loading = judgesLoading || teamsLoading || configLoading;
  const error = judgesError || teamsError || configError;

  const criteria = extractCriteria(evaluationConfig);
  const judge = judges.find((item) => item.id === judgeId) || null;
  const assignedTeams = judge ? teams.filter((team) => (judge.teamIds || []).includes(getTeamId(team))) : [];
  const sessions = readSavedEvaluationSessions(eventId);

  if (loading) {
    return (
      <div className="judge-dashboard-page">
        <div className="judge-dashboard-empty">
          <p role="status">Loading judge profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="judge-dashboard-page">
        <div className="judge-dashboard-empty">
          <h1>Unable to load judge</h1>
          <p>{error}</p>
          <Link to="/organizer/events" className="judges-primary-button">Back to Events</Link>
        </div>
      </div>
    );
  }

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
