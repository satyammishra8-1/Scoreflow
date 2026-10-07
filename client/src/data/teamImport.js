import {
  createLocalId,
  normalizeExternalUrl,
  normalizeMemberIdentifier,
} from './teamValidation';

const requiredColumns = ['teamNumber', 'memberName'];

const columnAliases = {
  teamNumber: ['team', 'teamno', 'teamnumber', 'teamid'],
  teamName: ['teamname', 'nameoftheteam', 'groupname'],
  memberName: ['name', 'membername', 'participantname', 'studentname', 'nameofstudent'],
  usn: ['usn', 'studentid', 'memberid', 'registerno', 'registernumber', 'registrationnumber', 'regno', 'rollno', 'rollnumber'],
  section: ['section', 'classsection'],
  email: ['email', 'emailaddress', 'memberemail'],
  github: ['github', 'githublink', 'githuburl', 'repository', 'repositoryurl'],
  demo: ['demo', 'demolink', 'demourl', 'projectdemo'],
  project: [
    'project',
    'projectname',
    'problem',
    'problemstatement',
    'problemproject',
    'nameofproject',
    'nameoftheminiproject',
    'nameofminiproject',
    'miniproject',
  ],
  judge: ['judge', 'judges', 'assignedjudge', 'assignedjudges'],
};

const sampleRows = [
  ['T01', 'CodeX', 'Rahul Sharma', 'rahul@example.com', 'https://github.com/rahul', 'https://rahul-demo.example.com'],
  ['T01', 'CodeX', 'Aman Kumar', 'aman@example.com', 'https://github.com/aman', 'https://aman-demo.example.com'],
  ['T01', 'CodeX', 'Ravi Kumar', 'ravi@example.com', 'https://github.com/ravi', 'https://ravi-demo.example.com'],
  ['T02', 'AI Squad', 'Priya Singh', 'priya@example.com', 'https://github.com/priya', 'https://priya-demo.example.com'],
  ['T02', 'AI Squad', 'Ankit Sharma', 'ankit@example.com', 'https://github.com/ankit', 'https://ankit-demo.example.com'],
  ['T03', 'GreenTech', 'Meera Joshi', 'meera@example.com', '', 'https://greentech.example.com'],
];

