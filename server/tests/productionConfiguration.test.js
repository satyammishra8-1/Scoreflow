const test = require('node:test');
const assert = require('node:assert/strict');
const { assertProductionConfiguration } = require('../security/configuration');

const required = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb+srv://user:pass@cluster.example/scoreflow',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  ORGANIZER_SETUP_TOKEN: 'c'.repeat(48),
  ORGANIZER_EMAIL_ALLOWLIST: 'owner@example.com,leader@example.com',
  CLIENT_ORIGINS: 'https://scoreflow.example.com',
  CLIENT_URL: 'https://scoreflow.example.com',
  AI_SERVICE_URL: 'https://ai.internal.example.com',
  AI_SERVICE_SHARED_SECRET: 'd'.repeat(48),
  BREVO_API_KEY: 'provider-key',
  BREVO_SENDER_EMAIL: 'noreply@example.com',
  LLM_PROVIDER: 'openai',
  OPENAI_API_KEY: 'provider-key',
};

function withEnvironment(values, callback) {
  const previous = new Map(Object.keys(values).map((name) => [name, process.env[name]]));
  Object.assign(process.env, values);
  try { callback(); } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('production config accepts independent secrets, allowlisted organizers and TLS MongoDB', () => {
  withEnvironment(required, () => assert.doesNotThrow(assertProductionConfiguration));
});

test('production config rejects MongoDB connections without TLS', () => {
  withEnvironment({ ...required, MONGODB_URI: 'mongodb://db.example/scoreflow' }, () => {
    assert.throws(assertProductionConfiguration, /MONGODB_URI \(TLS required in production\)/);
  });
});
