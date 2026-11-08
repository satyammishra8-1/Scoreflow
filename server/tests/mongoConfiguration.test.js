const test = require('node:test');
const assert = require('node:assert/strict');
const { getMongoDatabaseName, assertMongoConfiguration } = require('../security/mongoConfiguration');

test('development MongoDB configuration requires and identifies an explicit database', () => {
  assert.equal(getMongoDatabaseName('mongodb://localhost:27017/scoreflow'), 'scoreflow');
  assert.doesNotThrow(() => assertMongoConfiguration('mongodb+srv://user:pass@cluster.example/scoreflow?retryWrites=true'));
});

test('MongoDB configuration rejects missing, malformed, and implicit default database URIs', () => {
  for (const uri of ['', undefined, 'mongodb://localhost:27017', 'mongodb+srv://user:pass@cluster.example/?retryWrites=true', 'https://db.example/scoreflow']) {
    assert.throws(() => assertMongoConfiguration(uri), /MONGODB_URI/);
  }
});

test('MongoDB URI validation applies in development and production', () => {
  const previous = process.env.NODE_ENV;
  try {
    for (const environment of ['development', 'production']) {
      process.env.NODE_ENV = environment;
      assert.throws(() => assertMongoConfiguration('mongodb://localhost:27017'), /explicit database name/);
      assert.doesNotThrow(() => assertMongoConfiguration('mongodb://localhost:27017/scoreflow'));
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
