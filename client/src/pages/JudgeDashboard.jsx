
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api as API } from '../auth/api';
import { useAuth } from '../auth/useAuth';
import './EventManagement.css';
import './OrganizerJudges.css';
import './JudgeDashboard.css';

const MODEL_LABELS = {
  'criteria-based': 'Criteria Based',
  'open-holistic': 'Overall / Holistic',
  'live-demo': 'Live Demo',
  'ranking-voting': 'Ranking',
  'remote-async': 'Remote / Async',
  custom: 'Custom',
};

function getId(value) {
  return String(
    value?._id || value?.id || value?.teamId || value?.judgeId || ''
  );
}

function safeExternalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol)
      ? url.toString()
      : '';
  } catch {
    return '';
  }
}

function JudgeDashboard() {
  const { signOut } = useAuth();
  const { eventId, judgeId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [event, setEvent] = useState(null);
  const [judge, setJudge] = useState(null);
  const [evaluationType, setEvaluationType] = useState('');
  const [teams, setTeams] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const [
          eventResponse,
          judgeResponse,
          teamsResponse,
          configResponse,
          evaluationsResponse,
        ] = await Promise.all([
          API.get(`/events/${encodeURIComponent(eventId)}`),
          API.get(`/auth/judge/events/${encodeURIComponent(eventId)}`),
          API.get(`/events/${encodeURIComponent(eventId)}/teams`),
          API.get(`/events/${encodeURIComponent(eventId)}/evaluation-config`),
          API.get(`/events/${encodeURIComponent(eventId)}/evaluations`),
        ]);

        if (cancelled) return;

        const currentEvent = eventResponse.data?.data;
        const currentJudge = judgeResponse.data?.data;

        if (!currentJudge || !currentEvent) {
          setError('This judge or event could not be found.');
          return;
        }

        if (
          getId(currentJudge) !== String(judgeId) ||
          String(currentJudge?.eventId) !== String(eventId)
        ) {
          setError('This judge or event could not be found.');
          return;
        }

        if (
          currentJudge.invitationStatus &&
          currentJudge.invitationStatus !== 'accepted'
        ) {
          setError(
            'Accept the judge invitation from your email before opening this dashboard.'
          );
          return;
        }

        const assignedIds = new Set(
          (currentJudge.assignedTeamIds || []).map(String)
        );

        const assignedTeams = (
          Array.isArray(teamsResponse.data?.data)
            ? teamsResponse.data.data
            : []
        ).filter(
          (team) =>
            String(team.eventId) === String(eventId) &&
            assignedIds.has(getId(team))
        );

        setEvent(currentEvent);
        setJudge(currentJudge);
        setEvaluationType(
          MODEL_LABELS[configResponse.data?.data?.model] ||
          'Not configured'
        );
        setTeams(assignedTeams);
        setEvaluations(
          Array.isArray(evaluationsResponse.data?.data)
            ? evaluationsResponse.data.data
            : []
        );
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError?.response?.data?.error ||
            'Unable to load the judge dashboard.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [eventId, judgeId]);

  const teamEvaluationMap = useMemo(() => {
    const map = new Map();

    teams.forEach((team) => {
      const teamId = getId(team);

      const evaluation = evaluations.find(
        (item) =>
          String(item.eventId) === String(eventId) &&
          String(item.judgeId) === String(judgeId) &&
          String(item.teamId) === teamId
      );

      map.set(teamId, evaluation);
    });

    return map;
  }, [teams, evaluations, eventId, judgeId]);

  const completedCount = teams.filter(
    (team) => teamEvaluationMap.get(getId(team))?.status === 'COMPLETED'
  ).length;

  const pendingCount = teams.length - completedCount;
  const progress = teams.length
    ? Math.round((completedCount / teams.length) * 100)
    : 0;

  const filteredTeams = teams.filter((team) => {
    const completed =
      teamEvaluationMap.get(getId(team))?.status === 'COMPLETED';

    const matchesFilter =
      filter === 'all' ||
      (filter === 'completed' && completed) ||
      (filter === 'pending' && !completed);

    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      String(team.teamName || '').toLowerCase().includes(query) ||
      String(team.project || '').toLowerCase().includes(query) ||
      String(team.teamNumber || '').toLowerCase().includes(query);

    return matchesFilter && matchesSearch;
  });

  if (loading) {
    return (
      <main className="judge-dashboard-page">
        <div className="judge-loading-card" role="status">
          <div className="judge-loading-spinner" />
          <h2>Preparing your judging workspace</h2>
          <p>Loading your event and assigned teams...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="judge-dashboard-page">
        <div className="judge-error-card">
          <span className="judge-error-icon">!</span>
          <h1>Dashboard unavailable</h1>
          <p>{error}</p>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="judge-dashboard-page">
      <div className="judge-dashboard-main">

        <header className="judge-topbar">
          <Link to={`/judge/${eventId}/${judgeId}`} className="judge-brand">
            <span className="judge-brand-mark">S</span>
            <span>ScoreFlow</span>
          </Link>

          <div className="judge-profile">
            <div className="judge-avatar">
              {(judge?.name || 'J').charAt(0).toUpperCase()}
            </div>
            <div className="judge-profile-info">
              <strong>{judge.name}</strong>
              <span>Event Judge</span>
            </div>
            <button
              className="judge-signout-button"
              type="button"
              onClick={signOut}
            >
              Sign out
            </button>
          </div>
        </header>

        <section className="judge-welcome">
          <div className="judge-welcome-copy">
            <span className="judge-eyebrow">
              <span className="judge-live-dot" />
              JUDGING WORKSPACE
            </span>
            <h1>Welcome, {judge.name?.split(' ')[0] || 'Judge'}!</h1>
            <p>
              Review projects, evaluate teams and share your expert feedback.
              Your assigned teams are ready below.
            </p>
          </div>

          <div className="judge-event-panel">
            <span>YOUR EVENT</span>
            <strong>{event.name}</strong>
            <div className="judge-event-type">
              <span>Evaluation model</span>
              <b>{evaluationType}</b>
            </div>
          </div>
        </section>

        <section className="judge-stats-grid" aria-label="Evaluation overview">
          <article className="judge-stat-card">
            <span className="judge-stat-icon judge-stat-blue">T</span>
            <div>
              <span>Assigned teams</span>
              <strong>{teams.length}</strong>
              <small>Teams assigned to you</small>
            </div>
          </article>

          <article className="judge-stat-card">
            <span className="judge-stat-icon judge-stat-green">✓</span>
            <div>
              <span>Completed</span>
              <strong>{completedCount}</strong>
              <small>Evaluations submitted</small>
            </div>
          </article>

          <article className="judge-stat-card">
            <span className="judge-stat-icon judge-stat-orange">◷</span>
            <div>
              <span>Pending</span>
              <strong>{pendingCount}</strong>
              <small>Awaiting your evaluation</small>
            </div>
          </article>
        </section>

        <section className="judge-progress-panel">
          <div className="judge-progress-heading">
            <div>
              <span className="judge-section-eyebrow">YOUR PROGRESS</span>
              <h2>Evaluation progress</h2>
            </div>
            <strong>{progress}%</strong>
          </div>

          <div
            className="judge-progress-track"
            role="progressbar"
            aria-label="Evaluation completion"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="judge-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p>
            {completedCount} of {teams.length} assigned teams evaluated
          </p>
        </section>

        <section className="judge-teams-section">
          <div className="judge-teams-heading">
            <div>
              <span className="judge-section-eyebrow">YOUR ASSIGNMENTS</span>
              <h2>Assigned teams</h2>
              <p>Open a team to review its project and submit your evaluation.</p>
            </div>
            <span className="judge-team-count">
              {teams.length} {teams.length === 1 ? 'team' : 'teams'}
            </span>
          </div>

          {teams.length > 0 && (
            <div className="judge-team-toolbar">
              <div className="judge-search-box">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search team or project..."
                  aria-label="Search assigned teams"
                />
              </div>

              <div className="judge-filter-tabs" aria-label="Filter teams">
                {[
                  { value: 'all', label: 'All teams' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'completed', label: 'Completed' },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={filter === item.value ? 'active' : ''}
                    onClick={() => setFilter(item.value)}
                    aria-pressed={filter === item.value}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {teams.length === 0 ? (
            <div className="judge-empty-state">
              <span className="judge-empty-icon">T</span>
              <h3>No teams assigned yet</h3>
              <p>
                Your organizer has not assigned any teams to you.
                Check back once assignments are available.
              </p>
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className="judge-empty-state">
              <h3>No matching teams</h3>
              <p>Try changing your search or selected filter.</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFilter('all');
                }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="judge-dashboard-grid">
              {filteredTeams.map((team) => {
                const teamIdValue = getId(team);
                const evaluation = teamEvaluationMap.get(teamIdValue);
                const completed = evaluation?.status === 'COMPLETED';
                const githubUrl = safeExternalUrl(
                  team.githubUrl || team.github
                );
                const demoUrl = safeExternalUrl(
                  team.demoUrl || team.demo
                );

                return (
                  <article
                    key={teamIdValue}
                    className={`judge-team-card ${
                      completed ? 'is-completed' : 'is-pending'
                    }`}
                  >
                    <div className="judge-team-header">
                      <div className="judge-team-identity">
                        <span className="judge-team-number">
                          TEAM {team.teamNumber}
                        </span>
                        <h3>{team.teamName}</h3>
                      </div>

                      <span
                        className={`judge-status ${
                          completed
                            ? 'judge-status-completed'
                            : 'judge-status-pending'
                        }`}
                      >
                        <span className="judge-status-dot" />
                        {completed ? 'Completed' : 'Pending'}
                      </span>
                    </div>

                    <div className="judge-team-content">
                      {team.project ? (
                        <div className="judge-project-block">
                          <span>PROJECT</span>
                          <p>{team.project}</p>
                        </div>
                      ) : (
                        <p className="judge-project-placeholder">
                          Project details not provided.
                        </p>
                      )}

                      <div className="judge-team-members">
                        <strong>
                          Team members
                          <span>{team.members?.length || 0}</span>
                        </strong>

                        {team.members?.length ? (
                          <ul className="judge-member-list">
                            {team.members.map((member, index) => (
                              <li
                                key={`${teamIdValue}-${member.email || index}`}
                              >
                                <span className="judge-member-avatar">
                                  {(member.name || 'M')
                                    .charAt(0)
                                    .toUpperCase()}
                                </span>
                                <span className="judge-member-details">
                                  <b>{member.name || 'Member'}</b>
                                  {member.email && (
                                    <small>{member.email}</small>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No members listed.</p>
                        )}
                      </div>

                      {(githubUrl || demoUrl) && (
                        <div className="judge-team-links">
                          {githubUrl && (
                            <a
                              href={githubUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              ↗ GitHub repository
                            </a>
                          )}
                          {demoUrl && (
                            <a
                              href={demoUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              ↗ Live demo
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="judge-card-footer">
                      <span>
                        {completed
                          ? 'Your evaluation is submitted'
                          : 'Evaluation is waiting for you'}
                      </span>

                      <Link
                        to={`/judge/${eventId}/${judgeId}/evaluation/${teamIdValue}`}
                        className="judge-evaluate-button"
                      >
                        {completed ? 'View evaluation' : 'Start evaluation'}
                        <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="judge-dashboard-footer">
          <span>ScoreFlow</span>
          <span>Fair evaluation. Better feedback.</span>
        </footer>
      </div>
    </main>
  );
}

export default JudgeDashboard;
