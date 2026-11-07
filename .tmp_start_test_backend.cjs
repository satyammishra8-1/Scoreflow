const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const dotenv = require('./server/node_modules/dotenv');

const raw = fs.readFileSync(path.join(__dirname, 'server/.env'), 'utf8');
const config = dotenv.parse(raw.replaceAll('\\r\\n', '\n').replaceAll('\\n', '\n'));
const databaseName = `scoreflow_auth_test_${crypto.randomBytes(6).toString('hex')}`;
const mongoUri = new URL(config.MONGODB_URI);
mongoUri.pathname = `/${databaseName}`;
const preload = path.join(__dirname, '.tmp_email_mock_preload.cjs').replaceAll('\\', '/');
const env = {
  ...process.env,
  MONGODB_URI: mongoUri.toString(),
  JWT_ACCESS_SECRET: crypto.randomBytes(48).toString('base64url'),
  JWT_REFRESH_SECRET: crypto.randomBytes(48).toString('base64url'),
  ORGANIZER_EMAIL_ALLOWLIST: 'organizer@scoreflow-test.invalid',
  BREVO_API_KEY: 'xkeysib-test-only',
  BREVO_SENDER_EMAIL: config.BREVO_SENDER_EMAIL,
  BREVO_SENDER_NAME: 'ScoreFlow test',
  CLIENT_URL: 'http://localhost:5174',
  CLIENT_ORIGINS: 'http://localhost:5173,http://localhost:5174',
  NODE_ENV: 'development',
  PORT: '5002',
  SCOREFLOW_EMAIL_EXPECTED_RECIPIENT: 'organizer@scoreflow-test.invalid',
  NODE_OPTIONS: `--require "${preload}"`,
};
console.log(`Starting ScoreFlow backend in isolated database ${databaseName}.`);
const child = spawn('npm.cmd', ['run', 'start'], { cwd: path.join(__dirname, 'server'), env, shell: true, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Could not start the ScoreFlow backend.'); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code || 0; });
