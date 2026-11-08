const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const dotenv = require('./server/node_modules/dotenv');
const mongoose = require('./server/node_modules/mongoose');

async function main() {
  const raw = fs.readFileSync(path.join(__dirname, 'server/.env'), 'utf8');
  const parsed = dotenv.parse(raw.replaceAll('\\r\\n', '\n').replaceAll('\\n', '\n'));
  const testDbName = `scoreflow_auth_test_${crypto.randomBytes(6).toString('hex')}`;
  const testUri = new URL(parsed.MONGODB_URI);
  testUri.pathname = `/${testDbName}`;
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    SCOREFLOW_AUTH_TEST_MONGODB_URI: testUri.toString(),
    JWT_ACCESS_SECRET: crypto.randomBytes(48).toString('base64url'),
    JWT_REFRESH_SECRET: crypto.randomBytes(48).toString('base64url'),
  };
  delete env.BREVO_API_KEY;
  delete env.BREVO_SENDER_EMAIL;
  const result = spawnSync('npm.cmd', ['test'], { cwd: path.join(__dirname, 'server'), env, shell: true, stdio: 'inherit' });
  try {
    await mongoose.connect(testUri.toString(), { serverSelectionTimeoutMS: 10000 });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  } catch {
    await mongoose.disconnect().catch(() => {});
    if (result.status === 0) process.exitCode = 1;
  }
  if (result.error) {
    console.error('Server test command failed to start.');
    process.exitCode = 1;
  } else if (result.status !== 0) process.exitCode = result.status || 1;
  console.log(`Isolated test database ${testDbName} cleanup completed.`);
}

main().catch(() => { console.error('Server authentication suite failed.'); process.exitCode = 1; });
