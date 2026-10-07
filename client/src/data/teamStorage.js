export const initialTeams = [
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

export function readSavedTeams(storageKey) {
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
