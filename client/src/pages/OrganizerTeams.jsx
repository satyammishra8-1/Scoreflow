import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import './OrganizerDashboard.css';
import './OrganizerTeams.css';

const importColumns = [
  'Team No.',
  'Team Name',
  'Problem / Project',
  'Member Name',
  'Email',
  'GitHub',
  'Demo Link',
  'Judge',
];

const initialTeams = [
  {
    id: 'T01',
    number: 'T01',
    name: 'CodeX',
    project: 'AI Healthcare Assistant',
    members: [
      { name: 'Rahul Sharma', email: '' },
      { name: 'Amit Kumar', email: '' },
      { name: 'Priya Nair', email: '' },
      { name: 'Karan Shah', email: '' },
    ],
    judges: ['Priya Sharma', 'Rahul Mehta'],
    status: 'Pending',
    github: 'https://github.com/',
    demo: 'https://example.com/',
  },
  {
    id: 'T02',
    number: 'T02',
    name: 'Innovators',
    project: 'Smart Traffic System',
    members: [
      { name: 'Aarav Patel', email: '' },
      { name: 'Isha Rao', email: '' },
      { name: 'Dev Mehta', email: '' },
    ],
    judges: ['Ankit Verma', 'Neha Kapoor'],
    status: 'Complete',
    github: 'https://github.com/',
    demo: 'https://example.com/',
  },
  {
    id: 'T03',
    number: 'T03',
    name: 'TechNova',
    project: 'AI Agriculture',
    members: [
      { name: 'Meera Joshi', email: '' },
      { name: 'Rohan Das', email: '' },
      { name: 'Sana Khan', email: '' },
      { name: 'Arjun Rao', email: '' },
      { name: 'Nikhil Jain', email: '' },
    ],
    judges: ['Priya Sharma', 'Ankit Verma'],
    status: 'Pending',
    github: 'https://github.com/',
    demo: 'https://example.com/',
  },
  {
    id: 'T04',
    number: 'T04',
    name: 'VisionX',
    project: 'Smart Education',
    members: [
      { name: 'Aditi Gupta', email: '' },
      { name: 'Kabir Singh', email: '' },
      { name: 'Tara Iyer', email: '' },
      { name: 'Vikram Bose', email: '' },
    ],
    judges: ['Rahul Mehta', 'Neha Kapoor'],
    status: 'Complete',
    github: 'https://github.com/',
    demo: 'https://example.com/',
  },
];

const columnIndex = (reference) => {
  const letters = reference.match(/^[A-Z]+/)?.[0] || '';
  return [...letters].reduce((index, character) => index * 26 + character.charCodeAt(0) - 64, 0) - 1;
};

function getZipEntry(bytes, filename) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimum = Math.max(0, bytes.length - 65_557);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error('This Excel file has an invalid ZIP directory.');

  const entryCount = view.getUint16(endOffset + 10, true);
  let entryOffset = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(entryOffset, true) !== 0x02014b50) {
      throw new Error('This Excel file has an invalid ZIP entry.');
    }
    const method = view.getUint16(entryOffset + 10, true);
    const compressedSize = view.getUint32(entryOffset + 20, true);
    const nameLength = view.getUint16(entryOffset + 28, true);
    const extraLength = view.getUint16(entryOffset + 30, true);
    const commentLength = view.getUint16(entryOffset + 32, true);
    const localOffset = view.getUint32(entryOffset + 42, true);
    const nameStart = entryOffset + 46;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));

    if (name === filename) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      if (method === 0) return compressed;
      if (method !== 8 || typeof DecompressionStream === 'undefined') {
        throw new Error('This browser cannot decompress this Excel file.');
      }
      return new Response(
        new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw')),
      ).arrayBuffer().then((buffer) => new Uint8Array(buffer));
    }
    entryOffset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

