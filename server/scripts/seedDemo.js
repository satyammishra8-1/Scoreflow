const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data when NODE_ENV=production.');
  process.exit(1);
}

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Event = require('../models/Event');
const Team = require('../models/Team');
const Judge = require('../models/Judge');
const Evaluation = require('../models/Evaluation');
const EvaluationConfiguration = require('../models/EvaluationConfiguration');

const EVENT = {
  name: 'TechNova Hackathon 2026',
  type: 'Hackathon',
  date: new Date('2026-11-14T09:00:00.000Z'),
  venue: 'GCEM Bengaluru',
  description: 'A college hackathon where student teams build innovative technology solutions.',
};

const TEAM_DATA = [
  {
    teamNumber: '1', teamName: 'NovaTech', project: 'CampusPulse: smarter campus resource discovery',
    githubUrl: 'https://github.com/scoreflow-demo/technova-novatech', demoUrl: 'https://technova-novatech.demo.scoreflow.test',
    members: [
      ['Aarav Kumar', 'aarav.kumar'], ['Riya Sharma', 'riya.sharma'], ['Karan Verma', 'karan.verma'], ['Ananya Singh', 'ananya.singh'],
    ],
  },
  {
    teamNumber: '2', teamName: 'CodeForge', project: 'SkillBridge: peer learning and project matching',
    githubUrl: 'https://github.com/scoreflow-demo/technova-codeforge', demoUrl: 'https://technova-codeforge.demo.scoreflow.test',
    members: [
      ['Aditya Rao', 'aditya.rao'], ['Sneha Patel', 'sneha.patel'], ['Rohit Gupta', 'rohit.gupta'],
    ],
  },
  {
    teamNumber: '3', teamName: 'ByteBuilders', project: 'CivicLens: accessible neighborhood issue reporting',
    githubUrl: 'https://github.com/scoreflow-demo/technova-bytebuilders', demoUrl: 'https://technova-bytebuilders.demo.scoreflow.test',
    members: [
      ['Vivek Nair', 'vivek.nair'], ['Meera Joshi', 'meera.joshi'], ['Arjun Kapoor', 'arjun.kapoor'], ['Pooja Shah', 'pooja.shah'],
    ],
  },
  {
    teamNumber: '4', teamName: 'NeuralNest', project: 'GreenRoute: low-impact campus route planning',
    githubUrl: 'https://github.com/scoreflow-demo/technova-neuralnest', demoUrl: 'https://technova-neuralnest.demo.scoreflow.test',
    members: [
      ['Rahul Das', 'rahul.das'], ['Ishita Mehta', 'ishita.mehta'], ['Aman Jain', 'aman.jain'],
    ],
  },
  {
    teamNumber: '5', teamName: 'DevPulse', project: 'CareQueue: transparent clinic appointment coordination',
    githubUrl: 'https://github.com/scoreflow-demo/technova-devpulse', demoUrl: 'https://technova-devpulse.demo.scoreflow.test',
    members: [
      ['Nikhil Agarwal', 'nikhil.agarwal'], ['Simran Kaur', 'simran.kaur'], ['Yash Malhotra', 'yash.malhotra'], ['Neha Iyer', 'neha.iyer'],
    ],
  },
].map((team) => ({
  ...team,
  members: team.members.map(([name, emailName], index) => ({
    name,
    email: `${emailName}@technova-demo.scoreflow.test`,
    usn: `TN26${team.teamNumber.padStart(2, '0')}${String(index + 1).padStart(2, '0')}`,
    section: 'CSE',
    github: team.githubUrl,
    demo: team.demoUrl,
  })),
}));

const JUDGE_DATA = [
  { name: 'Dr. Rahul Mehta', email: 'rahul.mehta.demo@example.com', teamNumbers: ['1', '3'], initialInvitationStatus: 'pending' },
  { name: 'Priya Nair', email: 'priya.nair.demo@example.com', teamNumbers: ['2', '4'], initialInvitationStatus: 'pending' },
  { name: 'Arjun Sharma', email: 'arjun.sharma.demo@example.com', teamNumbers: ['5', '1'], initialInvitationStatus: 'accepted' },
];

const CRITERIA = [
  { name: 'Innovation', description: 'Originality and novelty of the proposed solution.', maxMarks: 30, weight: 30 },
  { name: 'Technical Implementation', description: 'Quality, functionality, and technical execution.', maxMarks: 40, weight: 40 },
  { name: 'Presentation', description: 'Clarity and effectiveness of the team presentation.', maxMarks: 20, weight: 20 },
  { name: 'Impact & Feasibility', description: 'Potential impact and practicality of implementation.', maxMarks: 10, weight: 10 },
];

