function getMongoDatabaseName(uri = process.env.MONGODB_URI) {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new Error('MONGODB_URI must be configured with an explicit database name.');
  }

  let parsed;
  try {
    parsed = new URL(uri.trim());
  } catch {
    throw new Error('MONGODB_URI must be a valid MongoDB connection URI with an explicit database name.');
  }

  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('MONGODB_URI must use mongodb:// or mongodb+srv:// and include an explicit database name.');
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new Error('MONGODB_URI must include a valid explicit database name.');
  }
  if (!databaseName || databaseName.includes('/') || databaseName.includes('\\')) {
    throw new Error('MONGODB_URI must include an explicit database name.');
  }
  return databaseName;
}

function assertMongoConfiguration(uri = process.env.MONGODB_URI) {
  getMongoDatabaseName(uri);
}

module.exports = { getMongoDatabaseName, assertMongoConfiguration };
