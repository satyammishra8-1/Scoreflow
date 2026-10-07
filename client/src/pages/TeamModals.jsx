import { useEffect, useState } from 'react';
import {
  createLocalId,
  findDuplicateMemberIndexes,
  isValidEmail,
  normalizeExternalUrl,
} from '../data/teamValidation';

function useEscapeToClose(onClose, disabled = false, isOpen = true) {
  useEffect(() => {
    if (!isOpen || disabled) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, isOpen, onClose]);
}

function ExternalValue({ value }) {
  const normalized = normalizeExternalUrl(value);
  return normalized
    ? <a href={normalized} target="_blank" rel="noreferrer">{value}</a>
    : <span>{value ? 'Invalid link' : 'Not provided'}</span>;
}

export function TeamDetailsModal({ team, onClose, onEdit }) {
  useEscapeToClose(onClose, false, Boolean(team));
  if (!team) return null;

  return (
    <div className="teams-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="teams-modal teams-details-modal" role="dialog" aria-modal="true" aria-labelledby="team-details-title">
        <div className="teams-modal-header">
          <div>
            <p className="teams-eyebrow">{team.number}</p>
            <h2 id="team-details-title">{team.name}</h2>
            <span className={`team-status-badge team-status-${team.status.toLowerCase()}`}>{team.status}</span>
          </div>
          <button className="teams-icon-button" type="button" onClick={onClose} aria-label="Close team details">×</button>
        </div>
        <dl className="team-detail-list">
          {team.project && <div><dt>Project / Problem Statement</dt><dd>{team.project}</dd></div>}
          {team.github && <div><dt>Team GitHub</dt><dd><ExternalValue value={team.github} /></dd></div>}
          {team.demo && <div><dt>Team Demo</dt><dd><ExternalValue value={team.demo} /></dd></div>}
          {team.judges.length > 0 && <div>
            <dt>Assigned Judges</dt>
            <dd>{team.judges.join(', ')}</dd>
          </div>}
          <div>
            <dt>Members ({team.members.length})</dt>
            <dd>
              <ul className="team-detail-members">
                {team.members.map((member) => (
                  <li key={member.id || `${member.name}-${member.email}`}>
                    <strong>{member.name}</strong>
                    {member.usn && <span>USN: {member.usn}</span>}
                    {member.email && <span>Email: {member.email}</span>}
                    {member.section && <span>Section: {member.section}</span>}
                    {member.github && <span>GitHub: <ExternalValue value={member.github} /></span>}
                    {member.demo && <span>Demo: <ExternalValue value={member.demo} /></span>}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
        <div className="teams-form-actions">
          <button className="teams-secondary-button" type="button" onClick={onClose}>Close</button>
          <button className="teams-primary-button" type="button" onClick={() => onEdit(team)}>Edit Team</button>
        </div>
      </section>
    </div>
  );
}

function emptyMember() {
  return { id: createLocalId('member'), name: '', email: '', github: '', demo: '' };
}

function initialForm(team) {
  return team ? {
    number: team.number,
    name: team.name,
    project: team.project || '',
    github: team.github || '',
    demo: team.demo || '',
    status: team.status,
    members: team.members.map((member) => ({ ...member, github: member.github || '', demo: member.demo || '' })),
  } : {
    number: '',
    name: '',
    project: '',
    github: '',
    demo: '',
    status: 'Pending',
    members: [emptyMember()],
  };
}

export function TeamFormModal({ team, onClose, onSave, isSaving, lockTeamNumber = false }) {
  const [form, setForm] = useState(() => initialForm(team));
  const [error, setError] = useState('');
  useEscapeToClose(onClose, isSaving);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  function updateMember(memberId, field, value) {
    setForm((current) => ({
      ...current,
      members: current.members.map((member) => member.id === memberId ? { ...member, [field]: value } : member),
    }));
  }

  function submit(event) {
    event.preventDefault();
    const number = form.number.trim();
    const name = form.name.trim();
    const members = form.members.map((member) => ({
      ...member,
      name: member.name.trim(),
      email: member.email.trim().toLowerCase(),
      usn: member.usn?.trim() || '',
      section: member.section?.trim() || '',
      github: normalizeExternalUrl(member.github),
      demo: normalizeExternalUrl(member.demo),
    }));
    if (!number || !name) {
      setError('Enter the Team No. and Team Name.');
      return;
    }
    if (members.length === 0 || members.some((member) => !member.name)) {
      setError('Add at least one member and enter a name for each member.');
      return;
    }
    if (members.some((member) => member.email && !isValidEmail(member.email))) {
      setError('Enter a valid email address or leave Email blank.');
      return;
    }
    if (findDuplicateMemberIndexes(members).length > 0) {
      setError('This team has duplicate members. Update their USN, email, or name, or remove the duplicate.');
      return;
    }
    if (members.some((member) => member.github === null || member.demo === null)) {
      setError('Enter valid http(s) GitHub and Demo URLs, or leave them blank.');
      return;
    }
    const github = normalizeExternalUrl(form.github);
    const demo = normalizeExternalUrl(form.demo);
    if (github === null || demo === null) {
      setError('Enter valid http(s) team URLs, or leave them blank.');
      return;
    }
    const result = onSave({
      ...(team || {}),
      id: team?.id || createLocalId('team'),
      number,
      name,
      project: form.project.trim(),
      github,
      demo,
      status: form.status,
      eventId: team?.eventId || '',
      createdAt: team?.createdAt || new Date().toISOString(),
      judges: team?.judges || [],
      members: members.map((member) => ({
        ...member,
        github: member.github || '',
        demo: member.demo || '',
      })),
    });
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <div className="teams-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSaving) onClose();
    }}>
      <section className="teams-modal teams-form-modal" role="dialog" aria-modal="true" aria-labelledby="team-form-title">
        <div className="teams-modal-header">
          <div>
            <p className="teams-eyebrow">TEAM SETUP</p>
            <h2 id="team-form-title">{team ? 'Edit Team' : 'Add Team'}</h2>
          </div>
          <button className="teams-icon-button" type="button" onClick={onClose} aria-label="Close team form" disabled={isSaving}>×</button>
        </div>
        <form className="teams-add-form" onSubmit={submit}>
          <label className="teams-form-field">
            <span>Team No. <b>*</b></span>
            <input required value={form.number} onChange={(event) => update('number', event.target.value)} disabled={lockTeamNumber || isSaving} />
          </label>
          <label className="teams-form-field">
            <span>Team Name <b>*</b></span>
            <input required value={form.name} onChange={(event) => update('name', event.target.value)} disabled={isSaving} />
          </label>
          <label className="teams-form-field">
            <span>Project / Problem</span>
            <input value={form.project} onChange={(event) => update('project', event.target.value)} disabled={isSaving} />
          </label>
          <label className="teams-form-field">
            <span>Status</span>
            <select value={form.status} onChange={(event) => update('status', event.target.value)} disabled={isSaving}>
              <option>Pending</option><option>Complete</option>
            </select>
          </label>
          <label className="teams-form-field">
            <span>Team GitHub</span>
            <input value={form.github} onChange={(event) => update('github', event.target.value)} placeholder="github.com/team" disabled={isSaving} />
          </label>
          <label className="teams-form-field">
            <span>Team Demo</span>
            <input value={form.demo} onChange={(event) => update('demo', event.target.value)} placeholder="example.com/demo" disabled={isSaving} />
          </label>
          <div className="teams-member-editor">
            <div className="teams-member-editor-heading">
              <strong>Members <b>*</b></strong>
              <button className="teams-secondary-button" type="button" onClick={() => setForm((current) => ({ ...current, members: [...current.members, emptyMember()] }))} disabled={isSaving}>
                <span aria-hidden="true">+</span> Add Member
              </button>
            </div>
            {form.members.map((member, index) => (
              <fieldset className="teams-member-fields" key={member.id}>
                <legend>Member {index + 1}</legend>
                <label className="teams-form-field">
                  <span>Member Name <b>*</b></span>
                  <input value={member.name} onChange={(event) => updateMember(member.id, 'name', event.target.value)} required disabled={isSaving} />
                </label>
                <label className="teams-form-field">
                  <span>Email</span>
                  <input type="email" value={member.email} onChange={(event) => updateMember(member.id, 'email', event.target.value)} disabled={isSaving} />
                </label>
                <label className="teams-form-field">
                  <span>USN / Member ID</span>
                  <input value={member.usn || ''} onChange={(event) => updateMember(member.id, 'usn', event.target.value)} disabled={isSaving} />
                </label>
                <label className="teams-form-field">
                  <span>Section</span>
                  <input value={member.section || ''} onChange={(event) => updateMember(member.id, 'section', event.target.value)} disabled={isSaving} />
                </label>
                <label className="teams-form-field">
                  <span>GitHub</span>
                  <input value={member.github} onChange={(event) => updateMember(member.id, 'github', event.target.value)} placeholder="github.com/member" disabled={isSaving} />
                </label>
                <label className="teams-form-field">
                  <span>Demo</span>
                  <input value={member.demo} onChange={(event) => updateMember(member.id, 'demo', event.target.value)} placeholder="example.com/demo" disabled={isSaving} />
                </label>
                {form.members.length > 1 && (
                  <button
                    className="teams-remove-member"
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, members: current.members.filter((item) => item.id !== member.id) }))}
                    disabled={isSaving}
                  >Remove member {index + 1}</button>
                )}
              </fieldset>
            ))}
          </div>
          {error && <p className="teams-form-error" role="alert">{error}</p>}
          <div className="teams-form-actions">
            <button className="teams-secondary-button" type="button" onClick={onClose} disabled={isSaving}>Cancel</button>
            <button className="teams-primary-button" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : team ? 'Save Changes' : 'Add Team'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function ImportPreviewModal({
  preview,
  file,
  existingNumbers,
  strategy,
  setStrategy,
  isImporting,
  onCancel,
  onConfirm,
  onEditTeam,
}) {
  useEscapeToClose(onCancel, isImporting, Boolean(preview));
  if (!preview) return null;
  const hasErrors = preview.invalidRows > 0;
  const collisionCount = existingNumbers.length;
  const duplicateNumbers = preview.duplicateNumbers || [];
  const duplicateMembers = preview.duplicateMembers || [];
  const hasPreviewDuplicates = duplicateNumbers.length > 0 || duplicateMembers.length > 0;
  const canImport = !hasPreviewDuplicates && preview.teams.length > 0 &&
    (collisionCount === 0 || ['skip', 'replace'].includes(strategy));

  return (
    <div className="teams-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isImporting) onCancel();
    }}>
      <section className="teams-modal teams-import-modal" role="dialog" aria-modal="true" aria-labelledby="import-preview-title">
        <div className="teams-modal-header">
          <div>
            <p className="teams-eyebrow">IMPORT TEAMS</p>
            <h2 id="import-preview-title">Review import</h2>
            <p className="teams-modal-subtitle">Review the grouped teams and make any corrections before adding them to this event. Rows with errors are excluded; valid teams can still be imported.</p>
          </div>
          <button className="teams-icon-button" type="button" onClick={onCancel} aria-label="Close import preview" disabled={isImporting}>×</button>
        </div>

        {file && (
          <div className="teams-import-file">
            <span className="teams-import-file-icon" aria-hidden="true">▤</span>
            <span><strong>{file.name}</strong><small>{file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}</small></span>
          </div>
        )}

        <div className="teams-import-checks" role="status">
          <span><b aria-hidden="true">✓</b> File structure recognized</span>
          <span className={preview.teamsDetected ? '' : 'teams-import-check-warning'}>
            <b aria-hidden="true">{preview.teamsDetected ? '✓' : '!'}</b>
            {preview.teamsDetected ? 'Teams grouped successfully' : 'No valid teams detected'}
          </span>
        </div>
        <div className="teams-import-summary" aria-label="Import summary">
          <div><span>Rows detected</span><strong>{preview.totalRows}</strong></div>
          <div><span>Valid rows</span><strong>{preview.validRows}</strong></div>
          <div className={hasErrors ? 'teams-import-count-error' : ''}><span>Invalid rows</span><strong>{preview.invalidRows}</strong></div>
          <div><span>Warning rows</span><strong>{preview.warningRows}</strong></div>
          <div><span>Teams detected</span><strong>{preview.teamsDetected}</strong></div>
          <div><span>Members detected</span><strong>{preview.membersDetected}</strong></div>
        </div>
        {preview.ignoredEmptyRows > 0 && <p className="teams-import-ignored">{preview.ignoredEmptyRows} completely empty rows ignored.</p>}

        {hasErrors && (
          <section className="teams-import-issues" aria-labelledby="import-errors-heading">
            <h3 id="import-errors-heading">{preview.invalidRows} invalid {preview.invalidRows === 1 ? 'row will' : 'rows will'} be skipped</h3>
            <div className="teams-issues-scroll">
              <table className="teams-issues-table">
                <thead><tr><th>Row</th><th>Team No.</th><th>Problem</th><th>Suggested correction</th></tr></thead>
                <tbody>{preview.errors.map((issue, index) => (
                  <tr key={`${issue.rowNumber}-${index}`}>
                    <td>{issue.rowNumber}</td><td>{issue.teamNumber}</td><td>{issue.problem}</td><td>{issue.suggestion}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        )}

        {preview.warnings.length > 0 && (
          <section className="teams-import-warnings" aria-label="Import warnings">
            <strong>{preview.warnings.length} warning{preview.warnings.length === 1 ? '' : 's'}</strong>
            <ul>{preview.warnings.map((warning) => (
              <li key={warning.code}>
                {warning.message} {warning.count > 1 ? `(${warning.count} rows; starting at row ${warning.rows[0]})` : `Row ${warning.rowNumber} · Team ${warning.teamNumber}`}
              </li>
            ))}</ul>
          </section>
        )}

        {collisionCount > 0 && (
          <fieldset className="teams-duplicate-policy">
            <legend>{collisionCount} team number{collisionCount === 1 ? '' : 's'} already exist</legend>
            <p>{existingNumbers.join(', ')}. Choose how to handle these teams.</p>
            <label><input type="radio" name="duplicate-policy" value="skip" checked={strategy === 'skip'} onChange={() => setStrategy('skip')} disabled={isImporting} /> Skip existing teams</label>
            <label><input type="radio" name="duplicate-policy" value="replace" checked={strategy === 'replace'} onChange={() => setStrategy('replace')} disabled={isImporting} /> Replace existing teams</label>
            <label><input type="radio" name="duplicate-policy" value="cancel" checked={strategy === 'cancel'} onChange={onCancel} disabled={isImporting} /> Cancel import</label>
          </fieldset>
        )}

        {duplicateNumbers.length > 0 && <p className="teams-preview-duplicate" role="alert">Duplicate Team Number{duplicateNumbers.length === 1 ? '' : 's'} in this file: {duplicateNumbers.join(', ')}. Edit a team before importing.</p>}
        {duplicateMembers.length > 0 && <p className="teams-preview-duplicate" role="alert">{duplicateMembers.length} possible duplicate member{duplicateMembers.length === 1 ? '' : 's'} detected. Edit a team to remove or correct duplicates.</p>}

        <section className="teams-import-groups" aria-label="Grouped teams preview">
          <h3>Grouped teams</h3>
          {preview.teams.length > 0 ? preview.teams.map((team) => (
            <article className="teams-import-team" key={team.id}>
              <div className="teams-import-team-heading">
                <div>
                  <strong>{team.name === `Team ${team.number}` ? `Team ${team.number}` : `Team ${team.number} — ${team.name}`}</strong>
                  <span>Project: {team.project || team.name}</span>
                </div>
                <div className="teams-import-team-actions">
                  <span>{team.members.length} {team.members.length === 1 ? 'Member' : 'Members'}</span>
                  <button className="teams-edit-preview-button" type="button" onClick={() => onEditTeam(team)} disabled={isImporting}>Edit</button>
                </div>
              </div>
              <ul>{team.members.map((member) => (
                <li key={member.id}>
                  <span>{member.name} <small>{[member.usn, member.section, member.email].filter(Boolean).join(' · ')}</small></span>
                </li>
              ))}</ul>
            </article>
          )) : <p className="teams-empty-message">No valid teams can be previewed.</p>}
        </section>

        <div className="teams-form-actions">
          <button className="teams-secondary-button" type="button" onClick={onCancel} disabled={isImporting}>Cancel</button>
          <button className="teams-primary-button" type="button" onClick={onConfirm} disabled={!canImport || isImporting}>
            {isImporting ? 'Importing…' : `Import ${preview.teams.length} ${preview.teams.length === 1 ? 'Team' : 'Teams'}`}
          </button>
        </div>
      </section>
    </div>
  );
}

export function DeleteTeamModal({ team, isDeleting, onCancel, onConfirm }) {
  useEscapeToClose(onCancel, isDeleting, Boolean(team));
  if (!team) return null;
  return (
    <div className="teams-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isDeleting) onCancel();
    }}>
      <section className="teams-modal teams-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-team-title" aria-describedby="delete-team-description">
        <div className="teams-modal-header">
          <div><p className="teams-eyebrow">REMOVE TEAM</p><h2 id="delete-team-title">Delete team?</h2></div>
          <button className="teams-icon-button" type="button" onClick={onCancel} aria-label="Close delete confirmation" disabled={isDeleting}>×</button>
        </div>
        <p id="delete-team-description" className="teams-delete-copy">Delete Team {team.number}? All members inside this team will also be removed from the current event. This action cannot be undone.</p>
        <div className="teams-form-actions">
          <button className="teams-secondary-button" type="button" onClick={onCancel} disabled={isDeleting}>Cancel</button>
          <button className="teams-danger-button" type="button" onClick={onConfirm} disabled={isDeleting}>{isDeleting ? 'Deleting…' : 'Delete Team'}</button>
        </div>
      </section>
    </div>
  );
}
