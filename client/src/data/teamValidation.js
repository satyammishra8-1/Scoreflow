export function normalizeExternalUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function normalizeMemberIdentifier(value) {
  return String(value || '').trim().normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
}

export function findDuplicateMemberIndexes(members) {
  const seen = new Set();
  const duplicates = [];

  members.forEach((member, index) => {
    const usn = normalizeMemberIdentifier(member.usn);
    const email = normalizeMemberIdentifier(member.email);
    const name = normalizeMemberIdentifier(member.name);
    const identifier = usn ? `usn:${usn}` : email ? `email:${email}` : `name:${name}`;
    if (seen.has(identifier)) duplicates.push(index);
    else seen.add(identifier);
  });

  return duplicates;
}

export function createLocalId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`}`;
}
