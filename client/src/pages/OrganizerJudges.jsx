import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import OrganizerLayout from './OrganizerLayout';
import { readSavedEvaluationSessions } from '../data/evaluationStorage';
import { readSavedTeams } from '../data/teamStorage';
import './OrganizerDashboard.css';
import './OrganizerJudges.css';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

function getTeamId(team) {
  return String(team.id || team.number);
}

function getJudgeCompletedTeamIds(judge, evaluationSessions = []) {
  const judgeId = String(judge?.id || '');
  if (!judgeId) return [];

  const completed = new Set();
  evaluationSessions.forEach((session) => {
    if (!session || String(session.judgeId) !== judgeId) return;
    if (session.status === 'COMPLETED') {
      completed.add(String(session.teamId));
    }
  });

  return [...completed];
}

function toUiJudge(apiJudge) {
  if (!apiJudge || typeof apiJudge !== 'object') return null;
  return {
    ...apiJudge,
    id: apiJudge.judgeId,
    teamIds: Array.isArray(apiJudge.assignedTeamIds) ? apiJudge.assignedTeamIds : [],
  };
}

function getApiErrorMessage(error, fallback) {
  const message = error?.response?.data?.error;
  if (typeof message === 'string' && message.trim()) return message;
  return fallback;
}

async function fetchJudges(eventId) {
  try {
    const response = await API.get(`/events/${encodeURIComponent(eventId)}/judges`);
    return (response.data.data || []).map(toUiJudge).filter(Boolean);
  } catch {
    return [];
  }
}

