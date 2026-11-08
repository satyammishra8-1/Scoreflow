export function buildOrganizerSignupPayload({ name, email, password }) {
  return { name: name.trim(), email: email.trim().toLowerCase(), password };
}
