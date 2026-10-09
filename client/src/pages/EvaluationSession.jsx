import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { readSavedCriteria, saveEvaluationSession } from '../data/evaluationStorage';
import './EvaluationSession.css';

function formatDuration(valueInSeconds) {
  const totalSeconds = Math.max(0, Number(valueInSeconds) || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (input) => String(input).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function readStoredSessions(eventId) {
  try {
    const stored = window.localStorage.getItem(`scoreflow.organizer.event.${eventId}.evaluationSessions`);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

function calculateWeightedTotal(scores, criteria) {
  if (!criteria.length) return 0;
  const total = criteria.reduce((sum, criterion) => {
    const mark = Number(scores[criterion.id] ?? 0); 
    const safeMark = Number.isFinite(mark) ? Math.min(Math.max(mark, 0), Number(criterion.maxMarks || 0)) : 0;
    return sum + ((safeMark / Number(criterion.maxMarks || 1)) * Number(criterion.weight || 0));
  }, 0);
  return Number(total.toFixed(2));
}

function EvaluationSession() {
  const { eventId = 'default', judgeId, teamId } = useParams();
  const initialCriteria = useMemo(() => readSavedCriteria(eventId).criteria, [eventId]);
  const [criteria, setCriteria] = useState(initialCriteria);
  const [teams] = useState(() => readStoredTeams(eventId));
  const [judges] = useState(() => readStoredJudges(eventId));
  const [session, setSession] = useState(() => {
    const sessions = readStoredSessions(eventId);
    const existing = sessions.find((item) => item.judgeId === judgeId && item.teamId === teamId);
    if (existing) {
      return {
        ...existing,
        scores: existing.scores || {},
        feedback: existing.feedback || '',
        attendance: existing.attendance || 'Present',
      };
    }
    return {
      id: `session-${Date.now()}`,
      eventId,
      teamId,
      judgeId,
      startedAt: Date.now(),
      completedAt: null,
      duration: 0,
      attendance: 'Present',
      scores: {},
      feedback: '',
      status: 'In Progress',
      totalScore: 0,
    };
  });
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    if (!session?.startedAt) return 0;
    const startedAt = Number(session.startedAt);
    return session.status === 'Completed' ? Number(session.duration || 0) : Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  });
  const [error, setError] = useState('');

  useEffect(() => {
    const nextCriteria = readSavedCriteria(eventId).criteria;
    setCriteria(nextCriteria);
  }, [eventId]);

  useEffect(() => {
    if (!session || session.status === 'Completed') return undefined;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - Number(session.startedAt || Date.now())) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session]);

  const team = teams.find((item) => String(item.id || item.number) === String(teamId));
  const judge = judges.find((item) => String(item.id) === String(judgeId));
  const assignedToJudge = judge && team && (judge.teamIds || []).includes(String(team.id || team.number));

  useEffect(() => {
    if (!team || !judge || !assignedToJudge) {
      setError('This judge is not assigned to the selected team for this event.');
      return;
    }
    setError('');
  }, [team, judge, assignedToJudge]);

  function persistSession(nextSession) {
    const stored = readStoredSessions(eventId);
    const filtered = stored.filter((item) => item.id !== nextSession.id);
    const finalSessions = [...filtered, nextSession];
    window.localStorage.setItem(`scoreflow.organizer.event.${eventId}.evaluationSessions`, JSON.stringify(finalSessions));
    setSession(nextSession);
  }

  function updateScore(criterionId, value) {
    const nextScores = { ...session.scores, [criterionId]: value };
    const nextSession = {
      ...session,
      scores: nextScores,
      totalScore: calculateWeightedTotal(nextScores, criteria),
    };
    persistSession(nextSession);
  }

  function completeEvaluation() {
    const total = calculateWeightedTotal(session.scores || {}, criteria);
    const nextSession = {
      ...session,
      attendance: session.attendance || 'Present',
      duration: elapsedSeconds,
      completedAt: Date.now(),
      status: 'Completed',
      totalScore: total,
    };
    persistSession(nextSession);

    const savedJudges = readStoredJudges(eventId);
    const updatedJudges = savedJudges.map((item) => item.id === judgeId
      ? { ...item, completedTeamIds: Array.from(new Set([...(item.completedTeamIds || []), String(teamId)])) }
      : item);
    window.localStorage.setItem(`scoreflow.organizer.event.${eventId}.judges`, JSON.stringify(updatedJudges));
  }

  function updateFeedback(value) {
    const nextSession = { ...session, feedback: value };
    persistSession(nextSession);
  }

  if (!team || !judge) {
    return (
      <div className="evaluation-session-page">
        <div className="evaluation-session-empty">
          <h1>Evaluation session unavailable</h1>
          <p>Select a valid assigned team from the judge assignment page.</p>
          <Link to={`/organizer/events/${eventId}/judges`} className="judges-primary-button">Back to Judges</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="evaluation-session-page">
      <aside className="event-sidebar">
        <Link to="/organizer/dashboard" className="event-brand"><span className="event-brand-mark">S</span><span>ScoreFlow</span></Link>
        <nav className="event-navigation" aria-label="Organizer navigation">
          <Link to="/organizer/dashboard"><span aria-hidden="true">▦</span>Dashboard</Link>
          <Link to="/organizer/events"><span aria-hidden="true">▣</span>Events</Link>
          <Link to={`/organizer/events/${eventId}/teams`}><span aria-hidden="true">♧</span>Teams</Link>
          <Link to={`/organizer/events/${eventId}/judges`}><span aria-hidden="true">♙</span>Judges</Link>
          <Link to={`/organizer/events/${eventId}/criteria`}><span aria-hidden="true">☷</span>Evaluation Criteria</Link>
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
              <strong>{formatDuration(elapsedSeconds)}</strong>
            </div>
          </div>
        </header>

        {error && <p className="judges-alert" role="alert">{error}</p>}

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
              <select value={session.attendance || 'Present'} onChange={(event) => persistSession({ ...session, attendance: event.target.value })}>
                <option>Present</option>
                <option>Virtual</option>
                <option>Absent</option>
              </select>
            </div>
            <div className="evaluation-meta-row">
              <span>Status</span>
              <strong>{session.status}</strong>
            </div>
            <div className="evaluation-total-box">
              <span>Total Score</span>
              <strong>{session.totalScore || calculateWeightedTotal(session.scores || {}, criteria)}/100</strong>
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
          <textarea rows="5" value={session.feedback || ''} onChange={(event) => updateFeedback(event.target.value)} placeholder="Share notes, strengths, improvements, or observations for the team." />
        </section>

        <div className="evaluation-actions">
          <Link className="judges-secondary-button" to={`/organizer/events/${eventId}/judges`}>Back to Judges</Link>
          <button type="button" className="judges-primary-button" onClick={completeEvaluation}>Complete Evaluation</button>
        </div>
      </main>
    </div>
  );
}

export default EvaluationSession;
