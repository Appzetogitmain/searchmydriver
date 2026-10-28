/**
 * Clear FCM tokens that Firebase itself reports as dead.
 *
 * Validation uses send(..., dryRun = true), which asks FCM to check the token
 * against our project WITHOUT delivering anything — so no real device gets a
 * notification from this script.
 *
 * Only tokens FCM explicitly rejects are cleared. Anything that validates, or
 * that fails for a transient reason (network, quota, auth), is left alone.
 *
 * Pass --apply to write. Default is a dry run that changes nothing.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(BACKEND, '.env') });

const APPLY = process.argv.includes('--apply');

/** Error codes that mean "this token is permanently dead". */
const DEAD_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
  'messaging/mismatched-credential',
]);

const { initializeFirebase, getFirebaseAdmin } = await import(
  path.join(BACKEND, 'src/config/firebase.js')
);
await initializeFirebase();
const admin = getFirebaseAdmin();
if (!admin) {
  console.error('Firebase admin not initialised — aborting.');
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME });
const db = mongoose.connection.db;

const rows = [];
for (const coll of ['drivers', 'users']) {
  const docs = await db
    .collection(coll)
    .find({ fcmToken: { $exists: true, $nin: [null, ''] } })
    .project({ fcmToken: 1, name: 1 })
    .toArray();
  for (const d of docs) rows.push({ coll, id: d._id, name: d.name, token: d.fcmToken });
}

console.log(`\nMode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`);
console.log(`Validating ${rows.length} token(s) with dryRun=true — nothing is delivered.\n`);

const dead = [];
const alive = [];
const unsure = [];

for (const r of rows) {
  const label = `${r.coll.slice(0, -1)} ${String(r.name || '?').slice(0, 16).padEnd(16)} ...${r.token.slice(-8)}`;
  try {
    await admin
      .messaging()
      .send({ token: r.token, notification: { title: 'validate', body: 'validate' } }, true);
    alive.push(r);
    console.log(`  KEEP   ${label}`);
  } catch (e) {
    if (DEAD_CODES.has(e.code)) {
      dead.push({ ...r, code: e.code });
      console.log(`  DEAD   ${label}  ${e.code}`);
    } else {
      unsure.push({ ...r, code: e.code });
      console.log(`  SKIP   ${label}  ${e.code} (transient — left alone)`);
    }
  }
}

console.log(`\n  valid: ${alive.length}   dead: ${dead.length}   skipped: ${unsure.length}`);

if (!dead.length) {
  console.log('\nNothing to clear.');
} else if (!APPLY) {
  console.log('\nDry run — re-run with --apply to clear the dead tokens above.');
} else {
  // Clear by (_id, exact token) so a device that re-registered between the
  // validation above and this write keeps its fresh token.
  let cleared = 0;
  for (const d of dead) {
    const res = await db
      .collection(d.coll)
      .updateOne({ _id: d.id, fcmToken: d.token }, { $set: { fcmToken: '' } });
    cleared += res.modifiedCount;
  }
  console.log(`\nCleared ${cleared} dead token(s).`);

  const left = {};
  for (const coll of ['drivers', 'users']) {
    left[coll] = await db
      .collection(coll)
      .countDocuments({ fcmToken: { $exists: true, $nin: [null, ''] } });
  }
  console.log('Remaining tokens:', JSON.stringify(left));
}

await mongoose.disconnect();
process.exit(0);