function cleanCell(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizedColumn(value) {
  return cleanCell(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rowError(rowNumber, teamNumber, problem, suggestion) {
  return { rowNumber, teamNumber: teamNumber || '—', problem, suggestion };
}

function rowWarning(rowNumber, teamNumber, code, message) {
  return { rowNumber, teamNumber: teamNumber || '—', code, message };
}

function buildColumnMap(headers) {
  const normalizedHeaders = headers.map(normalizedColumn);
  const columnMap = {};
  const duplicates = [];

  Object.entries(columnAliases).forEach(([field, aliases]) => {
    const matches = normalizedHeaders
      .map((header, index) => aliases.includes(header) ? index : -1)
      .filter((index) => index >= 0);
    if (matches.length > 1) {
      duplicates.push(field);
    } else if (matches.length === 1) {
      columnMap[field] = matches[0];
    }
  });

  return { columnMap, duplicates };
}

export async function createSampleWorkbook() {
  const XLSX = await import('@e965/xlsx');
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Team No.', 'Team Name', 'Member Name', 'Email', 'GitHub', 'Demo'],
    ...sampleRows,
  ]);
  worksheet['!cols'] = [
    { wch: 12 },
    { wch: 20 },
    { wch: 22 },
    { wch: 28 },
    { wch: 38 },
    { wch: 38 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Teams');
  XLSX.writeFile(workbook, 'scoreflow-sample-teams.xlsx');
}

export async function parseTeamWorkbook(file) {
  if (!file || file.size === 0) throw new Error('The selected file is empty.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['xlsx', 'xls'].includes(extension || '')) {
    throw new Error('Unsupported file type. Choose an .xlsx or .xls workbook.');
  }

  let workbook;
  let XLSX;
  try {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength === 0) throw new Error('The selected file is empty.');
    XLSX = await import('@e965/xlsx');
    workbook = XLSX.read(buffer, { type: 'array', cellDates: false, dense: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'The selected file is empty.') throw error;
    throw new Error('Unable to read this Excel file. Please check the file format.');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('This workbook does not contain a worksheet.');
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: true,
  });
  const firstContentIndex = rawRows.findIndex((row) => row.some((cell) => cleanCell(cell)));
  if (firstContentIndex < 0) throw new Error('This worksheet is empty.');
  const completeHeaderIndex = rawRows.findIndex((row) => {
    const { columnMap } = buildColumnMap(row.map(cleanCell));
    return requiredColumns.every((field) => columnMap[field] !== undefined);
  });
  const headerIndex = completeHeaderIndex >= 0 ? completeHeaderIndex : firstContentIndex;

  const headers = rawRows[headerIndex].map(cleanCell);
  const { columnMap, duplicates } = buildColumnMap(headers);
  if (duplicates.length > 0) {
    throw new Error(`The worksheet has multiple columns for: ${duplicates.join(', ')}. Keep one column for each field.`);
  }
  const missingColumns = requiredColumns.filter((field) => columnMap[field] === undefined);
  if (missingColumns.length > 0) {
    const labels = {
      teamNumber: 'Team No.',
      memberName: 'Member Name',
    };
    throw new Error(
      `This worksheet is missing the required ${missingColumns.map((field) => labels[field]).join(' and ')} column${missingColumns.length === 1 ? '' : 's'}. Supported member headers include “Name” and “Member Name”.`,
    );
  }

  const rawDataRows = rawRows.slice(headerIndex + 1)
    .map((cells, index) => ({
      rowNumber: headerIndex + index + 2,
      cells,
    }));
  let lastDataRowIndex = rawDataRows.length - 1;
  while (lastDataRowIndex >= 0 && !rawDataRows[lastDataRowIndex].cells.some((cell) => cleanCell(cell))) {
    lastDataRowIndex -= 1;
  }
  const worksheetRows = rawDataRows.slice(0, lastDataRowIndex + 1);
  const sourceRows = worksheetRows.filter(({ cells }) => cells.some((cell) => cleanCell(cell)));
  if (sourceRows.length === 0) throw new Error('This worksheet has headers but no team rows.');

  const errors = [];
  const warnings = [];
  const warningRows = new Set();
  const teamsByNumber = new Map();
  const memberRows = [];
  let currentTeamNumber = '';
  let currentProject = '';
  let currentTeamName = '';

  function addWarning(rowNumber, teamNumber, code, message) {
    warnings.push(rowWarning(rowNumber, teamNumber, code, message));
    warningRows.add(rowNumber);
  }

  worksheetRows.forEach(({ rowNumber, cells }) => {
    const value = (field) => columnMap[field] === undefined ? '' : cleanCell(cells[columnMap[field]]);
    const explicitTeamNumber = value('teamNumber');
    const explicitTeamName = value('teamName');
    const explicitProject = value('project');
    const memberName = value('memberName');
    const usn = value('usn');
    const section = value('section');
    const email = value('email').toLowerCase();
    const githubInput = value('github');
    const demoInput = value('demo');
    const judge = value('judge');
    const hasRecognizedValues = [
      explicitTeamNumber, explicitTeamName, explicitProject, memberName, usn,
      section, email, githubInput, demoInput, judge,
    ].some(Boolean);
    if (!hasRecognizedValues) return;

    if (explicitTeamNumber) {
      const isNewTeam = normalizeMemberIdentifier(explicitTeamNumber) !== normalizeMemberIdentifier(currentTeamNumber);
      currentTeamNumber = explicitTeamNumber;
      currentProject = isNewTeam ? explicitProject : explicitProject || currentProject;
      currentTeamName = isNewTeam ? explicitTeamName : explicitTeamName || currentTeamName;
    } else {
      if (explicitProject) currentProject = explicitProject;
      if (explicitTeamName) currentTeamName = explicitTeamName;
    }

    const teamNumber = explicitTeamNumber || currentTeamNumber;
    const project = explicitProject || currentProject;
    const teamName = explicitTeamName || currentTeamName;

    if (!memberName) {
      errors.push(rowError(
        rowNumber,
        teamNumber,
        teamNumber ? 'Team Number exists, but Member Name is missing.' : 'Member Name is missing.',
        'Enter the student/member name for this row or remove the incomplete row.',
      ));
      return;
    }

    if (!teamNumber) {
      errors.push(rowError(
        rowNumber,
        '',
        `Member ${memberName} appears before the first Team No.`,
        'Add a Team No. above this row or move it into its team section.',
      ));
      return;
    }

    const rowErrors = [];
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      rowErrors.push(rowError(rowNumber, teamNumber, `Invalid email: ${email}`, 'Enter a valid email address or leave Email blank.'));
    }
    const github = normalizeExternalUrl(githubInput);
    const demo = normalizeExternalUrl(demoInput);
    if (github === null) rowErrors.push(rowError(rowNumber, teamNumber, `Invalid GitHub URL: ${githubInput}`, 'Enter an http(s) URL or leave GitHub blank.'));
    if (demo === null) rowErrors.push(rowError(rowNumber, teamNumber, `Invalid Demo URL: ${demoInput}`, 'Enter an http(s) URL or leave Demo blank.'));
    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

    const key = teamNumber.toLowerCase();
    let team = teamsByNumber.get(key);
    if (!team) {
      team = {
        id: createLocalId('team'),
        eventId: '',
        number: teamNumber,
        name: teamName || `Team ${teamNumber}`,
        project: project || teamName || '',
        members: [],
        judges: [],
        status: 'Pending',
        github: '',
        demo: '',
        createdAt: new Date().toISOString(),
      };
      teamsByNumber.set(key, team);
    } else {
      if (explicitTeamName && team.name !== `Team ${teamNumber}` && explicitTeamName.toLowerCase() !== team.name.toLowerCase()) {
        errors.push(rowError(
          rowNumber,
          teamNumber,
          `Team No. ${teamNumber} has conflicting team names (“${team.name}” and “${explicitTeamName}”).`,
          'Use the same Team Name for every row with this Team No.',
        ));
        return;
      }
      if (explicitTeamName && team.name === `Team ${teamNumber}`) team.name = explicitTeamName;
      if (explicitProject) team.project = explicitProject;
    }

    if (!team.project && project) team.project = project;
    if (!teamName && !team.name) team.name = `Team ${teamNumber}`;
    if (judge && !team.judges.includes(judge)) team.judges.push(judge);

    const member = {
      id: createLocalId('member'),
      name: memberName,
      email,
      usn,
      section,
      github: github || '',
      demo: demo || '',
    };
    team.members.push(member);
    memberRows.push(rowNumber);

    if (columnMap.email === undefined) {
      addWarning(rowNumber, teamNumber, 'email-column-missing', 'Email column not found; this field is optional and will be stored as blank.');
    } else if (!email) {
      addWarning(rowNumber, teamNumber, 'email-blank', 'Email is blank; this is allowed and will be stored as blank.');
    }
    if (columnMap.github === undefined) {
      addWarning(rowNumber, teamNumber, 'github-column-missing', 'GitHub column not found; this field is optional and will be stored as blank.');
    } else if (!github) {
      addWarning(rowNumber, teamNumber, 'github-blank', 'GitHub is blank; this is allowed and will be stored as blank.');
    }
    if (columnMap.demo === undefined) {
      addWarning(rowNumber, teamNumber, 'demo-column-missing', 'Demo column not found; this field is optional and will be stored as blank.');
    } else if (!demo) {
      addWarning(rowNumber, teamNumber, 'demo-blank', 'Demo is blank; this is allowed and will be stored as blank.');
    }
    if (!usn && columnMap.usn !== undefined) addWarning(rowNumber, teamNumber, 'missing-usn', 'USN/member ID is not provided; this is allowed.');
    if (!section && columnMap.section !== undefined) addWarning(rowNumber, teamNumber, 'missing-section', 'Section is not provided; this is allowed.');
    if (columnMap.email !== undefined && !email) {
      addWarning(rowNumber, teamNumber, 'email-blank', 'Email is blank; this is allowed and will be stored as blank.');
    }
    if (columnMap.github !== undefined && !github) {
      addWarning(rowNumber, teamNumber, 'github-blank', 'GitHub is blank; this is allowed and will be stored as blank.');
    }
    if (columnMap.demo !== undefined && !demo) {
      addWarning(rowNumber, teamNumber, 'demo-blank', 'Demo is blank; this is allowed and will be stored as blank.');
    }
  });

  teamsByNumber.forEach((team) => {
    if (!team.project) {
      team.project = `Team ${team.number}`;
      addWarning(
        sourceRows.find(({ cells }) => cleanCell(cells[columnMap.teamNumber]) === team.number)?.rowNumber || headerIndex + 2,
        team.number,
        'missing-project',
        'A project name was not provided; fallback team names were used for the affected teams.',
      );
    }
  });

  const invalidRows = new Set(errors.map((item) => item.rowNumber));
  const groupedWarnings = [...new Map(warnings.map((warning) => [warning.code, warning])).values()]
    .map((warning) => {
      const matches = warnings.filter((item) => item.code === warning.code);
      return {
        ...warning,
        rows: matches.map((item) => item.rowNumber),
        count: matches.length,
      };
    });
  const validRowCount = memberRows.filter((rowNumber) => !invalidRows.has(rowNumber)).length;
  const groupedTeams = [...teamsByNumber.values()].filter((team) => team.members.length > 0);
  return {
    totalRows: worksheetRows.length,
    validRows: validRowCount,
    invalidRows: invalidRows.size,
    warningRows: warningRows.size,
    ignoredEmptyRows: worksheetRows.length - sourceRows.length,
    teams: groupedTeams,
    teamsDetected: groupedTeams.length,
    membersDetected: groupedTeams.reduce((sum, team) => sum + team.members.length, 0),
    errors,
    warnings: groupedWarnings,
  };
}
