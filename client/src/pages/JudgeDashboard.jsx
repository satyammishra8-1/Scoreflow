import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import './EventManagement.css';
import './OrganizerJudges.css';
import './JudgeDashboard.css';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

const MODEL_LABELS = {
  'criteria-based': 'Criteria Based',
  'open-holistic': 'Overall / Holistic',
  'live-demo': 'Live Demo',
  'ranking-voting': 'Ranking',
  'remote-async': 'Remote / Async',
  custom: 'Custom',
};

function getId(value) {
  return String(value?._id || value?.id || value?.teamId || value?.judgeId || '');
}

function safeExternalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function JudgeDashboard() {
  const { eventId, judgeId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [event, setEvent] = useState(null);
  const [judge, setJudge] = useState(null);
  const [evaluationType, setEvaluationType] = useState('');
  const [teams, setTeams] = useState([]);
  const [evaluations, setEvaluations] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const [eventResponse, judgesResponse, teamsResponse, configResponse, evaluationsResponse] = await Promise.all([
          API.get(`/events/${encodeURIComponent(eventId)}`),
          API.get(`/events/${encodeURIComponent(eventId)}/judges`),
          API.get(`/events/${encodeURIComponent(eventId)}/teams`),
          API.get(`/events/${encodeURIComponent(eventId)}/evaluation-config`),
          API.get(`/events/${encodeURIComponent(eventId)}/evaluations`),
        ]);
        if (cancelled) return;

        const currentEvent = eventResponse.data?.data;
        const currentJudge = (Array.isArray(judgesResponse.data?.data) ? judgesResponse.data.data : [])
          .find((item) => getId(item) === String(judgeId) && String(item.eventId) === String(eventId));
        if (!currentJudge || !currentEvent) {
          setError('This judge or event could not be found.');
          return;
        }
        if (currentJudge.invitationStatus && currentJudge.invitationStatus !== 'accepted') {
          setError('Accept the judge invitation from your email before opening this dashboard.');
          return;
        }

        const assignedIds = new Set((currentJudge.assignedTeamIds || []).map(String));
        const assignedTeams = (Array.isArray(teamsResponse.data?.data) ? teamsResponse.data.data : [])
          .filter((team) => String(team.eventId) === String(eventId) && assignedIds.has(getId(team)));

        setEvent(currentEvent);
        setJudge(currentJudge);
        setEvaluationType(MODEL_LABELS[configResponse.data?.data?.model] || 'Not configured');
        setTeams(assignedTeams);
        setEvaluations(Array.isArray(evaluationsResponse.data?.data) ? evaluationsResponse.data.data : []);
      } catch (requestError) {
        if (!cancelled) setError(requestError?.response?.data?.error || 'Unable to load the judge dashboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();
    return () => { cancelled = true; };
  }, [eventId, judgeId]);

  if (loading) {
    return <main className="judge-dashboard-page"><div className="judge-dashboard-empty" role="status">Loading judge dashboard...</div></main>;
  }

  if (error) {
    return <main className="judge-dashboard-page"><div className="judge-dashboard-empty"><h1>Judge Dashboard</h1><p>{error}</p></div></main>;
  }

  return (
    <main className="judge-dashboard-page">
      <div className="judge-dashboard-main">
        <header className="judge-dashboard-header">
          <div className="judge-dashboard-header-copy">
            <p className="judges-context">Judge Dashboard</p>
            <h1>{event.name}</h1>
            <p>Judge: {judge.name}</p>
          </div>
          <div className="judge-evaluation-type">
            <span>Evaluation Type</span>
            <strong>{evaluationType}</strong>
          </div>
        </header>

        <h2 className="judge-assigned-heading">Assigned Teams</h2>
        {teams.length === 0 ? (
          <div className="judge-empty-state">No teams are assigned to you yet.</div>
        ) : (
          <section className="judge-dashboard-grid" aria-label="Assigned teams">
            {teams.map((team) => {
              const teamIdValue = getId(team);
              const evaluation = evaluations.find((item) => String(item.eventId) === String(eventId)
                && String(item.judgeId) === String(judgeId)
                && String(item.teamId) === teamIdValue);
              const completed = evaluation?.status === 'COMPLETED';
              const githubUrl = safeExternalUrl(team.githubUrl || team.github);
              const demoUrl = safeExternalUrl(team.demoUrl || team.demo);

              return (
                <article key={teamIdValue} className="judge-team-card">
                  <div className="judge-team-header">
                    <div>
                      <span className="judge-team-number">Team {team.teamNumber}</span>
                      <h3>{team.teamName}</h3>
                    </div>
                    <span className={`judge-status ${completed ? 'judge-status-completed' : 'judge-status-pending'}`}>
                      {completed ? 'Completed' : 'Pending'}
                    </span>
                  </div>

                  {team.project && <p className="judge-project-name">{team.project}</p>}
                  {(githubUrl || demoUrl) && (
                    <div className="judge-team-links">
                      {githubUrl && <a href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>}
                      {demoUrl && <a href={demoUrl} target="_blank" rel="noreferrer">Demo / Project</a>}
                    </div>
                  )}
                  <div className="judge-team-members">
                    <strong>Members</strong>
                    {team.members?.length ? (
                      <ul className="judge-member-list">
                        {team.members.map((member, index) => <li key={`${teamIdValue}-${member.email || index}`}>{member.name || 'Member'}</li>)}
                      </ul>
                    ) : <p>No members listed.</p>}
                  </div>

                  <Link
                    to={`/organizer/events/${eventId}/judges/${judgeId}/evaluation/${teamIdValue}`}
                    className="judges-primary-button"
                  >
                    {completed ? 'View Evaluation' : 'Start Evaluation'}
                  </Link>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

export default JudgeDashboard;