function parseWorksheet(xml, sharedStrings) {
  const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
  if (documentXml.querySelector('parsererror')) throw new Error('Excel worksheet XML could not be read.');
  return [...documentXml.getElementsByTagName('row')].map((row) => {
    const cells = [];
    for (const cell of row.getElementsByTagName('c')) {
      const index = columnIndex(cell.getAttribute('r') || '');
      if (index < 0) continue;
      const type = cell.getAttribute('t');
      let value = '';
      if (type === 'inlineStr') {
        value = [...cell.getElementsByTagName('t')].map((text) => text.textContent || '').join('');
      } else {
        const raw = cell.getElementsByTagName('v')[0]?.textContent || '';
        value = type === 's' ? sharedStrings[Number(raw)] || '' : raw;
      }
      cells[index] = value;
    }
    return cells.map((value) => value || '');
  });
}

async function readExcelFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sharedXmlBytes = await getZipEntry(bytes, 'xl/sharedStrings.xml');
  const sheetXmlBytes = await getZipEntry(bytes, 'xl/worksheets/sheet1.xml');
  if (!sheetXmlBytes) throw new Error('No worksheet was found in this Excel file.');
  const decoder = new TextDecoder();
  const sharedStrings = sharedXmlBytes
    ? [...new DOMParser().parseFromString(decoder.decode(sharedXmlBytes), 'application/xml').getElementsByTagName('si')]
      .map((item) => [...item.getElementsByTagName('t')].map((text) => text.textContent || '').join(''))
    : [];
  return parseWorksheet(decoder.decode(sheetXmlBytes), sharedStrings);
}

function getCell(row, headers, heading) {
  const index = headers.findIndex((header) => header.trim().toLowerCase() === heading.toLowerCase());
  return index < 0 ? '' : String(row[index] || '').trim();
}