function JudgeModal({ onClose, onSave, existingJudge }) {
  const [name, setName] = useState(existingJudge?.name || '');
  const [email, setEmail] = useState(existingJudge?.email || '');
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName || !cleanEmail) {
      setError('Enter the judge name and email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    const result = await onSave({ id: existingJudge?.id, name: cleanName, email: cleanEmail });
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="judges-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="judges-modal" role="dialog" aria-modal="true" aria-labelledby="add-judge-title">
        <div className="judges-modal-header">
          <div>
            <p className="judges-eyebrow">JUDGE MANAGEMENT</p>
            <h2 id="add-judge-title">{existingJudge ? 'Edit Judge' : 'Add Judge'}</h2>
          </div>
          <button className="judges-close-button" type="button" onClick={onClose} aria-label="Close judge form">×</button>
        </div>
        <form className="judges-form" onSubmit={submit}>
          <label className="judges-form-field">
            <span>Judge Name</span>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} required maxLength="100" />
          </label>
          <label className="judges-form-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength="254" />
          </label>
          {error && <p className="judges-form-error" role="alert">{error}</p>}
          <div className="judges-form-actions">
            <button className="judges-secondary-button" type="button" onClick={onClose}>Cancel</button>
            <button className="judges-primary-button" type="submit">{existingJudge ? 'Save Changes' : 'Add Judge'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AssignTeamsModal({ judge, teams, onClose, onSave }) {
  const [selectedIds, setSelectedIds] = useState(judge?.teamIds || []);
  const [error, setError] = useState('');

  if (!judge) return null;

  function toggleTeam(teamId) {
    setSelectedIds((current) => current.includes(teamId)
      ? current.filter((id) => id !== teamId)
      : [...current, teamId]);
  }

  function save() {
    const result = onSave(judge.id, selectedIds);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <div className="judges-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="judges-modal" role="dialog" aria-modal="true" aria-labelledby="assign-teams-title">
        <div className="judges-modal-header">
          <div>
            <p className="judges-eyebrow">TEAM ASSIGNMENT</p>
            <h2 id="assign-teams-title">Assign Teams</h2>
            <p className="judges-modal-subtitle">Choose teams for {judge.name}.</p>
          </div>
          <button className="judges-close-button" type="button" onClick={onClose} aria-label="Close team assignment">×</button>
        </div>
        <div className="judges-team-options">
          {teams.map((team) => {
            const teamId = getTeamId(team);
            return (
              <label className="judges-team-option" key={teamId}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(teamId)}
                  onChange={() => toggleTeam(teamId)}
                />
                <span><strong>{team.number} · {team.name}</strong><small>{team.project}</small></span>
              </label>
            );
          })}
          {teams.length === 0 && <p className="judges-empty-message">No teams are available for this event yet.</p>}
        </div>
        {error && <p className="judges-form-error" role="alert">{error}</p>}
        <div className="judges-form-actions">
          <button className="judges-secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="judges-primary-button" type="button" onClick={save}>Save Assignment</button>
        </div>
      </section>
    </div>
  );
}

function JudgeDetailsModal({ judge, teams, eventId, evaluationSessions, onClose }) {
  if (!judge) return null;
  const assignedTeams = judge.teamIds
    .map((id) => teams.find((team) => getTeamId(team) === id))
    .filter(Boolean);
  const completedIds = new Set(getJudgeCompletedTeamIds(judge, evaluationSessions));
  const completedTeams = assignedTeams.filter((team) => completedIds.has(getTeamId(team)));
  const pendingTeams = assignedTeams.filter((team) => !completedIds.has(getTeamId(team)));
  const progress = assignedTeams.length === 0 ? 0 : Math.round((completedTeams.length / assignedTeams.length) * 100);

  return (
    <div className="judges-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="judges-modal judges-details-modal" role="dialog" aria-modal="true" aria-labelledby="judge-details-title">
        <div className="judges-modal-header">
          <div>
            <p className="judges-eyebrow">JUDGE DETAILS</p>
            <h2 id="judge-details-title">{judge.name}</h2>
          </div>
          <button className="judges-close-button" type="button" onClick={onClose} aria-label="Close judge details">×</button>
        </div>
        <div className="judges-details">
          <div className="judges-details-person">
            <span className="judges-avatar judges-avatar-large">{judge.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>
            <div><strong>{judge.name}</strong><span>{judge.email}</span></div>
          </div>
          <div className="judges-details-progress">
            <div><strong>Evaluation progress</strong><span>{completedTeams.length} / {assignedTeams.length} Completed</span></div>
            <div className="judges-progress-track" role="progressbar" aria-label={`${judge.name} evaluation progress`} aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          <section className="judges-detail-group">
            <h3>Assigned Teams <span>{assignedTeams.length}</span></h3>
            {assignedTeams.length > 0 ? (
              <ul>{assignedTeams.map((team) => {
                const teamId = getTeamId(team);
                const route = `/organizer/events/${eventId}/judges/${judge.id}/evaluation/${teamId}?mode=admin`;
                return (
                  <li key={teamId}>
                    <div>
                      <span>{team.number} · {team.name}</span>
                      <small>{completedIds.has(teamId) ? 'Completed' : 'Pending'}</small>
                    </div>
                    <Link to={route} className="judges-assign-button" onClick={onClose}>Start Evaluation</Link>
                  </li>
                );
              })}</ul>
            ) : <p className="judges-empty-message">No teams assigned yet.</p>}
          </section>
          <div className="judges-detail-columns">
            <section className="judges-detail-group">
              <h3>Completed Evaluations <span>{completedTeams.length}</span></h3>
              {completedTeams.length > 0
                ? <ul>{completedTeams.map((team) => <li key={getTeamId(team)}>{team.number} · {team.name}</li>)}</ul>
                : <p className="judges-empty-message">No completed evaluations yet.</p>}
            </section>
            <section className="judges-detail-group">
              <h3>Pending Evaluations <span>{pendingTeams.length}</span></h3>
              {pendingTeams.length > 0
                ? <ul>{pendingTeams.map((team) => <li key={getTeamId(team)}>{team.number} · {team.name}</li>)}</ul>
                : <p className="judges-empty-message">No pending evaluations.</p>}
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

function OrganizerJudges() {
  const { eventId = 'default' } = useParams();
  const teamStorageKey = `scoreflow.organizer.event.${eventId}.teams`;
  const [initialTeamData] = useState(() => readSavedTeams(teamStorageKey, eventId));
  const [teams] = useState(initialTeamData.teams);
  const evaluationSessions = useMemo(() => readSavedEvaluationSessions(eventId), [eventId]);
  const [judges, setJudges] = useState([]);
  useEffect(() => {
    fetchJudges(eventId).then((loaded) => setJudges(loaded));
  }, [eventId]);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageError, setPageError] = useState(initialTeamData.error || '');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingJudge, setEditingJudge] = useState(null);
  const [assigningJudge, setAssigningJudge] = useState(null);
  const [selectedJudge, setSelectedJudge] = useState(null);

  const filteredJudges = judges.filter((judge) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [judge.name, judge.email].some((value) => value.toLowerCase().includes(query));
  });

  async function addJudge(judge) {
    if (judges.some((existing) => existing.email.toLowerCase() === judge.email.toLowerCase())) {
      return { ok: false, error: 'A judge with this email address already exists.' };
    }
    try {
      const response = await API.post(`/events/${encodeURIComponent(eventId)}/judges`, {
        name: judge.name,
        email: judge.email.toLowerCase(),
      });
      const created = toUiJudge(response.data.data);
      setJudges((next) => [...next, created]);
      setIsAddOpen(false);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: getApiErrorMessage(error, 'Failed to add this judge.') };
    }
  }

  async function updateJudge(judgePayload) {
    const judge = judges.find((item) => item.id === judgePayload.id);
    if (!judge) return { ok: false, error: 'This judge could not be found.' };

    if (judges.some((existing) => (
      existing.id !== judgePayload.id && existing.email.toLowerCase() === judgePayload.email.toLowerCase()
    ))) {
      return { ok: false, error: 'A judge with this email address already exists.' };
    }

    try {
      const response = await API.put(`/judges/${encodeURIComponent(judgePayload.id)}`, {
        name: judgePayload.name,
        email: judgePayload.email.toLowerCase(),
      });
      const updated = toUiJudge(response.data.data);
      setJudges((next) => next.map((item) => item.id === judgePayload.id ? updated : item));
      setEditingJudge(null);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: getApiErrorMessage(error, 'Failed to save this judge.') };
    }
  }

  async function deleteJudge(judgeId) {
    const judge = judges.find((item) => item.id === judgeId);
    if (!judge) return { ok: false, error: 'This judge could not be found.' };
    const confirmed = window.confirm(`Delete ${judge.name}? This removes the judge and their assignment record.`);
    if (!confirmed) return { ok: false, error: 'Judge deletion cancelled.' };

    try {
      await API.delete(`/judges/${encodeURIComponent(judgeId)}`);
      setJudges((next) => next.filter((item) => item.id !== judgeId));
      setSelectedJudge(null);
      setAssigningJudge(null);
      setEditingJudge(null);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: getApiErrorMessage(error, 'Failed to delete this judge.') };
    }
  }

  async function assignTeams(judgeId, teamIds) {
  const judge = judges.find((item) => item.id === judgeId);
  if (!judge) return { ok: false, error: 'This judge could not be found.' };
  const selected = [...new Set(teamIds)].filter((id) => teams.some((team) => getTeamId(team) === id));
  if (selected.length === 0) return { ok: false, error: 'Select at least one team.' };

  const nextTeams = teams.map((team) => {
    const teamId = getTeamId(team);
    const withoutJudge = team.judges.filter((name) => name !== judge.name);
    return {
      ...team,
      judges: selected.includes(teamId) ? [...withoutJudge, judge.name] : withoutJudge,
    };
  });

  let previousTeams;
  try {
    previousTeams = window.localStorage.getItem(teamStorageKey);
    window.localStorage.setItem(teamStorageKey, JSON.stringify(nextTeams));
    const response = await API.put(`/judges/${encodeURIComponent(judgeId)}`, {
      assignedTeamIds: selected,
    });
    const updated = toUiJudge(response.data.data);
    setJudges((next) => next.map((item) => item.id === judgeId ? updated : item));
    setPageError('');
    return { ok: true };
  } catch (error) {
    try {
      if (previousTeams === null || previousTeams === undefined) {
        window.localStorage.removeItem(teamStorageKey);
      } else {
        window.localStorage.setItem(teamStorageKey, previousTeams);
      }
    } catch {
      /* ignore storage rollback failure */
    }
    const message = getApiErrorMessage(error, 'Failed to assign teams to this judge.');
    setPageError(message);
    return { ok: false, error: message };
  }
}

  const totalAssigned = judges.reduce((total, judge) => total + judge.teamIds.length, 0);
  const uniqueAssignedTeams = new Set(judges.flatMap((judge) => judge.teamIds)).size;
  const completedCount = judges.reduce((total, judge) => (
    total + getJudgeCompletedTeamIds(judge, evaluationSessions).filter((id) => judge.teamIds.includes(id)).length
  ), 0);
  const pendingCount = totalAssigned - completedCount;

  return (
    <OrganizerLayout
      activeKey="judges"
      eventId={eventId}
      wrapperClassName="judges-dashboard"
      contentClassName="dashboard-content judges-content"
      searchPlaceholder="Search judges..."
      searchValue={searchQuery}
      onSearchChange={(event) => setSearchQuery(event.target.value)}
      searchAriaLabel="Search judges"
      userName="Admin"
      userRole="Organizer"
      userInitial="A"
    >
      <div className="judges-page-heading">
            <div>
              <p className="judges-context">Annual Innovation Hackathon 2026 <span>·</span> Live event</p>
              <h1>Judge Management</h1>
              <p>Manage judges, team assignments, and evaluation progress.</p>
            </div>
            <button className="judges-primary-button" type="button" onClick={() => setIsAddOpen(true)}>
              <span aria-hidden="true">+</span> Add Judge
            </button>
          </div>

          {pageError && <p className="judges-alert" role="alert">{pageError}</p>}

          <section className="judges-summary" aria-label="Judge overview">
            <article className="judges-summary-card">
              <span className="judges-summary-icon judges-icon-blue" aria-hidden="true">♙</span>
              <div><span>Total Judges</span><strong>{judges.length}</strong></div>
            </article>
            <article className="judges-summary-card">
              <span className="judges-summary-icon judges-icon-violet" aria-hidden="true">♧</span>
              <div><span>Teams Assigned</span><strong>{uniqueAssignedTeams}</strong></div>
            </article>
            <article className="judges-summary-card">
              <span className="judges-summary-icon judges-icon-green" aria-hidden="true">✓</span>
              <div><span>Evaluations Completed</span><strong>{completedCount}</strong></div>
            </article>
            <article className="judges-summary-card">
              <span className="judges-summary-icon judges-icon-amber" aria-hidden="true">◷</span>
              <div><span>Evaluations Pending</span><strong>{pendingCount}</strong></div>
            </article>
          </section>

          <section className="judges-table-card" aria-label="Judges">
            <div className="judges-table-heading">
              <div><h2>Judges</h2><p>Judge assignments and evaluation status</p></div>
              <span>{judges.length} {judges.length === 1 ? 'judge' : 'judges'}</span>
            </div>
            <div className="judges-table-scroll">
              <table className="judges-table">
                <thead>
                  <tr>
                    <th>Judge</th><th>Email</th><th>Assigned Teams</th><th>Progress</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJudges.map((judge) => {
                    const assignedCount = judge.teamIds.length;
                    const completedTeamIds = getJudgeCompletedTeamIds(judge, evaluationSessions);
                    const completed = completedTeamIds.filter((id) => judge.teamIds.includes(id)).length;
                    const progress = assignedCount === 0 ? 0 : Math.round((completed / assignedCount) * 100);
                    return (
                      <tr key={judge.id}>
                        <td>
                          <div className="judges-person-cell">
                            <span className="judges-avatar">{judge.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>
                            <strong>{judge.name}</strong>
                          </div>
                        </td>
                        <td className="judges-email-cell">{judge.email}</td>
                        <td><strong>{assignedCount}</strong> {assignedCount === 1 ? 'team' : 'teams'}</td>
                        <td className="judges-progress-cell">
                          <div className="judges-progress-copy"><strong>{completed} / {assignedCount}</strong><span>Completed</span></div>
                          <div className="judges-progress-track" role="progressbar" aria-label={`${judge.name} progress`} aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
                            <span style={{ width: `${progress}%` }} />
                          </div>
                        </td>
                        <td><span className={`judges-status judges-status-${assignedCount > 0 ? 'active' : 'pending'}`}>{assignedCount > 0 ? 'Active' : 'Pending'}</span></td>
                        <td>
                          <div className="judges-row-actions">
                            <button className="judges-view-button" type="button" onClick={() => setSelectedJudge(judge)}>View Details</button>
                            <button className="judges-assign-button" type="button" onClick={() => setAssigningJudge(judge)}>Assign Teams</button>
                            <Link className="judges-assign-button" to={`/judge/${eventId}/${judge.id}`}>Open Dashboard</Link>
                            <button className="judges-view-button" type="button" onClick={() => setEditingJudge(judge)}>Edit</button>
                            <button className="judges-assign-button" type="button" onClick={() => deleteJudge(judge.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredJudges.length === 0 && (
                    <tr><td className="judges-empty-cell" colSpan="6">{judges.length === 0 ? 'No judges added yet. Add a judge to get started.' : 'No judges match the current search.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

      {isAddOpen && <JudgeModal onClose={() => setIsAddOpen(false)} onSave={addJudge} />}
      {editingJudge && <JudgeModal onClose={() => setEditingJudge(null)} onSave={updateJudge} existingJudge={editingJudge} />}
      {assigningJudge && (
        <AssignTeamsModal
          judge={assigningJudge}
          teams={teams}
          onClose={() => setAssigningJudge(null)}
          onSave={assignTeams}
        />
      )}
      <JudgeDetailsModal
        judge={selectedJudge}
        teams={teams}
        eventId={eventId}
        evaluationSessions={evaluationSessions}
        onClose={() => setSelectedJudge(null)}
      />
    </OrganizerLayout>
  );
}

export default OrganizerJudges;
