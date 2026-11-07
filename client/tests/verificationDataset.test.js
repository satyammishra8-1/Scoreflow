import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from '@e965/xlsx';
import { parseTeamWorkbook, buildTeamImportPlan } from '../src/data/teamImport.js';
import { buildEventResults } from '../src/data/resultsUtils.js';

const eventId = 'event-technova';
const criteria = [
  { name: 'Innovation', maxMarks: 30, weight: 30 },
  { name: 'Technical Implementation', maxMarks: 40, weight: 40 },
  { name: 'Presentation', maxMarks: 20, weight: 20 },
  { name: 'Impact & Feasibility', maxMarks: 10, weight: 10 },
];

async function workbookFile(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Teams');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return { name: 'technova-verification.xlsx', size: bytes.byteLength, arrayBuffer: async () => bytes };
}

test('Excel import groups five teams and a repeated import can skip every existing team', async () => {
  const rows = [['Team No.', 'Team Name', 'Project', 'Member Name', 'Email', 'GitHub', 'Demo']];
  const teams = [
    ['NovaTech', [['Aarav Kumar', 'team1member1'], ['Riya Sharma', 'team1member2'], ['Karan Verma', 'team1member3'], ['Ananya Singh', 'team1member4']]],
    ['CodeForge', [['Aditya Rao', 'team2member1'], ['Sneha Patel', 'team2member2'], ['Rohit Gupta', 'team2member3']]],
    ['ByteBuilders', [['Vivek Nair', 'team3member1'], ['Meera Joshi', 'team3member2'], ['Arjun Kapoor', 'team3member3'], ['Pooja Shah', 'team3member4']]],
    ['NeuralNest', [['Rahul Das', 'team4member1'], ['Ishita Mehta', 'team4member2'], ['Aman Jain', 'team4member3']]],
    ['DevPulse', [['Nikhil Agarwal', 'team5member1'], ['Simran Kaur', 'team5member2'], ['Yash Malhotra', 'team5member3'], ['Neha Iyer', 'team5member4']]],
  ];
  teams.forEach(([teamName, members], index) => members.forEach(([name, alias], memberIndex) => rows.push([
    memberIndex === 0 ? String(index + 1) : '',
    memberIndex === 0 ? teamName : '',
    memberIndex === 0 ? `${teamName} demo project` : '',
    name,
    `satmis2024+${alias}@gmail.com`,
    `https://github.com/scoreflow-demo/team-${index + 1}`,
    `https://team-${index + 1}.demo.scoreflow.test`,
  ])));

  const parsed = await parseTeamWorkbook(await workbookFile(rows));
  assert.equal(parsed.invalidRows, 0);
  assert.equal(parsed.teamsDetected, 5);
  assert.equal(parsed.membersDetected, 18);
  assert.deepEqual(parsed.teams.map((team) => team.number), ['1', '2', '3', '4', '5']);
  assert.deepEqual(parsed.teams.map((team) => team.members.length), [4, 3, 4, 3, 4]);
  const emails = parsed.teams.flatMap((team) => team.members.map((member) => member.email));
  assert.equal(new Set(emails).size, 18);
  assert.ok(emails.every((email) => /^satmis2024\+team[1-5]member[1-4]@gmail\.com$/.test(email)));
  assert.ok(parsed.teams.every((team) => team.members.every((member) => /^https:\/\/github\.com\//.test(member.github) && member.demo.endsWith('.scoreflow.test/'))));

  const initialPlan = buildTeamImportPlan(parsed.teams, [], '');
  assert.equal(initialPlan.filter((item) => item.action === 'add').length, 5);
  const persistedTeams = parsed.teams.map((team, index) => ({ ...team, id: `db-team-${index}`, eventId }));
  const repeatedPlan = buildTeamImportPlan(parsed.teams, persistedTeams, 'skip');
  assert.equal(repeatedPlan.filter((item) => item.action === 'add').length, 0);
  assert.equal(repeatedPlan.filter((item) => item.action === 'skip').length, 5);
});

test('results compute weighted scores, preserve pending rows, show judge progress, and isolate events', () => {
  const teams = Array.from({ length: 5 }, (_, index) => ({
    _id: `team-${index + 1}`, eventId, teamNumber: String(index + 1), teamName: `Team ${index + 1}`,
  }));
  const judges = [
    { _id: 'rahul', eventId, name: 'Dr. Rahul Mehta', assignedTeamIds: ['team-1', 'team-3', 'team-5'] },
    { _id: 'priya', eventId, name: 'Priya Nair', assignedTeamIds: ['team-2', 'team-4'] },
    { _id: 'arjun', eventId, name: 'Arjun Sharma', assignedTeamIds: ['team-1', 'team-5'] },
  ];
  const scores = (values) => Object.fromEntries(values.map((value, index) => [`criterion-${index + 1}`, value]));
  const evaluations = [
    { eventId, judgeId: 'rahul', teamId: 'team-1', status: 'COMPLETED', scores: scores([27, 35, 17, 8]) },
    { eventId, judgeId: 'priya', teamId: 'team-2', status: 'COMPLETED', scores: scores([24, 32, 16, 7]) },
    { eventId, judgeId: 'rahul', teamId: 'team-3', status: 'COMPLETED', scores: scores([21, 28, 14, 6]) },
    { eventId, judgeId: 'priya', teamId: 'team-4', status: 'COMPLETED', scores: scores([15, 25, 10, 5]) },
    { eventId, judgeId: 'arjun', teamId: 'team-1', status: 'COMPLETED', scores: scores([25, 3, 3.5, 2]) },
    { eventId, judgeId: 'arjun', teamId: 'team-5', status: 'COMPLETED', scores: scores([23, 34, 12, 2]) },
    { eventId: 'other-event', judgeId: 'arjun', teamId: 'team-1', status: 'COMPLETED', scores: scores([30, 40, 20, 10]) },
  ];
  const result = buildEventResults({
    eventId,
    teams,
    judges,
    evaluations,
    config: { model: 'criteria-based', criteriaBased: { criteria } },
  });
  assert.equal(result.submittedCount, 6);
  assert.deepEqual(result.teams.map((row) => row.averageWeighted), [60.25, 79, 69, 55, 71]);
  assert.deepEqual(result.teams.map((row) => row.status), ['Completed', 'Completed', 'Completed', 'Completed', 'Pending']);
  assert.equal(result.teams[0].assignedCount, 2);
  assert.equal(result.teams[0].judgeRows[0].scores.weighted, 87);
  assert.equal(result.teams[4].judgeRows.find((row) => row.judge._id === 'rahul').evaluation, undefined);
  assert.equal(result.teams[4].judgeRows.find((row) => row.judge._id === 'rahul').scores, null);
  assert.deepEqual(result.judges.map(({ assignedCount, completedCount, pendingCount }) => ({ assignedCount, completedCount, pendingCount })), [
    { assignedCount: 3, completedCount: 2, pendingCount: 1 },
    { assignedCount: 2, completedCount: 2, pendingCount: 0 },
    { assignedCount: 2, completedCount: 2, pendingCount: 0 },
  ]);
});
