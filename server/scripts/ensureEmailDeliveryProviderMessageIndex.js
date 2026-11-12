const mongoose = require('mongoose');
const { assertMongoConfiguration } = require('../security/mongoConfiguration');

const INDEX_KEY = { providerMessageId: 1 };
const INDEX_OPTIONS = {
  unique: true,
  partialFilterExpression: { providerMessageId: { $type: 'string', $gt: '' } },
};

async function ensureProviderMessageIdIndex(collection) {
  const indexes = await collection.listIndexes().toArray();
  const sameKey = indexes.filter((index) => JSON.stringify(index.key) === JSON.stringify(INDEX_KEY));
  const correct = sameKey.find((index) => index.unique === true
    && index.partialFilterExpression?.providerMessageId?.$type === 'string'
    && index.partialFilterExpression?.providerMessageId?.$gt === '');
  if (correct) return { changed: false, indexName: correct.name };

  const conflictingUnique = sameKey.find((index) => index.unique === true);
  if (conflictingUnique) throw new Error('A differently configured unique providerMessageId index exists; inspect it before changing indexes.');

  const duplicate = await collection.aggregate([
    { $match: { providerMessageId: { $type: 'string', $gt: '' } } },
    { $group: { _id: '$providerMessageId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]).next();
  if (duplicate) throw new Error('Duplicate nonempty provider message IDs exist; no index was changed. Resolve them before migration.');

  for (const index of sameKey) {
    if (index.name !== '_id_' && index.unique !== true) await collection.dropIndex(index.name);
  }
  const indexName = await collection.createIndex(INDEX_KEY, INDEX_OPTIONS);
  return { changed: true, indexName };
}

async function main() {
  assertMongoConfiguration(process.env.MONGODB_URI);
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const result = await ensureProviderMessageIdIndex(mongoose.connection.collection('emaildeliveries'));
    console.log(`${result.changed ? 'Created' : 'Verified'} providerMessageId index: ${result.indexName}`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) main().catch((error) => {
  console.error(`Email delivery index check failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { ensureProviderMessageIdIndex, INDEX_KEY, INDEX_OPTIONS };
