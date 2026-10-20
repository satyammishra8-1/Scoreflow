import { useMemo, useRef, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import OrganizerLayout from './OrganizerLayout';
import { buildTeamImportPlan, createSampleWorkbook, parseTeamWorkbook } from '../data/teamImport';
import { findDuplicateMemberIndexes, normalizeExternalUrl } from '../data/teamValidation';
import {
  DeleteTeamModal,
  ImportPreviewModal,
  TeamDetailsModal,
  TeamFormModal,
} from './TeamModals';
import './OrganizerDashboard.css';
import './OrganizerTeams.css';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

function getTeamKey(team) {
  const raw = team?.teamId ?? team?._id ?? team?.id;
  return raw != null ? String(raw) : '';
}

function toUiTeam(apiTeam) {
  if (!apiTeam || typeof apiTeam !== 'object') return null;
  const key = getTeamKey(apiTeam);
  const members = Array.isArray(apiTeam.members) ? apiTeam.members : [];
  const judges = Array.isArray(apiTeam.judges) ? apiTeam.judges : [];
  return {
    ...apiTeam,
    id: key,
    teamId: key,
    number: typeof apiTeam.teamNumber === 'string' ? apiTeam.teamNumber : '',
    name: typeof apiTeam.teamName === 'string' ? apiTeam.teamName : '',
    project: typeof apiTeam.project === 'string' ? apiTeam.project : '',
    github: typeof apiTeam.githubUrl === 'string' ? apiTeam.githubUrl : '',
    demo: typeof apiTeam.demoUrl === 'string' ? apiTeam.demoUrl : '',
    status: apiTeam.status === 'Complete' ? 'Complete' : 'Pending',
    members: members.map((member, index) => ({
      id: typeof member?.id === 'string' && member.id
        ? member.id
        : `${key || apiTeam.teamNumber || 'team'}-member-${index + 1}`,
      name: typeof member?.name === 'string' ? member.name : '',
      email: typeof member?.email === 'string' ? member.email : '',
      usn: typeof member?.usn === 'string' ? member.usn : '',
      section: typeof member?.section === 'string' ? member.section : '',
      github: typeof member?.github === 'string' ? member.github : '',
      demo: typeof member?.demo === 'string' ? member.demo : '',
    })),
    judges,
    eventId: apiTeam.eventId != null ? String(apiTeam.eventId) : '',
  };
}

function toApiPayload(uiTeam, eventId) {
  return {
    eventId,
    teamNumber: uiTeam.number,
    teamName: uiTeam.name,
    project: uiTeam.project || '',
    members: (uiTeam.members || []).map((member) => ({
      name: member.name,
      email: member.email || '',
      usn: member.usn || '',
      section: member.section || '',
      github: member.github || '',
      demo: member.demo || '',
    })),
    githubUrl: uiTeam.github || '',
    demoUrl: uiTeam.demo || '',
    judges: Array.isArray(uiTeam.judges) ? uiTeam.judges : [],
    status: uiTeam.status || 'Pending',
  };
}

function getApiErrorMessage(error, fallback) {
  const message = error?.response?.data?.error;
  if (typeof message === 'string' && message.trim()) return message;
  return fallback;
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
  const [teams, setTeams] = useState([]);
  const [eventName, setEventName] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [editingTeam, setEditingTeam] = useState(undefined);
  const [editingPreviewTeam, setEditingPreviewTeam] = useState(undefined);
  const [deletingTeam, setDeletingTeam] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [pageMessage, setPageMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInput = useRef(null);
  const activeEventId = useRef(eventId);

  useEffect(() => {
    let cancelled = false;

    async function loadTeams() {
      setIsLoading(true);
      setPageMessage(null);
      try {
        const [teamsResponse, eventResponse] = await Promise.all([
          API.get(`/events/${encodeURIComponent(eventId)}/teams`),
          API.get(`/events/${encodeURIComponent(eventId)}`).catch(() => null),
        ]);
        if (cancelled || activeEventId.current !== eventId) return;
        const list = Array.isArray(teamsResponse.data?.data) ? teamsResponse.data.data : [];
        setTeams(list.filter((team) => String(team.eventId) === String(eventId)).map(toUiTeam).filter(Boolean));
        const eventNameValue = eventResponse?.data?.data?.name;
        setEventName(typeof eventNameValue === 'string' ? eventNameValue.trim() : '');
      } catch (error) {
        if (cancelled || activeEventId.current !== eventId) return;
        setTeams([]);
        setPageMessage({ type: 'error', text: getApiErrorMessage(error, 'Unable to load teams for this event.') });
      } finally {
        if (!cancelled && activeEventId.current === eventId) setIsLoading(false);
      }
    }

    loadTeams();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

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

  async function refreshTeams(successMessage) {
    try {
      const response = await API.get(`/events/${encodeURIComponent(eventId)}/teams`);
      if (activeEventId.current !== eventId) return { ok: false };
      const list = Array.isArray(response.data?.data) ? response.data.data : [];
      setTeams(list.filter((team) => String(team.eventId) === String(eventId)).map(toUiTeam).filter(Boolean));
      if (successMessage) setPageMessage({ type: 'success', text: successMessage });
      else setPageMessage(null);
      return { ok: true };
    } catch (error) {
      if (activeEventId.current !== eventId) return { ok: false };
      const message = getApiErrorMessage(error, 'Unable to load teams for this event.');
      setPageMessage({ type: 'error', text: message });
      return { ok: false, error: message };
    }
  }

  async function saveTeam(team) {
    const teamKey = getTeamKey(team);
    const duplicate = teams.some((existing) => (
      getTeamKey(existing) !== teamKey && existing.number.toLowerCase() === team.number.toLowerCase()
    ));
    if (duplicate) return { ok: false, error: `Team No. ${team.number} is already in use.` };

    const exists = teamKey && teams.some((existing) => getTeamKey(existing) === teamKey);
    try {
      if (exists) {
        await API.put(`/teams/${encodeURIComponent(teamKey)}`, toApiPayload(team, eventId));
      } else {
        await API.post('/teams', toApiPayload(team, eventId));
      }
      const result = await refreshTeams(
        exists ? `Team ${team.number} updated successfully.` : `Team ${team.number} added successfully.`,
      );
      if (result.ok) {
        setEditingTeam(undefined);
        setSelectedTeam(null);
      }
      return result;
    } catch (error) {
      const message = getApiErrorMessage(error, 'Unable to save the team. Try again.');
      setPageMessage({ type: 'error', text: message });
      return { ok: false, error: message };
    }
  }

  async function updateStatus(teamId, status) {
    const team = teams.find((item) => getTeamKey(item) === String(teamId));
    if (!team) {
      setPageMessage({ type: 'error', text: 'Unable to find the team to update.' });
      return;
    }
    try {
      await API.put(`/teams/${encodeURIComponent(String(teamId))}`, toApiPayload({ ...team, status }, eventId));
      await refreshTeams(`Team ${team.number} marked ${status.toLowerCase()}.`);
    } catch (error) {
      setPageMessage({ type: 'error', text: getApiErrorMessage(error, 'Unable to update the team status.') });
    }
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

  async function confirmImport() {
    if (
      !previewData ||
      previewSummary?.duplicateNumbers.length > 0 ||
      previewSummary?.duplicateMembers > 0 ||
      previewData.teams.length === 0 ||
      (collisionNumbers.length > 0 && !['skip', 'replace'].includes(duplicateStrategy))
    ) return;
    setIsImporting(true);
    setPageMessage(null);
    const importPlan = buildTeamImportPlan(previewData.teams, teams, duplicateStrategy);
    let addedCount = 0;
    let replacedCount = 0;
    let skippedCount = 0;
    let importedMembers = 0;

    try {
      for (const { imported, existing, action } of importPlan) {
        if (action === 'skip') {
          skippedCount += 1;
          continue;
        }
        if (action === 'blocked') throw new Error(`Choose whether to skip or replace existing team ${imported.number}.`);
        importedMembers += imported.members.length;
        if (action === 'replace') {
          await API.put(
            `/teams/${encodeURIComponent(getTeamKey(existing))}`,
            toApiPayload({ ...imported, status: existing.status, judges: existing.judges }, eventId),
          );
          replacedCount += 1;
        } else {
          await API.post('/teams', toApiPayload(imported, eventId));
          addedCount += 1;
        }
      }

      await refreshTeams();
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
    } catch (error) {
      setPageMessage({ type: 'error', text: getApiErrorMessage(error, 'Unable to import teams. Try again.') });
    } finally {
      setIsImporting(false);
    }
  }

  async function deleteTeam() {
    if (!deletingTeam) return;
    const team = deletingTeam;
    const teamKey = getTeamKey(team);
    setIsDeleting(true);
    try {
      await API.delete(`/teams/${encodeURIComponent(teamKey)}`, { params: { eventId } });
      await refreshTeams(`Team ${team.number} deleted successfully.`);
      setSelectedTeam(null);
      setDeletingTeam(null);
    } catch (error) {
      setPageMessage({ type: 'error', text: getApiErrorMessage(error, 'Unable to delete the team. Try again.') });
    } finally {
      setIsDeleting(false);
    }
  }

  function openEdit(team) {
    setSelectedTeam(null);
    setEditingTeam(team);
  }

  const isBusy = isLoading || isReading || isSaving || isImporting || isDeleting;

  return (
    <OrganizerLayout
      activeKey="teams"
      eventId={eventId}
      wrapperClassName="teams-dashboard"
      contentClassName="dashboard-content teams-content"
      searchValue={search}
      onSearchChange={(event) => setSearch(event.target.value)}
      searchAriaLabel="Search teams"
      userName="Admin"
      userRole="Organizer"
      userInitial="A"
    >
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
            {isLoading ? (
              <p className="teams-empty-message" role="status">Loading teams...</p>
            ) : teams.length === 0 ? (
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
                        <tr key={getTeamKey(team) || team.number}>
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
                              onChange={(event) => updateStatus(getTeamKey(team), event.target.value)}
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
          onSave={async (team) => {
            setIsSaving(true);
            try {
              const result = await saveTeam(team);
              return result;
            } finally {
              setIsSaving(false);
            }
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
    </OrganizerLayout>
  );
}

export default OrganizerTeams;
