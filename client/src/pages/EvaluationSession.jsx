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



function getMemberAttendanceKey(member) {

  if (typeof member.email === 'string' && member.email.trim()) return `email:${member.email.trim().toLowerCase()}`;

  if (typeof member.id === 'string' && member.id.trim()) return `id:${member.id.trim()}`;

  if (typeof member.id === 'number') return `id:${member.id}`;

  if (typeof member.usn === 'string' && member.usn.trim()) return `usn:${member.usn.trim().toLowerCase()}`;

  return `name:${String(member.name || '').trim().toLowerCase()}`;

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

      startedAt: null,

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
    if (session.status !== 'IN_PROGRESS' || !session.startedAt) {
      setElapsedSeconds(Number(session.duration || 0));
      return undefined;
    }

    const updateElapsed = () => {
      setElapsedSeconds(
        Number(session.duration || 0) + getElapsedSecondsSince(session.startedAt),
      );
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [session.status, session.startedAt, session.duration]);

  const displayDuration =
    session.status === 'IN_PROGRESS'
      ? Number(session.duration || 0) + getElapsedSecondsSince(session.startedAt)
      : Number(elapsedSeconds || session.duration || 0);

  function startTimer() {
    if (isReadOnly || session.status === 'IN_PROGRESS') return;

    const nextSession = {
      ...session,
      startedAt: getCurrentTimestamp(),
      status: 'IN_PROGRESS',
    };

    persistSession(nextSession);
    setElapsedSeconds(Number(session.duration || 0));
  }

  function pauseTimer() {
    if (isReadOnly || session.status !== 'IN_PROGRESS') return;

    const currentElapsed =
      Number(session.duration || 0) + getElapsedSecondsSince(session.startedAt);

    const nextSession = {
      ...session,
      startedAt: null,
      duration: currentElapsed,
      status: 'PAUSED',
    };

    persistSession(nextSession);
    setElapsedSeconds(currentElapsed);
  }

  const completedCriteriaCount = criteria.filter((criterion) => {

    const value = Number(session.scores?.[criterion.id] ?? -1);

    return value >= 0 && value <= Number(criterion.maxMarks || 0);

  }).length;

  const totalCriteriaCount = criteria.length;

  const progressPercent = totalCriteriaCount === 0 ? 0 : Math.round((completedCriteriaCount / totalCriteriaCount) * 100);

  const rawTotal = calculateRawTotal(session.scores || {}, criteria);

  const weightedScore = calculateWeightedScore(session.scores || {}, criteria);



  const team = teams.find((item) => String(item.id || item.number) === String(teamId));

  const judge = judges.find((item) => String(item.id) === String(judgeId));

  const assignedToJudge = judge && team && (judge.teamIds || []).includes(String(team.id || team.number));

  const teamMembers = Array.isArray(team?.members) ? team.members : [];

  const memberAttendance = teamMembers.map((member) => {

    const legacyStatus = session.attendance === 'Absent' ? 'ABSENT' : 'PRESENT';

    const status = session.memberAttendance?.[getMemberAttendanceKey(member)] || legacyStatus;

    return { member, key: getMemberAttendanceKey(member), status };

  });

  const presentMemberCount = memberAttendance.filter(({ status }) => status === 'PRESENT').length;

  const isReadOnly = session.status === 'COMPLETED';

  const isEvaluationReady = totalCriteriaCount > 0

    && completedCriteriaCount === totalCriteriaCount

    && Boolean(session.feedback?.trim());



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

      status: session.status,

      duration: displayDuration,

      startedAt: session.startedAt,

    };

    persistSession(nextSession);

  }



  function updateFeedback(value) {

    if (isReadOnly) return;

    const nextSession = { ...session, feedback: value };

    persistSession(nextSession);

  }



  function updateMemberAttendance(memberKey, nextAttendance) {

    if (isReadOnly) return;

    const currentAttendance = Object.fromEntries(

      memberAttendance.map(({ key, status }) => [key, status]),

    );

    persistSession({

      ...session,

      memberAttendance: { ...currentAttendance, [memberKey]: nextAttendance },

      status: session.status,

      duration: displayDuration,

    });

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

      duration: displayDuration,

      startedAt: null,

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

      duration: Number(session.duration || 0),

      startedAt: null,

      status: 'PAUSED',

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

            <div className={`evaluation-session-timer timer-${session.status.toLowerCase()}`}>
              <div className="evaluation-timer-topline">
                <span>Evaluation Timer</span>
                <span className="evaluation-timer-status">
                  <span className="evaluation-timer-status-dot" aria-hidden="true" />
                  {session.status === 'IN_PROGRESS'
                    ? 'Recording'
                    : session.status === 'PAUSED'
                      ? 'Paused'
                      : session.status === 'COMPLETED'
                        ? 'Completed'
                        : 'Not Started'}
                </span>
              </div>
              <strong>{formatDuration(displayDuration)}</strong>
              {!isReadOnly && (
                <div className="evaluation-timer-actions">
                  {session.status === 'NOT_STARTED' && (
                    <button type="button" className="evaluation-timer-button primary" onClick={startTimer}>
                      Start Evaluation
                    </button>
                  )}
                  {session.status === 'IN_PROGRESS' && (
                    <button type="button" className="evaluation-timer-button" onClick={pauseTimer}>
                      Pause
                    </button>
                  )}
                  {session.status === 'PAUSED' && (
                    <button type="button" className="evaluation-timer-button primary" onClick={startTimer}>
                      Resume
                    </button>
                  )}
                </div>
              )}
            </div>

          </div>

        </header>



        {error && <p className="judges-alert" role="alert">{error}</p>}

        {success && <p className="judges-alert judges-alert-success" role="status">{success}</p>}



        {session.status === 'COMPLETED' && (

          <div className="evaluation-locked-banner">

            <strong>🔒 Evaluation Completed</strong>

            <span>Submitted at: {session.completedAt ? new Date(session.completedAt).toLocaleString() : '—'}</span>

            <small>{isAdminMode ? 'This evaluation is locked. Reopen it to make corrections.' : 'This evaluation is locked for judges. Please contact the organizer for corrections.'}</small>

          </div>

        )}



        <section className="evaluation-panel">

          <div className="evaluation-card team-overview">

            <div className="evaluation-section-header">

              <h2>Team Information</h2>

              <span className="evaluation-status-badge">{session.status === 'COMPLETED' ? 'Completed' : session.status === 'IN_PROGRESS' ? 'Recording' : session.status === 'PAUSED' ? 'Paused' : 'Not Started'}</span>

            </div>

            <dl>

              <div><dt>Team Number</dt><dd>{team.number || 'Not provided'}</dd></div>

              <div><dt>Team Name</dt><dd>{team.name || 'Not provided'}</dd></div>

              <div><dt>Project Name</dt><dd>{team.project || 'Not provided'}</dd></div>

              <div>

                <dt>Members</dt>

                <dd>

                  {team.members?.length ? (

                    <ul className="team-member-list">

                      {team.members.map((member, index) => (

                        <li key={`${member.name || 'member'}-${member.email || index}`}>

                          <strong>{member.name || 'Member'}</strong>

                          <span>{member.email || 'Email not provided'}</span>

                        </li>

                      ))}

                    </ul>

                  ) : 'Not provided'}

                </dd>

              </div>

              <div>

                <dt>GitHub</dt>

                <dd>{team.github ? <a className="team-resource-link" href={team.github} target="_blank" rel="noreferrer">View GitHub</a> : 'Not provided'}</dd>

              </div>

              <div>

                <dt>Demo</dt>

                <dd>{team.demo ? <a className="team-resource-link" href={team.demo} target="_blank" rel="noreferrer">Open Demo</a> : 'Not provided'}</dd>

              </div>

            </dl>



            <div className="member-attendance-panel">

              <div className="member-attendance-header">

                <div>

                  <h3>Team Attendance</h3>

                  <p>{teamMembers.length} {teamMembers.length === 1 ? 'Member' : 'Members'}</p>

                </div>

                <span className="member-attendance-summary">

                  Attendance: {presentMemberCount} / {teamMembers.length} Present

                </span>

              </div>

              <div className="member-attendance-list">

                {memberAttendance.map(({ member, key, status }) => (

                  <div className="member-attendance-row" key={key}>

                    <div className="member-info">

                      <strong>{member.name || 'Member'}</strong>

                      <small>{member.email || 'Email not provided'}</small>

                    </div>

                    <div className="attendance-controls" role="group" aria-label={`${member.name || 'Member'} attendance`}>

                      {['PRESENT', 'ABSENT'].map((attendance) => (

                        <button

                          key={attendance}

                          type="button"

                          className={`attendance-option${status === attendance ? ' selected' : ''}${attendance === 'ABSENT' ? ' absent-option' : ''}`}

                          aria-pressed={status === attendance}

                          disabled={isReadOnly}

                          onClick={() => updateMemberAttendance(key, attendance)}

                        >

                          {attendance === 'PRESENT' ? 'Present' : 'Absent'}

                        </button>

                      ))}

                    </div>

                  </div>

                ))}

                {teamMembers.length === 0 && <p className="attendance-empty">No team members are listed.</p>}

              </div>

            </div>

          </div>



          <div className="evaluation-card judge-overview">

            <div className="evaluation-section-header">

              <h2>Evaluation Summary</h2>

              <span className="evaluation-status-badge evaluation-badge-blue">{progressPercent}%</span>

            </div>

            <div className="evaluation-summary-grid">

              <div className="summary-stat"><span>Criteria Completed</span><strong>{completedCriteriaCount} / {totalCriteriaCount}</strong></div>

              <div className="summary-stat"><span>Raw Score</span><strong>{rawTotal} / {criteria.reduce((sum, criterion) => sum + Number(criterion.maxMarks || 0), 0)}</strong></div>

              <div className="summary-stat"><span>Weighted Score</span><strong>{weightedScore.toFixed(1)} / 100</strong></div>

              <div className="summary-stat"><span>Attendance</span><strong>{presentMemberCount} / {teamMembers.length} Present</strong></div>

              <div className="summary-stat"><span>Time</span><strong>{formatDuration(displayDuration)}</strong></div>

            </div>

            <div className="progress-block">

              <div className="progress-label-row">

                <span>Evaluation Progress</span>

                <strong>{completedCriteriaCount} / {totalCriteriaCount} Criteria Completed</strong>

              </div>

              <div

                className="progress-track"

                role="progressbar"

                aria-label="Evaluation progress"

                aria-valuemin="0"

                aria-valuemax={totalCriteriaCount}

                aria-valuenow={completedCriteriaCount}

              >

                <span style={{ width: `${progressPercent}%` }} />

              </div>

            </div>

            <div className="evaluation-meta-row">

              <span>Judge</span>

              <strong>{judge.name}</strong>

            </div>

            <div className="evaluation-meta-row">

              <span>Status</span>

              <strong>{session.status}</strong>

            </div>

          </div>

        </section>



        <section className="evaluation-card scores-card">

          <div className="evaluation-section-header">

            <h2>Score Criteria</h2>

            <span className="evaluation-status-badge evaluation-badge-muted">{completedCriteriaCount}/{totalCriteriaCount}</span>

          </div>

          {criteria.length === 0 ? (

            <p className="judges-empty-message">No evaluation criteria are configured for this event.</p>

          ) : (

            <div className="score-grid">

              {criteria.map((criterion) => {

                const current = Number(session.scores?.[criterion.id] ?? 0);

                return (

                  <div className="score-row" key={criterion.id}>

                    <div className="score-row-copy">

                      <div className="score-row-header">

                        <strong>{criterion.name}</strong>

                        <span>Weight: {criterion.weight || 0}%</span>

                      </div>

                      <small>{criterion.description || 'No description provided.'}</small>

                      <div className="score-meta-row">

                        <span>Maximum: {criterion.maxMarks} marks</span>

                        <span className="score-meta-chip">{current} scored</span>

                      </div>

                    </div>

                    <div className="score-controls">

                      <label>

                        <span>Score</span>

                        <input

                          type="number"

                          min="0"

                          max={criterion.maxMarks}

                          step="0.5"

                          value={current}

                          readOnly={isReadOnly}

                          onChange={(event) => updateScore(criterion.id, event.target.value)}

                        />

                      </label>

                      <span className="score-max-text">/ {criterion.maxMarks}</span>

                    </div>

                  </div>

                );

              })}

            </div>

          )}

        </section>



        <section className="evaluation-card feedback-card">

          <h2>Overall Feedback</h2>

          <textarea

            rows="5"

            value={session.feedback || ''}

            readOnly={isReadOnly}

            onChange={(event) => updateFeedback(event.target.value)}

            placeholder="Summarize the team's strengths, weaknesses and key observations..."

          />

        </section>



        <div className={`evaluation-submit-panel${isReadOnly ? ' is-completed' : ''}`}>

          <div className="evaluation-submit-copy">

            {isReadOnly ? (

              <>

                <strong>🔒 Evaluation Completed</strong>

                <span>Submitted at: {session.completedAt ? new Date(session.completedAt).toLocaleString() : '—'}</span>

              </>

            ) : isEvaluationReady ? (

              <>

                <strong>✓ Evaluation Ready</strong>

                <span>All required criteria have been completed.</span>

              </>

            ) : (

              <>

                <strong>Evaluation Incomplete</strong>

                <span>

                  {totalCriteriaCount === 0 || completedCriteriaCount !== totalCriteriaCount

                    ? 'Complete all required criteria before submitting.'

                    : 'Add overall feedback before submitting.'}

                </span>

              </>

            )}

          </div>

          <div className="evaluation-actions">

            <Link className="judges-secondary-button" to={`/judge/${eventId}/${judgeId}`}>Back to Dashboard</Link>

            {isAdminMode && session.status === 'COMPLETED' && (

              <button type="button" className="judges-secondary-button" onClick={reopenEvaluation}>Reopen Evaluation</button>

            )}

            {!isReadOnly && (

              <button

                type="button"

                className="judges-primary-button"

                onClick={submitEvaluation}

                disabled={!isEvaluationReady}

              >

                Complete Evaluation

              </button>

            )}

            {isAdminMode && session.status !== 'COMPLETED' && (

              <button type="button" className="judges-primary-button" onClick={submitEvaluation}>Save Corrections</button>

            )}

          </div>

        </div>

      </main>

    </div>

  );

}



export default EvaluationSession;
