const test = require('node:test');
const assert = require('node:assert/strict');
const { assertProductionConfiguration } = require('../security/configuration');

const required = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb+srv://user:pass@cluster.example/scoreflow',
  JWT_ACCESS_SECRET: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6',
  JWT_REFRESH_SECRET: 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4',
  CLIENT_ORIGINS: 'https://scoreflow.example.com',
  CLIENT_URL: 'https://scoreflow.example.com',
  AI_SERVICE_URL: 'https://ai.internal.example.com',
  AI_SERVICE_SHARED_SECRET: 'D1e2F3g4H5i6J7k8L9m0N1o2P3q4R5s6',
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

test('production config accepts independent secrets and TLS MongoDB without organizer allowlisting', () => {
  withEnvironment(required, () => assert.doesNotThrow(assertProductionConfiguration));
});

test('production config rejects MongoDB connections without TLS', () => {
  withEnvironment({ ...required, MONGODB_URI: 'mongodb://db.example/scoreflow' }, () => {
    assert.throws(assertProductionConfiguration, /MONGODB_URI \(TLS required in production\)/);
  });
});

test('production config requires public frontend URLs to use exact HTTPS origins', () => {
  withEnvironment({ ...required, CLIENT_URL: 'http://scoreflow.example.com' }, () => {
    assert.throws(assertProductionConfiguration, /CLIENT_URL \(canonical HTTPS URL required\)/);
  });
  withEnvironment({ ...required, CLIENT_ORIGINS: 'https://scoreflow.example.com/path' }, () => {
    assert.throws(assertProductionConfiguration, /CLIENT_ORIGINS \(exact HTTPS origins required\)/);
  });
});

test('production config rejects missing settings, weak or reused secrets, and malformed service configuration', () => {
  withEnvironment({ ...required, AI_SERVICE_URL: 'not-a-url' }, () => {
    assert.throws(assertProductionConfiguration, /AI_SERVICE_URL \(valid service URL required\)/);
  });
  withEnvironment({ ...required, BREVO_SENDER_EMAIL: 'invalid-sender' }, () => {
    assert.throws(assertProductionConfiguration, /BREVO_SENDER_EMAIL \(valid email address required\)/);
  });
  withEnvironment({ ...required, CLIENT_URL: 'https://scoreflow.example.com/path' }, () => {
    assert.throws(assertProductionConfiguration, /CLIENT_URL \(canonical HTTPS URL required\)/);
  });
  withEnvironment({ ...required, JWT_ACCESS_SECRET: 'short' }, () => {
    assert.throws(assertProductionConfiguration, /JWT_ACCESS_SECRET \(use a strong secret of at least 32 bytes\)/);
  });
  withEnvironment({ ...required, JWT_REFRESH_SECRET: required.JWT_ACCESS_SECRET }, () => {
    assert.throws(assertProductionConfiguration, /JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different/);
  });
  withEnvironment({ ...required, JWT_ACCESS_SECRET: 'a'.repeat(48) }, () => {
    assert.throws(assertProductionConfiguration, /JWT_ACCESS_SECRET \(use a strong secret of at least 32 bytes\)/);
  });
  withEnvironment({ ...required, CLIENT_ORIGINS: 'https://scoreflow.example.com,' }, () => {
    assert.throws(assertProductionConfiguration, /CLIENT_ORIGINS \(exact HTTPS origins required\)/);
  });
  const incomplete = { ...required, MONGODB_URI: '' };
  withEnvironment(incomplete, () => assert.throws(assertProductionConfiguration, /MONGODB_URI/));
});
