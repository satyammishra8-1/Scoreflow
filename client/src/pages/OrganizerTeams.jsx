import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { readSavedTeams } from '../data/teamStorage';
import { createSampleWorkbook, parseTeamWorkbook } from '../data/teamImport';
import { findDuplicateMemberIndexes, normalizeExternalUrl } from '../data/teamValidation';
import {
  DeleteTeamModal,
  ImportPreviewModal,
  TeamDetailsModal,
  TeamFormModal,
} from './TeamModals';
import './OrganizerDashboard.css';
import './OrganizerTeams.css';

function TeamSidebar({ eventId, isOpen, closeMenu }) {
  return (
    <>
      <button
        className={`dashboard-scrim ${isOpen ? 'visible' : ''}`}
        type="button"
        aria-label="Close navigation"
        onClick={closeMenu}
      />
      <aside className={`dashboard-sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <Link to="/organizer/dashboard" className="dashboard-brand" onClick={closeMenu}>
          <span className="dashboard-brand-mark">S</span><span>ScoreFlow</span>
        </Link>
        <nav className="sidebar-navigation" aria-label="Organizer navigation">
          <Link className="sidebar-link" to="/organizer/dashboard" onClick={closeMenu}>
            <span className="sidebar-icon" aria-hidden="true">▦</span><span>Dashboard</span>
          </Link>
          <Link className="sidebar-link" to="/organizer/events" onClick={closeMenu}>
            <span className="sidebar-icon" aria-hidden="true">▣</span><span>Events</span>
          </Link>
          <Link className="sidebar-link sidebar-link-active" to={`/organizer/events/${eventId}/teams`} onClick={closeMenu} aria-current="page">
            <span className="sidebar-icon" aria-hidden="true">♧</span><span>Teams</span>
            <span className="active-indicator" />
          </Link>
          <Link className="sidebar-link" to={`/organizer/events/${eventId}/judges`} onClick={closeMenu}>
            <span className="sidebar-icon" aria-hidden="true">♙</span><span>Judges</span>
          </Link>
          <Link className="sidebar-link" to={`/organizer/events/${eventId}/criteria`} onClick={closeMenu}>
            <span className="sidebar-icon" aria-hidden="true">☷</span><span>Evaluation Criteria</span>
          </Link>
          <a className="sidebar-link" href="#" key="results" onClick={closeMenu}>
            <span className="sidebar-icon" aria-hidden="true">▤</span><span>Results</span>
          </a>
          <a className="sidebar-link" href="#" key="feedback" onClick={closeMenu}>
            <span className="sidebar-icon" aria-hidden="true">✉</span><span>Feedback &amp; Emails</span>
          </a>
        </nav>
        <div className="sidebar-bottom">
          <a href="#" className="sidebar-link" onClick={closeMenu}>
            <span className="sidebar-icon" aria-hidden="true">⚙</span><span>Settings</span>
          </a>
        </div>
      </aside>
    </>
  );
}

function safeStoredEventName() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem('scoreflow.organizer.event') || 'null');
    return parsed && typeof parsed.name === 'string' ? parsed.name.trim() : '';
  } catch {
    return '';
  }
}

function TeamLink({ value, label }) {
  const href = normalizeExternalUrl(value);
  return href
    ? <a href={href} target="_blank" rel="noreferrer" aria-label={`${label} link`}>{label}</a>
    : <span className="teams-no-link">—</span>;
}

function formatFileSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function OrganizerTeams() {
  const { eventId = 'default' } = useParams();
  return <OrganizerTeamsEvent key={eventId} eventId={eventId} />;
}

function OrganizerTeamsEvent({ eventId }) {
  const storageKey = `scoreflow.organizer.event.${eventId}.teams`;
  const judgeStorageKey = `scoreflow.organizer.event.${eventId}.judges`;
  const [initialData] = useState(() => readSavedTeams(storageKey, eventId));
  const [teams, setTeams] = useState(initialData.teams);
  const [eventName] = useState(safeStoredEventName);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [editingTeam, setEditingTeam] = useState(undefined);
  const [editingPreviewTeam, setEditingPreviewTeam] = useState(undefined);
  const [deletingTeam, setDeletingTeam] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [pageMessage, setPageMessage] = useState(initialData.error
    ? { type: 'error', text: initialData.error }
    : null);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInput = useRef(null);
  const activeEventId = useRef(eventId);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const filteredTeams = useMemo(() => {
    const query = search.trim().toLowerCase();
    return teams.filter((team) => {
      const searchable = [
        team.number,
        team.name,
        team.project,
        ...team.members.flatMap((member) => [member.name, member.email, member.usn, member.section]),
      ];
      const matchesSearch = !query || searchable.some((value) => String(value || '').toLowerCase().includes(query));
      return matchesSearch && (statusFilter === 'All' || team.status === statusFilter);
    });
  }, [teams, search, statusFilter]);

  const pendingCount = teams.filter((team) => team.status === 'Pending').length;
  const completeCount = teams.filter((team) => team.status === 'Complete').length;
  const collisionNumbers = useMemo(() => {
    const existingNumbers = new Set(teams.map((team) => team.number.toLowerCase()));
    return [...new Set((previewData?.teams || [])
      .filter((team) => existingNumbers.has(team.number.toLowerCase()))
      .map((team) => team.number))];
  }, [previewData, teams]);
  const previewSummary = useMemo(() => {
    if (!previewData) return null;
    const numbers = new Set();
    const duplicateNumbers = new Set();
    let duplicateMembers = 0;
    previewData.teams.forEach((team) => {
      const key = team.number.trim().toLocaleLowerCase();
      if (numbers.has(key)) duplicateNumbers.add(team.number);
      numbers.add(key);
      duplicateMembers += findDuplicateMemberIndexes(team.members).length;
    });
    return {
      ...previewData,
      teamsDetected: previewData.teams.length,
      membersDetected: previewData.teams.reduce((count, team) => count + team.members.length, 0),
      duplicateNumbers: [...duplicateNumbers],
      duplicateMembers,
    };
  }, [previewData]);

  function saveTeams(nextTeams) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextTeams));
      setTeams(nextTeams);
      setPageMessage(null);
      return { ok: true };
    } catch {
      const error = 'Unable to save teams in this browser. Check available local storage and try again.';
      setPageMessage({ type: 'error', text: error });
      return { ok: false, error };
    }
  }

  function saveTeam(team) {
    const duplicate = teams.some((existing) => (
      existing.id !== team.id && existing.number.toLowerCase() === team.number.toLowerCase()
    ));
    if (duplicate) return { ok: false, error: `Team No. ${team.number} is already in use.` };

    const withEvent = { ...team, eventId };
    const exists = teams.some((existing) => existing.id === team.id);
    const nextTeams = exists
      ? teams.map((existing) => existing.id === team.id ? withEvent : existing)
      : [...teams, withEvent];
    const result = saveTeams(nextTeams);
    if (result.ok) {
      setEditingTeam(undefined);
      setSelectedTeam(null);
      setPageMessage({
        type: 'success',
        text: exists ? `Team ${team.number} updated successfully.` : `Team ${team.number} added successfully.`,
      });
    }
    return result;
  }

  function updateStatus(teamId, status) {
    const team = teams.find((item) => item.id === teamId);
    if (!team) {
      setPageMessage({ type: 'error', text: 'Unable to find the team to update.' });
      return;
    }
    const result = saveTeams(teams.map((item) => item.id === teamId ? { ...item, status } : item));
    if (result.ok) setPageMessage({ type: 'success', text: `Team ${team.number} marked ${status.toLowerCase()}.` });
  }

  async function handleSelectedFile(file) {
    if (!file) return;
    setSelectedFile(file);
    setPreviewData(null);
    setDuplicateStrategy('');
    setPageMessage(null);
    setIsReading(true);
    try {
      const parsed = await parseTeamWorkbook(file);
      if (activeEventId.current !== eventId) return;
      setPreviewData(parsed);
    } catch (error) {
      if (activeEventId.current !== eventId) return;
      setPageMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Unable to read this Excel file. Please check the format.',
      });
    } finally {
      setIsReading(false);
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    void handleSelectedFile(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    if (!isBusy) void handleSelectedFile(event.dataTransfer.files?.[0]);
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    setPreviewData(null);
    setDuplicateStrategy('');
    if (fileInput.current) fileInput.current.value = '';
    setPageMessage(null);
  }

  function cancelImport() {
    setPreviewData(null);
    setSelectedFile(null);
    setDuplicateStrategy('');
    if (fileInput.current) fileInput.current.value = '';
  }

  function updatePreviewTeam(updatedTeam) {
    const numberConflict = previewData.teams.some((team) => (
      team.id !== updatedTeam.id && team.number.trim().toLocaleLowerCase() === updatedTeam.number.trim().toLocaleLowerCase()
    ));
    if (numberConflict) return { ok: false, error: `Team No. ${updatedTeam.number} is already used in this import.` };
    setPreviewData((current) => current && ({
      ...current,
      teams: current.teams.map((team) => team.id === updatedTeam.id ? updatedTeam : team),
    }));
    setEditingPreviewTeam(undefined);
    return { ok: true };
  }

  async function handleDownloadSample() {
    try {
      await createSampleWorkbook();
      setPageMessage({ type: 'success', text: 'Sample Excel workbook downloaded.' });
    } catch {
      setPageMessage({ type: 'error', text: 'Unable to create the sample workbook in this browser.' });
    }
  }

  function confirmImport() {
    if (
      !previewData ||
      previewSummary?.duplicateNumbers.length > 0 ||
      previewSummary?.duplicateMembers > 0 ||
      previewData.teams.length === 0 ||
      (collisionNumbers.length > 0 && !['skip', 'replace'].includes(duplicateStrategy))
    ) return;
    setIsImporting(true);
    const existingByNumber = new Map(teams.map((team) => [team.number.toLowerCase(), team]));
    const nextTeams = [...teams];
    let addedCount = 0;
    let replacedCount = 0;
    let skippedCount = 0;
    let importedMembers = 0;

    previewData.teams.forEach((imported) => {
      const existing = existingByNumber.get(imported.number.toLowerCase());
      if (existing && duplicateStrategy === 'skip') {
        skippedCount += 1;
        return;
      }
      importedMembers += imported.members.length;
      if (existing) {
        const replacement = {
          ...imported,
          id: existing.id,
          eventId,
          createdAt: existing.createdAt || imported.createdAt,
          status: existing.status,
          judges: existing.judges,
        };
        const index = nextTeams.findIndex((team) => team.id === existing.id);
        nextTeams[index] = replacement;
        replacedCount += 1;
      } else {
        nextTeams.push({ ...imported, eventId });
        addedCount += 1;
      }
    });

    const result = saveTeams(nextTeams);
    setIsImporting(false);
    if (result.ok) {
      setPreviewData(null);
      setSelectedFile(null);
      setDuplicateStrategy('');
      const importedTeams = addedCount + replacedCount;
      setPageMessage(importedTeams > 0
        ? {
          type: 'success',
          text: `Teams imported successfully: ${importedTeams} ${importedTeams === 1 ? 'team' : 'teams'} • ${importedMembers} ${importedMembers === 1 ? 'member' : 'members'}${skippedCount > 0 ? ` • ${skippedCount} existing ${skippedCount === 1 ? 'team' : 'teams'} skipped` : ''}${previewData.invalidRows > 0 ? ` • ${previewData.invalidRows} invalid ${previewData.invalidRows === 1 ? 'row' : 'rows'} skipped` : ''}.`,
        }
        : {
          type: 'success',
          text: `No teams were added or replaced; ${skippedCount} existing ${skippedCount === 1 ? 'team was' : 'teams were'} skipped.`,
        });
    }
  }

  function deleteTeam() {
    if (!deletingTeam) return;
    const team = deletingTeam;
    const nextTeams = teams.filter((item) => item.id !== team.id);
    setIsDeleting(true);

    let previousTeams;
    let previousJudges;
    try {
      previousTeams = window.localStorage.getItem(storageKey);
      previousJudges = window.localStorage.getItem(judgeStorageKey);
      window.localStorage.setItem(storageKey, JSON.stringify(nextTeams));
      if (previousJudges !== null) {
        const judges = JSON.parse(previousJudges);
        if (Array.isArray(judges)) {
          const teamId = String(team.id || team.number);
          const updatedJudges = judges.map((judge) => ({
            ...judge,
            teamIds: Array.isArray(judge.teamIds) ? judge.teamIds.filter((id) => id !== teamId) : [],
            completedTeamIds: Array.isArray(judge.completedTeamIds)
              ? judge.completedTeamIds.filter((id) => id !== teamId)
              : [],
          }));
          window.localStorage.setItem(judgeStorageKey, JSON.stringify(updatedJudges));
        }
      }
      setTeams(nextTeams);
      setSelectedTeam(null);
      setDeletingTeam(null);
      setPageMessage({ type: 'success', text: `Team ${team.number} deleted successfully.` });
    } catch {
      try {
        if (previousTeams === null || previousTeams === undefined) window.localStorage.removeItem(storageKey);
        else window.localStorage.setItem(storageKey, previousTeams);
        if (previousJudges !== null && previousJudges !== undefined) {
          window.localStorage.setItem(judgeStorageKey, previousJudges);
        }
      } catch {
        setPageMessage({ type: 'error', text: 'Unable to restore browser data after the delete failed. Refresh and check the saved data.' });
      }
      setPageMessage({ type: 'error', text: 'Unable to delete the team. Check browser storage and try again.' });
    } finally {
      setIsDeleting(false);
    }
  }

  function openEdit(team) {
    setSelectedTeam(null);
    setEditingTeam(team);
  }

  const isBusy = isReading || isSaving || isImporting || isDeleting;

  return (
    <div className="sf-dashboard teams-dashboard">
      <TeamSidebar eventId={eventId} isOpen={isMenuOpen} closeMenu={() => setIsMenuOpen(false)} />
      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <button
            className="mobile-menu-button"
            type="button"
            aria-label="Open navigation"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen(true)}
          ><span /><span /><span /></button>
          <label className="dashboard-search">
            <span aria-hidden="true">⌕</span>
            <input aria-label="Search" placeholder="Search events, teams, judges..." />
          </label>
          <div className="topbar-actions">
            <button className="notification-button" type="button" aria-label="Notifications"><span aria-hidden="true">♧</span><i /></button>
            <span className="topbar-divider" />
            <div className="topbar-user">
              <div className="profile-avatar">A</div>
              <div className="topbar-user-name"><strong>Admin</strong><span>Organizer</span></div>
              <span className="dropdown-chevron" aria-hidden="true">⌄</span>
            </div>
          </div>
        </header>

        <main className="dashboard-content teams-content">
          <div className="teams-page-heading">
            <div>
              {eventName && <p className="teams-event-name">{eventName} <span>·</span> Teams</p>}
              <h1>Teams</h1>
              <p>Manage participating teams and their assignments.</p>
            </div>
            <div className="teams-heading-actions">
              <button className="teams-secondary-button" type="button" onClick={handleDownloadSample} disabled={isBusy}>
                <span aria-hidden="true">↓</span> Download Sample Excel
              </button>
              <button className="teams-secondary-button" type="button" onClick={() => fileInput.current?.click()} disabled={isBusy}>
                <span aria-hidden="true">⇧</span> Import Teams
              </button>
              <input
                ref={fileInput}
                className="teams-file-input"
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleFileChange}
                aria-label="Choose Excel workbook"
              />
              <button className="teams-primary-button" type="button" onClick={() => setEditingTeam(null)} disabled={isBusy}>
                <span aria-hidden="true">+</span> Add Team
              </button>
            </div>
          </div>

          {pageMessage && (
            <p className={`teams-message teams-message-${pageMessage.type}`} role={pageMessage.type === 'error' ? 'alert' : 'status'}>
              <span aria-hidden="true">{pageMessage.type === 'success' ? '✓' : '!'}</span>{pageMessage.text}
              <button type="button" onClick={() => setPageMessage(null)} aria-label="Dismiss notification">×</button>
            </p>
          )}

          <section
            className={`teams-upload-panel ${isReading ? 'teams-upload-reading' : ''}`}
            aria-label="Import teams from Excel"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="teams-upload-copy">
              <span className="teams-upload-icon" aria-hidden="true">⇧</span>
              <div>
                <strong>Import Teams</strong>
                <p>Drag &amp; drop Excel file here or choose a workbook. Repeated team rows are grouped automatically.</p>
                {selectedFile && (
                  <div className="teams-selected-file">
                    <span aria-hidden="true">▤</span><strong>{selectedFile.name}</strong><small>{formatFileSize(selectedFile.size)}</small>
                    <button type="button" onClick={clearSelectedFile} disabled={isBusy} aria-label="Clear selected file">Clear</button>
                  </div>
                )}
                {isReading && <p className="teams-upload-progress" role="status">Reading workbook and validating rows…</p>}
              </div>
            </div>
            <div className="teams-upload-actions">
              <button className="teams-secondary-button" type="button" onClick={() => fileInput.current?.click()} disabled={isBusy}>
                {isReading ? 'Reading…' : 'Choose Excel File'}
              </button>
              <span>Supported formats: .xlsx, .xls</span>
            </div>
          </section>

          <section className="teams-summary" aria-label="Team summary">
            <article className="teams-summary-card"><span>Total Teams</span><strong>{teams.length}</strong></article>
            <article className="teams-summary-card"><span>Pending</span><strong>{pendingCount}</strong></article>
            <article className="teams-summary-card"><span>Complete</span><strong>{completeCount}</strong></article>
          </section>

          <section className="teams-table-card" aria-label="Participating teams">
            <div className="teams-table-toolbar">
              <label className="teams-filter-search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  aria-label="Search teams"
                  placeholder="Search team, member name or email..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label className="teams-status-filter">
                <span>Status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
                  <option>All</option><option>Pending</option><option>Complete</option>
                </select>
              </label>
            </div>
            {teams.length === 0 ? (
              <div className="teams-empty-state">
                <span aria-hidden="true">♧</span>
                <h2>No teams added yet.</h2>
                <p>Import your roster from Excel or create a team to get started.</p>
                <div>
                  <button className="teams-secondary-button" type="button" onClick={() => fileInput.current?.click()} disabled={isBusy}>Import from Excel</button>
                  <button className="teams-primary-button" type="button" onClick={() => setEditingTeam(null)} disabled={isBusy}>Add Team</button>
                </div>
              </div>
            ) : (
              <>
                <div className="teams-table-scroll">
                  <table className="teams-table">
                    <thead>
                      <tr>
                        <th>Team No.</th><th>Team Name</th><th>Members</th><th>GitHub</th><th>Demo</th><th>Status</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeams.map((team) => (
                        <tr key={team.id}>
                          <td><strong className="team-number-cell">{team.number}</strong></td>
                          <td>
                            <div className="team-name-cell">
                              <strong>{team.name}</strong>
                              {team.project && <small>{team.project}</small>}
                            </div>
                          </td>
                          <td>{team.members.length} {team.members.length === 1 ? 'Member' : 'Members'}</td>
                          <td><TeamLink value={team.github || team.members.find((member) => member.github)?.github} label="GitHub" /></td>
                          <td><TeamLink value={team.demo || team.members.find((member) => member.demo)?.demo} label="Demo" /></td>
                          <td>
                            <select
                              className={`team-status-select team-status-${team.status.toLowerCase()}`}
                              value={team.status}
                              aria-label={`${team.number} status`}
                              onChange={(event) => updateStatus(team.id, event.target.value)}
                              disabled={isBusy}
                            >
                              <option>Pending</option><option>Complete</option>
                            </select>
                          </td>
                          <td>
                            <div className="teams-row-actions">
                              <button className="team-view-button" type="button" onClick={() => setSelectedTeam(team)}>View</button>
                              <button className="team-edit-button" type="button" onClick={() => openEdit(team)}>Edit</button>
                              <button className="team-delete-button" type="button" onClick={() => setDeletingTeam(team)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredTeams.length === 0 && (
                        <tr><td className="teams-empty-cell" colSpan="7">No teams match your search or selected status.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="teams-table-footer">Showing {filteredTeams.length} of {teams.length} teams</div>
              </>
            )}
          </section>
        </main>
      </div>

      <TeamDetailsModal
        team={selectedTeam}
        onClose={() => setSelectedTeam(null)}
        onEdit={openEdit}
      />
      {editingTeam !== undefined && (
        <TeamFormModal
          team={editingTeam}
          lockTeamNumber={false}
          isSaving={isSaving}
          onClose={() => setEditingTeam(undefined)}
          onSave={(team) => {
            setIsSaving(true);
            const result = saveTeam(team);
            setIsSaving(false);
            return result;
          }}
        />
      )}
      <ImportPreviewModal
        preview={previewSummary}
        file={selectedFile}
        existingNumbers={collisionNumbers}
        strategy={duplicateStrategy}
        setStrategy={setDuplicateStrategy}
        isImporting={isImporting}
        onCancel={cancelImport}
        onConfirm={confirmImport}
        onEditTeam={setEditingPreviewTeam}
      />
      {editingPreviewTeam !== undefined && (
        <TeamFormModal
          team={editingPreviewTeam}
          isSaving={false}
          lockTeamNumber={false}
          onClose={() => setEditingPreviewTeam(undefined)}
          onSave={updatePreviewTeam}
        />
      )}
      <DeleteTeamModal
        team={deletingTeam}
        isDeleting={isDeleting}
        onCancel={() => setDeletingTeam(null)}
        onConfirm={deleteTeam}
      />
    </div>
  );
}

export default OrganizerTeams;
