import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  calculateRawTotal,
  calculateWeightedScore,
  readSavedCriteria,
  readSavedEvaluationSessions,
} from '../data/evaluationStorage';
import './EvaluationSession.css';

function formatDuration(valueInSeconds) {
  const totalSeconds = Math.max(0, Number(valueInSeconds) || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (input) => String(input).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function readStoredTeams(eventId) {
  try {
    const stored = window.localStorage.getItem(`scoreflow.organizer.event.${eventId}.teams`);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readStoredJudges(eventId) {
  try {
    const stored = window.localStorage.getItem(`scoreflow.organizer.event.${eventId}.judges`);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getCurrentTimestamp() {
  return Date.now();
}

function getElapsedSecondsSince(startedAt) {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((getCurrentTimestamp() - Number(startedAt)) / 1000));
}

function EvaluationSession({ eventId = 'default', judgeId, teamId }) {
  const [searchParams] = useSearchParams();
  const isAdminMode = searchParams.get('mode') === 'admin';
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const stored = window.localStorage.getItem('scoreflow.sidebar.collapsed');
      return stored === 'true';
    } catch {
      return false;
    }
  });
  const criteria = useMemo(() => readSavedCriteria(eventId).criteria, [eventId]);
  const [teams] = useState(() => readStoredTeams(eventId));
  const [judges] = useState(() => readStoredJudges(eventId));

  useEffect(() => {
    try {
      window.localStorage.setItem('scoreflow.sidebar.collapsed', String(sidebarCollapsed));
    } catch {
      // storage unavailable; ignore silently
    }
  }, [sidebarCollapsed]);
  const [session, setSession] = useState(() => {
    const sessions = readSavedEvaluationSessions(eventId);
    const existing = sessions.find((item) => item.judgeId === judgeId && item.teamId === teamId);
    if (existing) {
      return {
        ...existing,
        attendance: existing.attendance || 'Present',
        scores: existing.scores || {},
        feedback: existing.feedback || '',
        status: existing.status || 'NOT_STARTED',
      };
    }
    return {
      id: `session-${getCurrentTimestamp()}`,
      eventId,
      teamId,
      judgeId,
      startedAt: getCurrentTimestamp(),
      completedAt: null,
      duration: 0,
      attendance: 'Present',
      scores: {},
      totalScore: 0,
      weightedScore: 0,
      feedback: '',
      status: 'NOT_STARTED',
    };
  });
  const [elapsedSeconds, setElapsedSeconds] = useState(() => Number(session.duration || 0));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (session.status === 'COMPLETED' || !session.startedAt) {
      return undefined;
    }

    const updateElapsed = () => {
      setElapsedSeconds(getElapsedSecondsSince(session.startedAt));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [session.status, session.startedAt]);

  const displayDuration = session.status === 'COMPLETED' ? Number(session.duration || 0) : elapsedSeconds;

  const team = teams.find((item) => String(item.id || item.number) === String(teamId));
  const judge = judges.find((item) => String(item.id) === String(judgeId));
  const assignedToJudge = judge && team && (judge.teamIds || []).includes(String(team.id || team.number));
  const isReadOnly = session.status === 'COMPLETED' && !isAdminMode;

  function persistSession(nextSession) {
    const normalized = {
      ...nextSession,
      totalScore: calculateRawTotal(nextSession.scores || {}, criteria),
      weightedScore: calculateWeightedScore(nextSession.scores || {}, criteria),
      duration: Number(nextSession.duration || 0),
      status: nextSession.status || 'NOT_STARTED',
    };
    const stored = readSavedEvaluationSessions(eventId);
    const filtered = stored.filter((item) => item.id !== normalized.id);
    const finalSessions = [...filtered, normalized];
    window.localStorage.setItem(`scoreflow.organizer.event.${eventId}.evaluationSessions`, JSON.stringify(finalSessions));
    setSession(normalized);
    setError('');
    setSuccess('');
  }

  function updateScore(criterionId, rawValue) {
    if (isReadOnly) return;
    const criterion = criteria.find((item) => item.id === criterionId);
    if (!criterion) return;
    const numericValue = Number(rawValue);
    const safeValue = Number.isFinite(numericValue) ? Math.min(Math.max(numericValue, 0), Number(criterion.maxMarks || 0)) : 0;
    const nextScores = { ...session.scores, [criterionId]: safeValue };
    const nextSession = {
      ...session,
      scores: nextScores,
      totalScore: calculateRawTotal(nextScores, criteria),
      weightedScore: calculateWeightedScore(nextScores, criteria),
      status: session.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
      duration: elapsedSeconds,
      startedAt: session.startedAt || getCurrentTimestamp(),
    };
    persistSession(nextSession);
  }

  function updateFeedback(value) {
    if (isReadOnly) return;
    const nextSession = { ...session, feedback: value, status: session.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS' };
    persistSession(nextSession);
  }

  function submitEvaluation() {
    const missingCriteria = criteria.filter((criterion) => {
      const value = Number(session.scores?.[criterion.id] ?? -1);
      return value < 0 || value > Number(criterion.maxMarks || 0);
    });

    if (criteria.length > 0 && missingCriteria.length > 0) {
      setError('Each criterion must have a valid score between 0 and its maximum marks.');
      return;
    }

    if (!session.feedback || !session.feedback.trim()) {
      setError('Overall feedback is required before completion.');
      return;
    }

    const nextSession = {
      ...session,
      attendance: session.attendance || 'Present',
      duration: elapsedSeconds,
      completedAt: getCurrentTimestamp(),
      status: 'COMPLETED',
      totalScore: calculateRawTotal(session.scores || {}, criteria),
      weightedScore: calculateWeightedScore(session.scores || {}, criteria),
    };
    persistSession(nextSession);
    setSuccess('Evaluation submitted successfully.');
  }

  function reopenEvaluation() {
    const nextSession = {
      ...session,
      completedAt: null,
      duration: elapsedSeconds,
      status: 'IN_PROGRESS',
    };
    persistSession(nextSession);
    setSuccess('Evaluation reopened for edits.');
  }

  if (!team || !judge || !assignedToJudge) {
    return (
      <div className="evaluation-session-page">
        <div className="evaluation-session-empty">
          <h1>Evaluation is unavailable</h1>
          <p>This team is not assigned to this judge for this event.</p>
          <Link to={`/organizer/events/${eventId}/judges`} className="judges-primary-button">Back to Judges</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`evaluation-session-page ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
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
          <Link to={`/judge/${eventId}/${judgeId}`}><span aria-hidden="true">♙</span><span className="event-nav-label">Judge Dashboard</span></Link>
          <Link to={`/organizer/events/${eventId}/judges`}><span aria-hidden="true">▣</span><span className="event-nav-label">Judges</span></Link>
          <Link to={`/organizer/events/${eventId}/criteria`}><span aria-hidden="true">☷</span><span className="event-nav-label">Criteria</span></Link>
        </nav>
      </aside>

      <main className="evaluation-session-main">
        <header className="event-topbar">
          <div className="evaluation-session-heading">
            <div>
              <p className="judges-context">Evaluation session</p>
              <h1>{team.name}</h1>
            </div>
            <div className="evaluation-session-timer">
              <span>Timer</span>
              <strong>{formatDuration(displayDuration)}</strong>
            </div>
          </div>
        </header>

        {error && <p className="judges-alert" role="alert">{error}</p>}
        {success && <p className="judges-alert judges-alert-success" role="status">{success}</p>}

        {session.status === 'COMPLETED' && !isAdminMode && (
          <div className="evaluation-locked-banner">
            <strong>Evaluation Completed</strong>
            <span>Submitted at: {session.completedAt ? new Date(session.completedAt).toLocaleString() : '—'}</span>
            <small>This evaluation is locked for judges. Please contact the organizer for corrections.</small>
          </div>
        )}

        <section className="evaluation-panel">
          <div className="evaluation-card team-overview">
            <h2>Team Information</h2>
            <dl>
              <div><dt>Team Number</dt><dd>{team.number}</dd></div>
              <div><dt>Team Name</dt><dd>{team.name}</dd></div>
              <div><dt>Project</dt><dd>{team.project}</dd></div>
              <div><dt>Members</dt><dd>{team.members?.map((member) => member.name).join(', ') || '—'}</dd></div>
              <div><dt>GitHub</dt><dd>{team.github || '—'}</dd></div>
              <div><dt>Demo</dt><dd>{team.demo || '—'}</dd></div>
            </dl>
          </div>

          <div className="evaluation-card judge-overview">
            <h2>Evaluation</h2>
            <div className="evaluation-meta-row">
              <span>Judge</span>
              <strong>{judge.name}</strong>
            </div>
            <div className="evaluation-meta-row">
              <span>Attendance</span>
              {isReadOnly ? (
                <strong>{session.attendance || 'Present'}</strong>
              ) : (
                <select value={session.attendance || 'Present'} onChange={(event) => persistSession({ ...session, attendance: event.target.value, status: 'IN_PROGRESS' })}>
                  <option>Present</option>
                  <option>Virtual</option>
                  <option>Absent</option>
                </select>
              )}
            </div>
            <div className="evaluation-meta-row">
              <span>Status</span>
              <strong>{session.status}</strong>
            </div>
            <div className="evaluation-total-box">
              <span>Weighted Score</span>
              <strong>{session.weightedScore || calculateWeightedScore(session.scores || {}, criteria)}/100</strong>
            </div>
          </div>
        </section>

        <section className="evaluation-card scores-card">
          <h2>Score Criteria</h2>
          {criteria.length === 0 ? (
            <p className="judges-empty-message">No evaluation criteria are configured for this event.</p>
          ) : (
            <div className="score-grid">
              {criteria.map((criterion) => {
                const current = Number(session.scores?.[criterion.id] ?? 0);
                return (
                  <label className="score-row" key={criterion.id}>
                    <div>
                      <strong>{criterion.name}</strong>
                      <small>{criterion.description || 'No description provided.'}</small>
                    </div>
                    <div className="score-controls">
                      <input
                        type="number"
                        min="0"
                        max={criterion.maxMarks}
                        step="0.5"
                        value={current}
                        readOnly={isReadOnly}
                        onChange={(event) => updateScore(criterion.id, event.target.value)}
                      />
                      <span>/{criterion.maxMarks}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        <section className="evaluation-card feedback-card">
          <h2>Feedback</h2>
          <textarea
            rows="5"
            value={session.feedback || ''}
            readOnly={isReadOnly}
            onChange={(event) => updateFeedback(event.target.value)}
            placeholder="Share notes, strengths, improvements, or observations for the team."
          />
        </section>

        <div className="evaluation-actions">
          <Link className="judges-secondary-button" to={`/judge/${eventId}/${judgeId}`}>Back to Dashboard</Link>
          {isAdminMode && session.status === 'COMPLETED' && (
            <button type="button" className="judges-secondary-button" onClick={reopenEvaluation}>Reopen Evaluation</button>
          )}
          {!isReadOnly && (
            <button type="button" className="judges-primary-button" onClick={submitEvaluation}>Complete Evaluation</button>
          )}
          {isAdminMode && session.status !== 'COMPLETED' && (
            <button type="button" className="judges-primary-button" onClick={submitEvaluation}>Save Corrections</button>
          )}
        </div>
      </main>
    </div>
  );
}

export default EvaluationSession;
