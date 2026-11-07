const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Event = require('../models/Event');
const OrganizerAccount = require('../models/OrganizerAccount');

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  const apply = process.argv.includes('--apply');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: node scripts/migrateEventOwners.js <organizer-email> [--apply]');
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured.');

  await mongoose.connect(process.env.MONGODB_URI);
  const organizer = await OrganizerAccount.findOne({ email, active: true }).select('_id email').lean();
  if (!organizer) throw new Error('No active organizer account exists for that email. Complete verified organizer registration first.');

  const unownedEvents = { $or: [{ ownerId: { $exists: false } }, { ownerId: null }] };
  const count = await Event.countDocuments(unownedEvents);
  if (!apply) {
    process.stdout.write(`Dry run: ${count} unowned event(s) would be assigned to ${organizer.email}. Re-run with --apply to write ownerId only.\n`);
    return;
  }
  const result = await Event.updateMany(unownedEvents, { $set: { ownerId: organizer._id } });
  process.stdout.write(`Assigned ${result.modifiedCount} event(s) to ${organizer.email}; existing event and related records were retained.\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