function getTargetDescription() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing; refusing to seed without a known target.');
  let target;
  try {
    target = new URL(process.env.MONGODB_URI);
  } catch {
    throw new Error('MONGODB_URI could not be parsed; refusing to seed without a known target.');
  }
  const database = decodeURIComponent(target.pathname.replace(/^\//, ''))
    || target.searchParams.get('dbName')
    || 'test (Mongoose default)';
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(target.hostname);
  if (!isLocal && process.env.SCOREFLOW_DEMO_SEED_ALLOW_REMOTE !== 'true') {
    throw new Error(`Target is remote (${target.hostname}, database ${database}). Set SCOREFLOW_DEMO_SEED_ALLOW_REMOTE=true only after confirming this is a development/demo database.`);
  }
  return { host: target.hostname, database, environment: process.env.NODE_ENV || 'development (NODE_ENV unset)' };
}

async function findUniqueDemoEvent() {
  const matches = await Event.find({ name: EVENT.name });
  if (matches.length > 1) throw new Error('Multiple events use the demo event name; refusing to guess which one to update.');
  if (matches.length === 0) return Event.create(EVENT);
  const existing = matches[0];
  if (existing.type !== EVENT.type || existing.venue !== EVENT.venue || existing.description !== EVENT.description) {
    throw new Error('An event with the demo name exists but does not match the seed identity; refusing to modify it.');
  }
  existing.date = EVENT.date;
  await existing.save();
  return existing;
}

async function upsertDemoTeam(eventId, teamData) {
  const matches = await Team.find({
    eventId,
    $or: [{ teamNumber: teamData.teamNumber }, { teamName: teamData.teamName }],
  });
  if (matches.length > 1 || (matches.length === 1
    && (matches[0].teamNumber !== teamData.teamNumber || matches[0].teamName !== teamData.teamName))) {
    throw new Error(`Conflicting team number or name for demo team ${teamData.teamNumber}; refusing to overwrite it.`);
  }
  const team = matches[0] || new Team({ eventId, teamNumber: teamData.teamNumber, teamName: teamData.teamName });
  Object.assign(team, {
    eventId,
    teamNumber: teamData.teamNumber,
    teamName: teamData.teamName,
    members: teamData.members,
    project: teamData.project,
    githubUrl: teamData.githubUrl,
    demoUrl: teamData.demoUrl,
    status: 'Pending',
  });
  await team.save();
  return team;
}

async function upsertDemoJudge(eventId, judgeData, teamsByNumber) {
  const matches = await Judge.find({ eventId, email: judgeData.email });
  if (matches.length > 1) throw new Error(`Duplicate demo judge email ${judgeData.email}; refusing to guess which record to update.`);
  const assignedTeamIds = judgeData.teamNumbers.map((number) => String(teamsByNumber.get(number)._id));
  const judge = matches[0] || new Judge({
    eventId,
    email: judgeData.email,
    invitationStatus: judgeData.initialInvitationStatus,
    ...(judgeData.initialInvitationStatus === 'accepted' ? { invitationAcceptedAt: new Date() } : {}),
  });
  judge.eventId = eventId;
  judge.name = judgeData.name;
  judge.email = judgeData.email;
  judge.assignedTeamIds = assignedTeamIds;
  judge.status = 'Active';
  await judge.save();
  return judge;
}

async function verifySeed(event, teams, judges, configuration) {
  const eventId = String(event._id);
  const teamsInEvent = await Team.find({ eventId, teamNumber: { $in: TEAM_DATA.map((team) => team.teamNumber) } }).lean();
  const judgesInEvent = await Judge.find({ eventId, email: { $in: JUDGE_DATA.map((judge) => judge.email) } }).lean();
  const configurations = await EvaluationConfiguration.find({ eventId }).lean();
  const evaluationCount = await Evaluation.countDocuments({ eventId });
  const teamKeys = teamsInEvent.map((team) => `${team.teamNumber}:${team.teamName}`);
  const members = teamsInEvent.reduce((sum, team) => sum + team.members.length, 0);
  const assignments = judgesInEvent.reduce((sum, judge) => sum + judge.assignedTeamIds.length, 0);
  if (teamsInEvent.length !== 5 || new Set(teamKeys).size !== 5 || members !== 18) throw new Error('Seed verification failed for demo teams or members.');
  if (judgesInEvent.length !== 3 || new Set(judgesInEvent.map((judge) => judge.email)).size !== 3 || assignments !== 6) throw new Error('Seed verification failed for demo judges or assignments.');
  if (configurations.length !== 1 || configurations[0]._id.toString() !== configuration._id.toString()
    || configurations[0].criteriaBased.criteria.length !== 4) throw new Error('Seed verification failed for evaluation configuration.');
  if (evaluationCount !== 0) throw new Error('Seed verification found unexpected evaluations; the seed is intended to leave evaluations pending.');
  const teamIds = new Set(teams.map((team) => String(team._id)));
  const teamsByNumber = new Map(teams.map((team) => [team.teamNumber, String(team._id)]));
  const judgesByEmail = new Map(judgesInEvent.map((judge) => [judge.email, judge]));
  for (const expected of JUDGE_DATA) {
    const judge = judgesByEmail.get(expected.email);
    const actualIds = judge.assignedTeamIds.map(String);
    const expectedIds = expected.teamNumbers.map((number) => teamsByNumber.get(number));
    if (actualIds.length !== new Set(actualIds).size
      || actualIds.length !== expectedIds.length
      || expectedIds.some((id) => !actualIds.includes(id))
      || actualIds.some((id) => !teamIds.has(id))) {
      throw new Error(`Seed verification found incorrect or cross-event assignments for ${expected.name}.`);
    }
  }
  const judgesById = new Map(judgesInEvent.map((judge) => [String(judge._id), judge]));
  for (const team of teamsInEvent) {
    const expectedJudgeIds = JUDGE_DATA
      .filter((judge) => judge.teamNumbers.includes(team.teamNumber))
      .map((judge) => String(judgesByEmail.get(judge.email)._id));
    const actualJudgeIds = team.judges.map(String);
    if (actualJudgeIds.length !== expectedJudgeIds.length
      || expectedJudgeIds.some((id) => !actualJudgeIds.includes(id))
      || actualJudgeIds.some((id) => !judgesById.has(id))) {
      throw new Error(`Seed verification found incorrect or cross-event judge links for ${team.teamName}.`);
    }
  }
  const criteria = configurations[0].criteriaBased.criteria;
  if (criteria.reduce((sum, criterion) => sum + criterion.weight, 0) !== 100) throw new Error('Seed verification found criterion weights that do not total 100%.');
}

async function main() {
  const target = getTargetDescription();
  console.log(`Seed target: environment=${target.environment}, host=${target.host}, database=${target.database}`);
  await connectDB();

  const event = await findUniqueDemoEvent();
  const teams = [];
  for (const teamData of TEAM_DATA) teams.push(await upsertDemoTeam(event._id, teamData));
  const teamsByNumber = new Map(teams.map((team) => [team.teamNumber, team]));
  const judges = [];
  for (const judgeData of JUDGE_DATA) judges.push(await upsertDemoJudge(event._id, judgeData, teamsByNumber));

  for (const team of teams) {
    const assignedJudgeIds = judges
      .filter((judge) => judge.assignedTeamIds.some((id) => String(id) === String(team._id)))
      .map((judge) => String(judge._id));
    await Team.updateOne({ _id: team._id, eventId: event._id }, { $set: { judges: assignedJudgeIds } });
  }

  const configuration = await EvaluationConfiguration.findOneAndUpdate(
    { eventId: String(event._id) },
    {
      $set: {
        eventId: String(event._id),
        model: 'criteria-based',
        criteriaBased: { criteria: CRITERIA },
        updatedAt: new Date(),
      },
      $unset: { remoteAsync: 1, liveDemo: 1, custom: 1 },
    },
    { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  await verifySeed(event, teams, judges, configuration);
  console.log('Demo dataset created successfully.');
  console.log(`Event: ${EVENT.name}`);
  console.log(`Event ID: ${event._id}`);
  console.log('Teams: 5');
  console.log('Members: 18');
  console.log('Judges: 3');
  console.log('Assignments: 6');
  console.log('Evaluation Criteria: 4');
  console.log('Team IDs:');
  teams.forEach((team) => console.log(`  ${team.teamNumber} ${team.teamName}: ${team._id}`));
  console.log('Judge IDs:');
  judges.forEach((judge) => console.log(`  ${judge.name}: ${judge._id}`));
  console.log(`Evaluation Configuration ID: ${configuration._id}`);
  console.log('Evaluations: 0 (left ready for manual testing)');
  console.log('Announcements: none seeded; the seed does not deliver email.');
}

main()
  .catch((error) => {
    console.error(`Demo seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
