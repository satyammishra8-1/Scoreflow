import { useEffect, useMemo, useState } from 'react';

import { Link, useSearchParams } from 'react-router-dom';

import axios from 'axios';

import {

  calculateRawTotal,

  calculateWeightedScore,

  calculateDynamicWeightedScore,

  dynamicScoreFields,

  normalizeCriterion,

} from '../data/evaluationUtils';

import {

  buildModelRequirements,

  getScoresCardTitle,

  isFeedbackRequired,

} from '../data/evaluationRequirements';

import ModelEvaluationFields from '../components/ModelEvaluationFields';
import DynamicEvaluationFields from '../components/DynamicEvaluationFields';

import './EvaluationSession.css';

const API = axios.create({

  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',

});



function toUiJudge(apiJudge) {

  if (!apiJudge || typeof apiJudge !== 'object') return null;

  return {

    ...apiJudge,

    id: String(apiJudge._id || apiJudge.judgeId || apiJudge.id || ''),

    teamIds: Array.isArray(apiJudge.assignedTeamIds) ? apiJudge.assignedTeamIds.map(String) : [],

  };

}

function formatDuration(valueInSeconds) {

  const totalSeconds = Math.max(0, Number(valueInSeconds) || 0);

  const hours = Math.floor(totalSeconds / 3600);

  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const seconds = totalSeconds % 60;

  const pad = (input) => String(input).padStart(2, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

}



function getCurrentTimestamp() {

  return Date.now();

}



function getElapsedSecondsSince(startedAt) {

  if (!startedAt) return 0;

  return Math.max(0, Math.floor((getCurrentTimestamp() - Number(startedAt)) / 1000));

}



function getMemberAttendanceKey(_member, index) {
  return `member-${index + 1}`;
}

function getLegacyMemberAttendanceKey(member) {

  if (typeof member.email === 'string' && member.email.trim()) return `email:${member.email.trim().toLowerCase()}`;

  if (typeof member.id === 'string' && member.id.trim()) return `id:${member.id.trim()}`;

  if (typeof member.id === 'number') return `id:${member.id}`;

  if (typeof member.usn === 'string' && member.usn.trim()) return `usn:${member.usn.trim().toLowerCase()}`;

  return `name:${String(member.name || '').trim().toLowerCase()}`;

}



function EvaluationSession({ eventId = 'default', judgeId, teamId }) {

  const [searchParams] = useSearchParams();

  const isAdminMode = searchParams.get('mode') === 'admin';
  const [editingCompleted, setEditingCompleted] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {

    try {

      const stored = window.localStorage.getItem('scoreflow.sidebar.collapsed');

      return stored === 'true';

    } catch {

      return false;

    }

  });

  const [teams, setTeams] = useState([]);
  const [judges, setJudges] = useState([]);
  const [judgesLoading, setJudgesLoading] = useState(true);
  const [judgesError, setJudgesError] = useState('');
  const [session, setSession] = useState(() => ({
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
  }));
  const [elapsedSeconds, setElapsedSeconds] = useState(() => Number(session.duration || 0));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [evaluationLoading, setEvaluationLoading] = useState(true);
  const [evaluationAccessError, setEvaluationAccessError] = useState('');

  const [evalConfig, setEvalConfig] = useState(null);

  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {

    let cancelled = false;

    async function loadEvaluationConfig() {

      try {

        const response = await API.get(`/events/${encodeURIComponent(eventId)}/evaluation-config`);

        if (!cancelled && response.data?.success) {

          if (response.data.data) setEvalConfig(response.data.data);
          else setJudgesError('Evaluation is not configured for this event yet.');

        }

      } catch {

        if (!cancelled) setJudgesError('Unable to load this event\'s evaluation configuration.');

      } finally {

        if (!cancelled) setConfigLoading(false);

      }

    }

    loadEvaluationConfig();

    return () => {

      cancelled = true;

    };

  }, [eventId]);

  const criteria = useMemo(() => {

    if (!evalConfig) return [];

    if (evalConfig.model === 'criteria-based') {

      return (evalConfig.criteriaBased?.criteria || []).map(

        (criterion, index) => normalizeCriterion(criterion, index, eventId),

      );

    }

    if (evalConfig.model === 'live-demo') {

      return (evalConfig.liveDemo?.criteria || []).map(

        (criterion, index) => normalizeCriterion(criterion, index, eventId),

      );

    }

    return [];

  }, [evalConfig, eventId]);

  const evalModel = evalConfig?.model || 'criteria-based';


  useEffect(() => {
    let cancelled = false;

    async function loadJudges() {
      try {
        const [judgeResponse, teamResponse] = await Promise.all([
          API.get(`/events/${encodeURIComponent(eventId)}/judges`),
          API.get(`/events/${encodeURIComponent(eventId)}/teams`),
        ]);
        if (!cancelled) {
          const list = Array.isArray(judgeResponse.data?.data) ? judgeResponse.data.data : [];
          setJudges(list.map(toUiJudge).filter((judge) => judge && String(judge.eventId) === String(eventId)));
          const eventTeams = Array.isArray(teamResponse.data?.data) ? teamResponse.data.data : [];
          setTeams(eventTeams
            .filter((team) => String(team.eventId) === String(eventId))
            .map((team) => ({
              ...team,
              id: String(team._id || team.teamId || team.id || ''),
              number: team.teamNumber,
              name: team.teamName,
              github: team.githubUrl || '',
              demo: team.demoUrl || '',
            })));
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

    async function loadExistingEvaluation() {

      try {

        const response = await API.get(

          `/events/${encodeURIComponent(eventId)}/judges/${encodeURIComponent(judgeId)}/teams/${encodeURIComponent(teamId)}/evaluation`,

        );

        if (!cancelled && response.data?.success && response.data.data) {

          const api = response.data.data;

          setSession({

            id: api.id,

            eventId: api.eventId,

            teamId: api.teamId,

            judgeId: api.judgeId,

            startedAt: api.startedAt != null ? api.startedAt : null,

            completedAt: api.completedAt != null ? api.completedAt : null,

            duration: Number(api.duration || 0),

            attendance: api.attendance || 'Present',

            scores:

              typeof api.scores === 'object' && api.scores !== null ? { ...api.scores } : {},

            totalScore: Number(api.totalScore || 0),

            weightedScore: Number(api.weightedScore || 0),

            feedback: typeof api.feedback === 'string' ? api.feedback : '',

            status: api.status || 'NOT_STARTED',

            memberAttendance:

              typeof api.memberAttendance === 'object'

                ? { ...api.memberAttendance }

                : {},

            textAnswers:

              typeof api.textAnswers === 'object' ? { ...api.textAnswers } : {},

            flags: typeof api.flags === 'object' ? { ...api.flags } : {},

          });

        }

      } catch (loadError) {
        if (!cancelled && loadError?.response?.status !== 404) {
          const message = loadError?.response?.data?.error || 'Unable to load the evaluation from MongoDB.';
          setEvaluationAccessError(message);
          setError(message);
        }
      } finally {
        if (!cancelled) setEvaluationLoading(false);
      }

    }

    loadExistingEvaluation();

    return () => {

      cancelled = true;

    };

  }, [eventId, judgeId, teamId]);



  useEffect(() => {

    try {

      window.localStorage.setItem('scoreflow.sidebar.collapsed', String(sidebarCollapsed));

    } catch {

      // storage unavailable; ignore silently

    }

  }, [sidebarCollapsed]);

  useEffect(() => {
    if (session.status !== 'IN_PROGRESS' || !session.startedAt) {
      return undefined;
    }

    const updateElapsed = () => {
      setElapsedSeconds(
        Number(session.duration || 0) + getElapsedSecondsSince(session.startedAt),
      );
    };

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

  function resetTimer() {
    if (isReadOnly) return;
    const nextSession = {
      ...session,
      startedAt: null,
      completedAt: null,
      duration: 0,
      status: 'NOT_STARTED',
    };
    persistSession(nextSession);
    setElapsedSeconds(0);
  }

  const modelRequirements = useMemo(

    () =>

      buildModelRequirements({

        model: evalModel,

        config: evalConfig,

        criteria,

        scores: session.scores || {},

        textAnswers: session.textAnswers || {},

        flags: session.flags || {},

        feedback: session.feedback || '',
        dynamicSchema: evalConfig?.dynamicSchema,

      }),

    [

      evalModel,

      evalConfig,

      criteria,

      session.scores,

      session.textAnswers,

      session.flags,

      session.feedback,
    ],

  );

  const completedCriteriaCount = modelRequirements.filter((requirement) => requirement.done).length;

  const totalCriteriaCount = modelRequirements.length;

  const progressPercent = totalCriteriaCount === 0 ? 0 : Math.round((completedCriteriaCount / totalCriteriaCount) * 100);

  const rawTotal = calculateRawTotal(session.scores || {}, criteria);

  const weightedScore = calculateWeightedScore(session.scores || {}, criteria);

  const dynamicFields = dynamicScoreFields(evalConfig?.dynamicSchema);

  const dynamicWeightedScore = calculateDynamicWeightedScore(session.scores || {}, evalConfig?.dynamicSchema);

  const showFeedbackCard = isFeedbackRequired(evalModel, evalConfig);



  const team = teams.find((item) => String(item._id || item.id || item.number) === String(teamId));

  const judge = judges.find((item) => String(item.id) === String(judgeId));

  const assignedToJudge = judge && team && String(team.eventId) === String(eventId)
    && String(judge.eventId) === String(eventId)
    && (judge.teamIds || []).includes(String(team._id || team.id || team.number));

  const teamMembers = Array.isArray(team?.members) ? team.members : [];

  const memberAttendance = teamMembers.map((member, index) => {

    const legacyStatus = session.attendance === 'Absent' ? 'ABSENT' : 'PRESENT';

    const savedAttendance = session.memberAttendance || {};
    const status = savedAttendance[getMemberAttendanceKey(member, index)]
      || savedAttendance[getLegacyMemberAttendanceKey(member)]
      || legacyStatus;

    return { member, key: getMemberAttendanceKey(member, index), status };

  });

  const presentMemberCount = memberAttendance.filter(({ status }) => status === 'PRESENT').length;

  const isReadOnly = session.status === 'COMPLETED' && !editingCompleted;

  const isEvaluationReady = totalCriteriaCount > 0

    && completedCriteriaCount === totalCriteriaCount;



  async function persistSession(nextSession) {

    const attendanceInput = nextSession.memberAttendance || {};
    const memberAttendance = Object.fromEntries(teamMembers.flatMap((member, index) => {
      const key = getMemberAttendanceKey(member, index);
      const status = attendanceInput[key] || attendanceInput[getLegacyMemberAttendanceKey(member)];
      return status ? [[key, String(status).toUpperCase()]] : [];
    }));

    const normalized = {

      ...nextSession,

      memberAttendance,

      totalScore: calculateRawTotal(nextSession.scores || {}, criteria),

      weightedScore: calculateWeightedScore(nextSession.scores || {}, criteria),

      duration: Number(nextSession.duration || 0),

      status: nextSession.status || 'NOT_STARTED',

    };

    // Optimistic update keeps the UI responsive while the API persists.

    setSession({ ...normalized, id: session.id });

    setError('');

    setSuccess('');

    try {

      const response = await API.post('/evaluations', {

        eventId,

        judgeId,

        teamId,

        scores: normalized.scores,

        totalScore: normalized.totalScore,

        weightedScore: normalized.weightedScore,

        feedback: normalized.feedback || '',

        status: normalized.status,

        duration: normalized.duration,

        attendance: normalized.attendance || 'Present',

        memberAttendance: normalized.memberAttendance || {},

        textAnswers: normalized.textAnswers || {},

        flags: normalized.flags || {},

        startedAt: normalized.startedAt ? new Date(normalized.startedAt) : null,

        completedAt: normalized.completedAt ? new Date(normalized.completedAt) : null,

      });

      if (!response.data?.success) {

        throw new Error(response.data?.error || 'Failed to save evaluation.');

      }

      const saved = response.data.data;

      setSession((current) => ({

        ...current,

        id: saved.id,

        totalScore: saved.totalScore ?? current.totalScore,

        weightedScore: saved.weightedScore ?? current.weightedScore,

      }));

      return true;

    } catch (err) {

      setError(err?.response?.data?.error || 'Failed to save evaluation. Please try again.');

      return false;

    }

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



  function updateNumericField(key, rawValue, maxValue = 100) {

    if (isReadOnly) return;

    const nextScores = { ...session.scores };

    if (String(rawValue).trim() === '') {

      delete nextScores[key];

    } else {

      const numericValue = Number(rawValue);

      nextScores[key] = Number.isFinite(numericValue)

        ? Math.min(Math.max(numericValue, 0), Number(maxValue))

        : 0;

    }

    persistSession({

      ...session,

      scores: nextScores,

      duration: displayDuration,

    });

  }



  function updateTextAnswer(key, value) {

    if (isReadOnly) return;

    persistSession({

      ...session,

      textAnswers: { ...(session.textAnswers || {}), [key]: value },

      duration: displayDuration,

    });

  }



  function updateFlag(key, value) {

    if (isReadOnly) return;

    persistSession({

      ...session,

      flags: { ...(session.flags || {}), [key]: Boolean(value) },

      duration: displayDuration,

    });

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



  async function submitEvaluation() {

    if (modelRequirements.length === 0) {

      setError('No evaluation fields are configured for this event yet.');

      return;

    }



    const missingRequirements = modelRequirements.filter((requirement) => !requirement.done);

    if (missingRequirements.length > 0) {

      setError(`Complete these fields before submitting: ${missingRequirements.map((requirement) => requirement.label).join(', ')}.`);

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

    if (await persistSession(nextSession)) {

      setSuccess('Evaluation submitted successfully.');
      setEditingCompleted(false);

    }

  }



  async function reopenEvaluation() {

    const nextSession = {

      ...session,

      completedAt: null,

      duration: Number(session.duration || 0),

      startedAt: null,

      status: 'PAUSED',

    };

    if (await persistSession(nextSession)) {

      setSuccess('Evaluation reopened for edits.');

    }

  }



  if (judgesLoading || configLoading || evaluationLoading) {

    return (

      <div className="evaluation-session-page">

        <div className="evaluation-session-empty">

          <p role="status">Loading judge...</p>

        </div>

      </div>

    );

  }



  if (judgesError) {

    return (

      <div className="evaluation-session-page">

        <div className="evaluation-session-empty">

          <h1>Unable to load judge</h1>

          <p>{judgesError}</p>

          <Link to={`/organizer/events/${eventId}/judges`} className="judges-primary-button">Back to Judges</Link>

        </div>

      </div>

    );

  }



  if (evaluationAccessError || !team || !judge || !assignedToJudge) {

    return (

      <div className="evaluation-session-page">

        <div className="evaluation-session-empty">

          <h1>Evaluation is unavailable</h1>

          <p>{evaluationAccessError || 'This team is not assigned to this judge for this event.'}</p>

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

          <Link to={`/organizer/events/${eventId}/evaluation`}><span aria-hidden="true">☷</span><span className="event-nav-label">Criteria</span></Link>

        </nav>

      </aside>



      <main className="evaluation-session-main">

        <header className="event-topbar">

          <div className="evaluation-session-heading">

            <div>

              <p className="judges-context">Evaluation session</p>

              <h1>Team {team.number}: {team.name}</h1>

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
                      Start
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
                  <button type="button" className="evaluation-timer-button" onClick={resetTimer}>
                    Reset
                  </button>
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

            <small>Saved values are loaded from this event, judge, and team evaluation.</small>
            {isReadOnly && !isAdminMode && (
              <button type="button" className="judges-secondary-button" onClick={() => setEditingCompleted(true)}>
                Edit Evaluation
              </button>
            )}

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

              <div className="summary-stat"><span>Fields Completed</span><strong>{completedCriteriaCount} / {totalCriteriaCount}</strong></div>

              {criteria.length > 0 ? (

                <>

                  <div className="summary-stat"><span>Raw Score</span><strong>{rawTotal} / {criteria.reduce((sum, criterion) => sum + Number(criterion.maxMarks || 0), 0)}</strong></div>

                  <div className="summary-stat"><span>Weighted Score</span><strong>{weightedScore.toFixed(1)} / 100</strong></div>

                </>

              ) : (

                <div className="summary-stat"><span>Model</span><strong>{getScoresCardTitle(evalModel)}</strong></div>

              )}

              {dynamicFields.length > 0 && <div className="summary-stat"><span>AI Rubric Score</span><strong>{dynamicWeightedScore} / 100</strong></div>}

              <div className="summary-stat"><span>Attendance</span><strong>{presentMemberCount} / {teamMembers.length} Present</strong></div>

              <div className="summary-stat"><span>Time</span><strong>{formatDuration(displayDuration)}</strong></div>

            </div>

            <div className="progress-block">

              <div className="progress-label-row">

                <span>Evaluation Progress</span>

                <strong>{completedCriteriaCount} / {totalCriteriaCount} Fields Completed</strong>

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

            <h2>{getScoresCardTitle(evalModel)}</h2>

            <span className="evaluation-status-badge evaluation-badge-muted">{completedCriteriaCount}/{totalCriteriaCount}</span>

          </div>

          {configLoading ? (

            <p className="judges-empty-message">Loading evaluation configuration...</p>

          ) : (

            <>
            <ModelEvaluationFields

              model={evalModel}

              config={evalConfig}

              criteria={criteria}

              scores={session.scores || {}}

              textAnswers={session.textAnswers || {}}

              flags={session.flags || {}}

              team={team}
              assignedTeamCount={Math.max(1, judge?.teamIds?.length || 1)}

              readOnly={isReadOnly}

              onScoreChange={updateNumericField}

              onTextChange={updateTextAnswer}

              onFlagChange={updateFlag}

              onCriterionScoreChange={updateScore}

            />

            <DynamicEvaluationFields
              schema={evalConfig?.dynamicSchema}
              scores={session.scores || {}}
              textAnswers={session.textAnswers || {}}
              flags={session.flags || {}}
              readOnly={isReadOnly}
              onScoreChange={updateNumericField}
              onTextChange={updateTextAnswer}
              onFlagChange={updateFlag}
            />
            </>

          )}

        </section>



        {showFeedbackCard && (

          <section className="evaluation-card feedback-card">

            <h2>{evalModel === 'ranking-voting' ? 'Comment' : 'Overall Feedback'}</h2>

            <textarea

              rows="5"

              value={session.feedback || ''}

              readOnly={isReadOnly}

              onChange={(event) => updateFeedback(event.target.value)}

              placeholder={

                evalModel === 'ranking-voting'

                  ? 'Add a comment supporting this ranking...'

                  : "Summarize the team's strengths, weaknesses and key observations..."

              }

            />

          </section>

        )}



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

                <span>All required fields have been completed.</span>

              </>

            ) : (

              <>

                <strong>Evaluation Incomplete</strong>

                <span>

                  {totalCriteriaCount === 0 || completedCriteriaCount !== totalCriteriaCount

                    ? 'Complete all required fields before submitting.'

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

                {session.status === 'COMPLETED' ? 'Save Changes' : 'Submit Evaluation'}

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
