const assert = require('node:assert/strict');

const recipient = 'organizer@scoreflow-test.invalid';
const password = 'Local-Auth-Test-Only-2026!';
const frontend = 'http://localhost:5174';
const events = [];
let consoleErrorCount = 0;
let requestId = 0;
const pending = new Map();
let socket;

async function sleep(ms) { await new Promise((resolve) => setTimeout(resolve, ms)); }

async function jsonFetch(url) {
  const response = await fetch(url);
  const body = await response.json();
  return { status: response.status, body };
}

async function connectChrome() {
  let targets = [];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:9223/json');
      targets = await response.json();
      if (targets.length) break;
    } catch {}
    await sleep(250);
  }
  const target = targets.find((item) => item.type === 'page');
  assert.ok(target, 'Chrome remote debugging endpoint is unavailable');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrorCount += 1;
    if (message.method === 'Runtime.exceptionThrown') consoleErrorCount += 1;
    if (message.method === 'Network.requestWillBeSent') {
      const req = message.params.request;
      let path = '';
      try { path = new URL(req.url).pathname; } catch {}
      if (path.startsWith('/api/')) {
        const entry = { type: 'request', method: req.method, path, status: null };
        if (req.postData) {
          try {
            const body = JSON.parse(req.postData);
            entry.bodyKeys = Object.keys(body).sort();
            entry.emailMatchesRecipient = body.email === recipient;
            entry.passwordPresent = typeof body.password === 'string' && body.password.length > 0;
            entry.confirmPasswordSent = Object.hasOwn(body, 'confirmPassword');
          } catch { entry.bodyParsed = false; }
        }
        events.push(entry);
        pending.set(message.params.requestId, entry);
      }
    }
    if (message.method === 'Network.responseReceived') {
      const entry = pending.get(message.params.requestId);
      if (entry) entry.status = message.params.response.status;
    }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
}

function cdp(method, params = {}) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`Browser script failed: ${result.exceptionDetails.exception?.className || 'exception'}`);
  return result.result?.value;
}