function isSafeExternalLink(value) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function buildImportedTeams(rows) {
  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) => String(header || '').trim());
  const required = importColumns.map((column) => column.toLowerCase());
  const missing = required.filter((heading) => !headers.some((header) => header.toLowerCase() === heading));
  if (missing.length > 0) {
    throw new Error(`Missing required Excel column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
  }

  const groups = new Map();
  dataRows.forEach((row, index) => {
    const number = getCell(row, headers, 'Team No.');
    const name = getCell(row, headers, 'Team Name');
    const project = getCell(row, headers, 'Problem / Project');
    const memberName = getCell(row, headers, 'Member Name');
    if (!number && !name && !project && !memberName) return;
    if (!number || !name || !project || !memberName) {
      throw new Error(`Excel row ${index + 2} needs Team No., Team Name, Problem / Project, and Member Name.`);
    }
    const key = number.toLowerCase();
    const team = groups.get(key) || {
      id: `import-${key}`,
      number,
      name,
      project,
      members: [],
      judges: [],
      status: 'Pending',
      github: '',
      demo: '',
    };
    if (team.name !== name || team.project !== project) {
      throw new Error(`Team ${number} has conflicting names or project details in the Excel rows.`);
    }
    const email = getCell(row, headers, 'Email');
    if (!team.members.some((member) => member.name === memberName && member.email === email)) {
      team.members.push({ name: memberName, email });
    }
    const judge = getCell(row, headers, 'Judge');
    if (judge && !team.judges.includes(judge)) team.judges.push(judge);
    const github = getCell(row, headers, 'GitHub');
    const demo = getCell(row, headers, 'Demo Link');
    if (github) team.github = github;
    if (demo) team.demo = demo;
    groups.set(key, team);
  });
  return [...groups.values()];
}

function readSavedTeams(storageKey) {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return { teams: initialTeams, error: '' };
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every((team) => (
      team && typeof team.number === 'string' &&
      typeof team.name === 'string' &&
      typeof team.project === 'string' &&
      Array.isArray(team.members) &&
      team.members.every((member) => (
        member && typeof member.name === 'string' && typeof member.email === 'string'
      )) &&
      Array.isArray(team.judges) &&
      team.judges.every((judge) => typeof judge === 'string') &&
      typeof team.github === 'string' &&
      typeof team.demo === 'string' &&
      ['Pending', 'Complete'].includes(team.status)
    ))) {
      throw new Error('Saved team data is invalid.');
    }
    return { teams: parsed, error: '' };
  } catch {
    return { teams: initialTeams, error: 'Unable to load saved teams from this browser.' };
  }
}

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
          <Link className="sidebar-link sidebar-link-active" to={`/organizer/events/${eventId}/teams`} onClick={closeMenu}>
            <span className="sidebar-icon" aria-hidden="true">♧</span><span>Teams</span>
            <span className="active-indicator" />
          </Link>
          {[
            ['Judges', '♙'],
            ['Evaluation Criteria', '☷'],
            ['Results', '▤'],
            ['Feedback & Emails', '✉'],
          ].map(([label, icon]) => (
            <a className="sidebar-link" href="#" key={label} onClick={closeMenu}>
              <span className="sidebar-icon" aria-hidden="true">{icon}</span><span>{label}</span>
            </a>
          ))}
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

function TeamModal({ team, onClose }) {
  if (!team) return null;
  return (
    <div
      className="teams-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="teams-modal" role="dialog" aria-modal="true" aria-labelledby="team-details-title">
        <div className="teams-modal-header">
          <div>
            <p className="teams-eyebrow">{team.number}</p>
            <h2 id="team-details-title">{team.name}</h2>
          </div>
          <button className="teams-icon-button" type="button" onClick={onClose} aria-label="Close team details">×</button>
        </div>
        <dl className="team-detail-list">
          <div><dt>Project / Problem Statement</dt><dd>{team.project}</dd></div>
          <div>
            <dt>Members</dt>
            <dd>
              <ul>
                {team.members.map((member, index) => (
                  <li key={`${member.name}-${member.email}-${index}`}>
                    {member.name}{member.email ? ` · ${member.email}` : ''}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <div><dt>Assigned Judges</dt><dd>{team.judges.join(', ') || 'No judges assigned'}</dd></div>
          <div><dt>Status</dt><dd><span className={`team-status-badge team-status-${team.status.toLowerCase()}`}>{team.status}</span></dd></div>
          <div><dt>GitHub</dt><dd>{team.github ? (
            isSafeExternalLink(team.github)
              ? <a href={team.github} target="_blank" rel="noreferrer">{team.github}</a>
              : team.github
          ) : 'Not provided'}</dd></div>
          <div><dt>Demo Link</dt><dd>{team.demo ? (
            isSafeExternalLink(team.demo)
              ? <a href={team.demo} target="_blank" rel="noreferrer">{team.demo}</a>
              : team.demo
          ) : 'Not provided'}</dd></div>
        </dl>
      </section>
    </div>
  );
}

function AddTeamModal({ existingTeams, onClose, onAdd }) {
  const [form, setForm] = useState({
    number: '', name: '', project: '', members: '', judges: '', github: '', demo: '',
  });
  const [error, setError] = useState('');
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  function submit(event) {
    event.preventDefault();
    const number = form.number.trim();
    const name = form.name.trim();
    const project = form.project.trim();
    const members = form.members.split(',').map((member) => member.trim()).filter(Boolean);
    if (!number || !name || !project || members.length === 0) {
      setError('Enter the team number, team name, project, and at least one member.');
      return;
    }
    if (existingTeams.some((team) => team.number.toLowerCase() === number.toLowerCase())) {
      setError(`A team with number ${number} already exists.`);
      return;
    }
    const saved = onAdd({
      id: `team-${Date.now()}`,
      number,
      name,
      project,
      members: members.map((member) => ({ name: member, email: '' })),
      judges: form.judges.split(',').map((judge) => judge.trim()).filter(Boolean),
      status: 'Pending',
      github: form.github.trim(),
      demo: form.demo.trim(),
    });
    if (!saved) setError('Unable to save this team. Check the page for details.');
  }

  return (
    <div className="teams-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="teams-modal teams-form-modal" role="dialog" aria-modal="true" aria-labelledby="add-team-title">
        <div className="teams-modal-header">
          <div><p className="teams-eyebrow">TEAM SETUP</p><h2 id="add-team-title">Add Team</h2></div>
          <button className="teams-icon-button" type="button" onClick={onClose} aria-label="Close add team form">×</button>
        </div>
        <form className="teams-add-form" onSubmit={submit}>
          {[
            ['number', 'Team Number', 'T05'],
            ['name', 'Team Name', 'Team name'],
            ['project', 'Problem / Project', 'Project name'],
            ['members', 'Member Names', 'Separate names with commas'],
            ['judges', 'Assigned Judges', 'Separate names with commas'],
            ['github', 'GitHub Link', 'https://github.com/...'],
            ['demo', 'Demo Link', 'https://...'],
          ].map(([field, label, placeholder]) => (
            <label className="teams-form-field" key={field}>
              <span>{label}{['number', 'name', 'project', 'members'].includes(field) && <b> *</b>}</span>
              <input
                value={form[field]}
                placeholder={placeholder}
                onChange={(event) => update(field, event.target.value)}
              />
            </label>
          ))}
          {error && <p className="teams-form-error" role="alert">{error}</p>}
          <div className="teams-form-actions">
            <button className="teams-secondary-button" type="button" onClick={onClose}>Cancel</button>
            <button className="teams-primary-button" type="submit">Save Team</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ImportModal({ headers, previewRows, onCancel, onConfirm }) {
  return (
    <div className="teams-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section className="teams-modal teams-import-modal" role="dialog" aria-modal="true" aria-labelledby="import-preview-title">
        <div className="teams-modal-header">
          <div>
            <p className="teams-eyebrow">IMPORT TEAMS</p>
            <h2 id="import-preview-title">Review import</h2>
            <p className="teams-modal-subtitle">{previewRows.length} spreadsheet rows detected. Repeated team numbers will be grouped together.</p>
          </div>
          <button className="teams-icon-button" type="button" onClick={onCancel} aria-label="Close import preview">×</button>
        </div>
        <div className="teams-preview-wrap">
          <table className="teams-preview-table">
            <thead><tr>{importColumns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>
              {previewRows.map((row, index) => (
                <tr key={`preview-${index}`}>
                  {importColumns.map((column) => {
                    const columnIndexInFile = headers.findIndex(
                      (header) => String(header || '').trim().toLowerCase() === column.toLowerCase(),
                    );
                    return <td key={column}>{row[columnIndexInFile] || '—'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="teams-form-actions">
          <button className="teams-secondary-button" type="button" onClick={onCancel}>Cancel</button>
          <button className="teams-primary-button" type="button" onClick={onConfirm}>Confirm Import</button>
        </div>
      </section>
    </div>
  );
}

function OrganizerTeams() {
  const { eventId = 'default' } = useParams();
  const storageKey = `scoreflow.organizer.event.${eventId}.teams`;
  const [initialData] = useState(() => readSavedTeams(storageKey));
  const [teams, setTeams] = useState(initialData.teams);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [pageError, setPageError] = useState(initialData.error);
  const [importError, setImportError] = useState('');
  const fileInput = useRef(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const filteredTeams = useMemo(() => {
    const query = search.trim().toLowerCase();
    return teams.filter((team) => {
      const matchesSearch = !query || [team.number, team.name, team.project]
        .some((value) => value.toLowerCase().includes(query));
      return matchesSearch && (statusFilter === 'All' || team.status === statusFilter);
    });
  }, [teams, search, statusFilter]);

  function saveTeams(nextTeams) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextTeams));
      setTeams(nextTeams);
      setPageError('');
      return true;
    } catch {
      setPageError('Unable to save teams in this browser. Check available local storage.');
      return false;
    }
  }

  function addTeam(team) {
    if (teams.some((existing) => existing.number.toLowerCase() === team.number.toLowerCase())) {
      setPageError(`A team with number ${team.number} already exists.`);
      return false;
    }
    if (!saveTeams([...teams, team])) return false;
    setIsAddOpen(false);
    return true;
  }

  function updateStatus(teamId, status) {
    saveTeams(teams.map((team) => team.id === teamId ? { ...team, status } : team));
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportError('');
    try {
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        throw new Error('Choose an .xlsx Excel workbook.');
      }
      const rows = await readExcelFile(file);
      const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell || '').trim()));
      const tableRows = rows.slice(headerIndex).filter((row) => row.some((cell) => String(cell || '').trim()));
      if (tableRows.length < 2) throw new Error('The Excel file has no team rows to preview.');
      buildImportedTeams(tableRows);
      setPreviewData({ headers: tableRows[0], rows: tableRows.slice(1) });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to read this Excel file.');
    }
  }

  function confirmImport() {
    try {
      const imported = buildImportedTeams([previewData.headers, ...previewData.rows]);
      if (imported.length === 0) throw new Error('No valid teams were found in the preview.');
      const merged = [...teams];
      imported.forEach((team) => {
        const existingIndex = merged.findIndex((item) => item.number.toLowerCase() === team.number.toLowerCase());
        if (existingIndex < 0) {
          merged.push(team);
          return;
        }
        const existing = merged[existingIndex];
        const members = [...existing.members];
        team.members.forEach((member) => {
          if (!members.some((current) => current.name === member.name && current.email === member.email)) {
            members.push(member);
          }
        });
        merged[existingIndex] = {
          ...existing,
          members,
          judges: [...new Set([...existing.judges, ...team.judges])],
          github: team.github || existing.github,
          demo: team.demo || existing.demo,
        };
      });
      if (saveTeams(merged)) {
        setPreviewData(null);
        setImportError('');
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to import these teams.');
      setPreviewData(null);
    }
  }

  const pendingCount = teams.filter((team) => team.status === 'Pending').length;
  const completeCount = teams.filter((team) => team.status === 'Complete').length;

  return (
    <div className="sf-dashboard teams-dashboard">
      <TeamSidebar
        eventId={eventId}
        isOpen={isMenuOpen}
        closeMenu={() => setIsMenuOpen(false)}
      />
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
              <h1>Teams</h1>
              <p>Manage participating teams and their assignments.</p>
            </div>
            <div className="teams-heading-actions">
              <button className="teams-secondary-button" type="button" onClick={() => fileInput.current?.click()}>
                <span aria-hidden="true">⇧</span> Import Teams
              </button>
              <input
                ref={fileInput}
                className="teams-file-input"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
                aria-label="Choose Excel workbook"
              />
              <button className="teams-primary-button" type="button" onClick={() => setIsAddOpen(true)}>
                <span aria-hidden="true">+</span> Add Team
              </button>
            </div>
          </div>

          {pageError && <p className="teams-alert" role="alert">{pageError}</p>}
          {importError && <p className="teams-alert" role="alert">{importError}</p>}

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
                  placeholder="Search by team number, team or project..."
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
            <div className="teams-table-scroll">
              <table className="teams-table">
                <thead>
                  <tr>
                    <th>Team</th><th>Problem / Project</th><th>Members</th>
                    <th>Assigned Judges</th><th>Status</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeams.map((team) => (
                    <tr key={team.id}>
                      <td>
                        <div className="team-name-cell">
                          <strong>{team.number} · {team.name}</strong>
                        </div>
                      </td>
                      <td>{team.project}</td>
                      <td>{team.members.length} Members</td>
                      <td>{team.judges.join(', ') || '—'}</td>
                      <td>
                        <select
                          className={`team-status-select team-status-${team.status.toLowerCase()}`}
                          value={team.status}
                          aria-label={`${team.number} status`}
                          onChange={(event) => updateStatus(team.id, event.target.value)}
                        >
                          <option>Pending</option><option>Complete</option>
                        </select>
                      </td>
                      <td><button className="team-view-button" type="button" onClick={() => setSelectedTeam(team)}>View Details</button></td>
                    </tr>
                  ))}
                  {filteredTeams.length === 0 && (
                    <tr><td className="teams-empty-cell" colSpan="6">No teams match your search or selected status.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="teams-table-footer">Showing {filteredTeams.length} of {teams.length} teams</div>
          </section>
        </main>
      </div>

      <TeamModal team={selectedTeam} onClose={() => setSelectedTeam(null)} />
      {isAddOpen && (
        <AddTeamModal
          existingTeams={teams}
          onClose={() => setIsAddOpen(false)}
          onAdd={addTeam}
        />
      )}
      {previewData && (
        <ImportModal
          headers={previewData.headers}
          previewRows={previewData.rows}
          onCancel={() => setPreviewData(null)}
          onConfirm={confirmImport}
        />
      )}
    </div>
  );
}

export default OrganizerTeams;
