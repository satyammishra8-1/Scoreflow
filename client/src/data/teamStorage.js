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

function withEventContext(teams, eventId) {
  return teams.map((team) => ({
    ...team,
    eventId: team.eventId || eventId,
    createdAt: team.createdAt || '',
    members: team.members.map((member, index) => ({
      ...member,
      id: member.id || `${team.id || team.number}-member-${index + 1}`,
      name: member.name,
      email: member.email,
      usn: typeof member.usn === 'string' ? member.usn : '',
      section: typeof member.section === 'string' ? member.section : '',
      github: typeof member.github === 'string' ? member.github : '',
      demo: typeof member.demo === 'string' ? member.demo : '',
    })),
  }));
}

export function readSavedTeams(storageKey, eventId = 'default') {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) {
      return {
        teams: eventId === 'default' ? withEventContext(initialTeams, eventId) : [],
        error: '',
      };
    }
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
    const eventTeams = parsed.filter((team) => !team.eventId || team.eventId === eventId);
    return { teams: withEventContext(eventTeams, eventId), error: '' };
  } catch {
    return {
      teams: eventId === 'default' ? withEventContext(initialTeams, eventId) : [],
      error: 'Unable to load saved teams from this browser.',
    };
  }
}