async function waitFor(predicate, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await evaluate(`(${predicate})()`);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function navigate(url) {
  await cdp('Page.navigate', { url });
  await waitFor(() => document.readyState === 'complete', 'page load');
  await sleep(300);
}

async function state() {
  return evaluate(`(() => ({
    pathname: location.pathname,
    heading: document.querySelector('h1')?.innerText || '',
    alert: document.querySelector('[role="alert"]')?.innerText || '',
    status: document.querySelector('[role="status"]')?.innerText || '',
    fields: [...document.querySelectorAll('form input')].map((input) => ({ name: input.name, type: input.type, required: input.required, label: input.closest('label')?.innerText?.split('\\n')[0] || '' })),
    submitDisabled: document.querySelector('.auth-submit')?.disabled ?? null,
    submitText: document.querySelector('.auth-submit')?.innerText || ''
  }))()`);
}

async function fill(name, value) {
  const expression = `(() => { const input = document.querySelector('input[name=${JSON.stringify(name)}]'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`;
  assert.equal(await evaluate(expression), true, `input ${name} exists`);
}

async function submit() {
  assert.equal(await evaluate(`(() => { const form = document.querySelector('.auth-form'); if (!form) return false; form.requestSubmit(); return true; })()`), true);
}

async function fillSignup(email, fullName = 'Local Browser Organizer', pass = password, confirm = pass) {
  await fill('name', fullName);
  await fill('email', email);
  await fill('password', pass);
  await fill('confirmPassword', confirm);
}

function latestStatus(path, method = 'POST') {
  const entry = [...events].reverse().find((item) => item.path === path && item.method === method);
  return entry?.status ?? null;
}

async function main() {
  await connectChrome();
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');

  await navigate(`${frontend}/signup`);
  await waitFor(() => document.querySelector('.auth-form input[name="confirmPassword"]'), 'signup form');
  const initial = await state();
  const expectedFields = ['name', 'email', 'password', 'confirmPassword'];
  assert.deepEqual(initial.fields.map((field) => field.name), expectedFields);
  assert.ok(initial.fields.every((field) => field.required));
  assert.equal(await evaluate(`!document.querySelector('input[name*="token" i]')`), true);

  await evaluate(`document.querySelector('button[aria-label="Show password"]').click()`);
  const passwordShown = await evaluate(`document.querySelector('input[name="password"]').type === 'text'`);
  await evaluate(`document.querySelector('button[aria-label="Hide password"]').click()`);
  await evaluate(`document.querySelector('button[aria-label="Show confirm password"]').click()`);
  const confirmShown = await evaluate(`document.querySelector('input[name="confirmPassword"]').type === 'text'`);
  await evaluate(`document.querySelector('button[aria-label="Hide confirm password"]').click()`);
  assert.ok(passwordShown && confirmShown, 'both password visibility toggles work');

  await submit();
  const requiredError = await waitFor(() => document.querySelector('[role="alert"]')?.innerText, 'required-field error');
  assert.match(requiredError, /full name/i);

  await fillSignup(recipient, 'Local Browser Organizer', password, 'Different-Password-123!');
  await submit();
  const mismatchError = await waitFor(() => document.querySelector('[role="alert"]')?.innerText, 'password mismatch error');
  assert.match(mismatchError, /do not match/i);
  assert.equal(events.filter((item) => item.path === '/api/auth/organizer/register').length, 0, 'invalid form never sends signup request');

  await fillSignup('unauthorized@scoreflow-test.invalid');
  await submit();
  await waitFor(() => document.querySelector('[role="status"]')?.innerText?.includes('verification link'), 'generic unauthorized response');
  assert.equal(latestStatus('/api/auth/organizer/register'), 202);
  const noMailAfterUnauthorized = (await jsonFetch('http://127.0.0.1:5001/status')).body.sendCount === 0;
  assert.ok(noMailAfterUnauthorized, 'unauthorized address triggered no email');

  await navigate(`${frontend}/signup`);
  await waitFor(() => document.querySelector('input[name="confirmPassword"]'), 'fresh signup form');
  await fillSignup(recipient);
  await submit();
  await sleep(100);
  const busyDuringSignup = await evaluate(`document.querySelector('.auth-submit')?.disabled === true && document.querySelector('.auth-submit')?.innerText?.includes('wait')`);
  await waitFor(() => document.querySelector('[role="status"]')?.innerText?.includes('After verifying'), 'signup success message');
  assert.equal(latestStatus('/api/auth/organizer/register'), 202);
  const registrationRequest = [...events].reverse().find((item) => item.path === '/api/auth/organizer/register' && item.emailMatchesRecipient);
  assert.ok(registrationRequest);
  assert.deepEqual(registrationRequest.bodyKeys, ['email', 'name', 'password']);
  assert.equal(registrationRequest.confirmPasswordSent, false);
  const pendingDb = (await jsonFetch('http://127.0.0.1:5001/database')).body;
  assert.ok(pendingDb.ready && pendingDb.pending && pendingDb.pendingHasBcryptHash && !pendingDb.active);

  await navigate(`${frontend}/login`);
  await fill('email', recipient);
  await fill('password', password);
  await submit();
  const unverifiedError = await waitFor(() => document.querySelector('[role="alert"]')?.innerText, 'unverified login rejection');
  assert.match(unverifiedError, /incorrect/i);
  assert.equal(latestStatus('/api/auth/organizer/login'), 401);

  const linkResult = await jsonFetch('http://127.0.0.1:5001/link');
  assert.equal(linkResult.status, 200);
  const localLink = new URL(linkResult.body.link);
  assert.equal(localLink.origin, frontend);
  assert.match(localLink.pathname, /^\/organizer\/verify\/[A-Za-z0-9_-]+$/);
  await navigate(linkResult.body.link);
  await waitFor(() => location.pathname === '/login' && document.querySelector('[role="status"]')?.innerText?.includes('Email verified'), 'verification success redirect');
  assert.equal(latestStatus('/api/auth/organizer/verify'), 200);
  const activeDb = (await jsonFetch('http://127.0.0.1:5001/database')).body;
  assert.ok(activeDb.ready && !activeDb.pending && activeDb.active && activeDb.activeHasBcryptHash);

  await navigate(`${frontend}/signup`);
  await fillSignup(recipient);
  await submit();
  const duplicateError = await waitFor(() => document.querySelector('[role="alert"]')?.innerText, 'duplicate email rejection');
  assert.match(duplicateError, /already exists/i);
  assert.equal(latestStatus('/api/auth/organizer/register'), 409);
  assert.equal((await jsonFetch('http://127.0.0.1:5001/status')).body.sendCount, 1, 'duplicate signup did not send another email');

  await navigate(`${frontend}/login`);
  await fill('email', recipient);
  await fill('password', 'Wrong-Password-Only-123!');
  await submit();
  const invalidLoginError = await waitFor(() => document.querySelector('[role="alert"]')?.innerText, 'invalid-password error');
  assert.match(invalidLoginError, /incorrect/i);
  assert.equal(latestStatus('/api/auth/organizer/login'), 401);

  await navigate(`${frontend}/login`);
  await fill('email', recipient);
  await fill('password', password);
  await submit();
  await waitFor(() => location.pathname === '/organizer/dashboard' && document.querySelector('h1')?.innerText?.includes('Organizer'), 'dashboard after login');
  assert.equal(latestStatus('/api/auth/organizer/login'), 200);
  const firstDashboardHeading = (await state()).heading;

  const refreshBefore = events.filter((item) => item.path === '/api/auth/refresh').length;
  await cdp('Page.reload', { ignoreCache: true });
  await waitFor(() => location.pathname === '/organizer/dashboard' && document.querySelector('h1')?.innerText?.includes('Organizer'), 'dashboard after browser refresh');
  await waitFor(() => events.filter((item) => item.path === '/api/auth/refresh').length > refreshBefore, 'refresh-cookie request');
  const refreshStatuses = events.filter((item) => item.path === '/api/auth/refresh').map((item) => item.status);
  assert.ok(refreshStatuses.includes(200));

  await evaluate(`document.querySelector('button.topbar-logout')?.click()`);
  await waitFor(() => location.pathname === '/login', 'logout navigation');
  assert.equal(latestStatus('/api/auth/logout'), 200);

  await fill('email', recipient);
  await fill('password', password);
  await submit();
  await waitFor(() => location.pathname === '/organizer/dashboard' && document.querySelector('h1')?.innerText?.includes('Organizer'), 'dashboard after login again');
  assert.equal(latestStatus('/api/auth/organizer/login'), 200);

  const cleanup = await jsonFetch('http://127.0.0.1:5001/cleanup');
  assert.ok(cleanup.body.dropped, 'test database was dropped');
  const apiEvents = events.filter((item) => item.path.startsWith('/api/auth/') || item.path === '/api/events').map((item) => ({ method: item.method, path: item.path, status: item.status }));
  const report = {
    formFields: initial.fields.map((field) => ({ name: field.name, required: field.required })),
    passwordVisibilityToggles: { passwordShown, confirmPasswordShown: confirmShown },
    requiredFieldError: Boolean(requiredError),
    mismatchError: Boolean(mismatchError),
    invalidFormDidNotSubmit: true,
    unauthorizedEmail: { status: 202, noEmailSent: noMailAfterUnauthorized },
    signup: { status: 202, busyStateObserved: busyDuringSignup, successMessageVisible: true, confirmPasswordSent: false, pendingBcryptHash: pendingDb.pendingHasBcryptHash },
    unverifiedLoginStatus: 401,
    verification: { status: 200, localLinkOpened: true, activatedAccountBcryptHash: activeDb.activeHasBcryptHash, redirectedToLogin: true },
    duplicateEmail: { status: 409, noSecondEmail: true },
    invalidPassword: { status: 401, errorVisible: true },
    login: { status: 200, originalSignupPassword: true },
    dashboard: { firstHeading: firstDashboardHeading, refreshPreservedSession: true, refreshStatuses, logoutStatus: 200, loginAfterLogout: true },
    mockEmail: (await jsonFetch('http://127.0.0.1:5001/status')).body,
    apiEvents,
    browserConsoleErrors: consoleErrorCount,
    testDatabase: { dropped: true, dbName: cleanup.body.dbName },
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch(async (error) => {
  console.error(`Browser acceptance failed: ${error.message}`);
  try {
    const cleanup = await fetch('http://127.0.0.1:5001/cleanup', { method: 'POST' });
    if (cleanup.ok) console.error('Isolated test database cleanup completed.');
  } catch {}
  process.exitCode = 1;
}).finally(() => { try { socket?.close(); } catch {} });
