import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildOrganizerSignupPayload } from '../src/auth/organizerSignup.js';

test('signup request normalizes email and never includes Confirm Password', () => {
  const payload = buildOrganizerSignupPayload({
    name: '  Organizer  ',
    email: '  Owner@Example.Test  ',
    password: 'password-eight',
    confirmPassword: 'frontend-only-value',
  });
  assert.deepEqual(payload, { name: 'Organizer', email: 'owner@example.test', password: 'password-eight' });
  assert.equal(Object.hasOwn(payload, 'confirmPassword'), false);
});

test('signup submits through the session flow and disables the button only while busy', async () => {
  const source = await readFile(new URL('../src/pages/Login.jsx', import.meta.url), 'utf8');
  assert.match(source, /signIn\('\/auth\/organizer\/register'/);
  assert.match(source, /navigate\('\/organizer\/dashboard'/);
  assert.match(source, /onSubmit=\{submit\}/);
  assert.match(source, /disabled=\{busy\}/);
  assert.doesNotMatch(source, /verificationSent/);
});
