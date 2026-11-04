// FCM device-token ownership tests.   Run: npm run test:fcm
//
// The invariant under test is "one token, one account". An FCM registration
// token identifies a device, not a person, so without this a shared phone ends
// up stored on several accounts and `emitNotification` pushes all of their
// notifications — pickup address, OTP, fare — to that one device.
//
// Runs entirely against a throwaway in-memory MongoDB. Nothing outside this
// process is touched and no real FCM call is made.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(BACKEND, '.env') });
for (const k of Object.keys(process.env)) {
  if (/^(REDIS|FIREBASE|SMS_|RAZORPAY|CLOUDINARY|MONGO_URI)/.test(k)) delete process.env[k];
}
const mongoose = (await import('mongoose')).default;
const imp = (p) => import(path.join(BACKEND, 'src', p));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

const mem = await MongoMemoryServer.create();
await mongoose.connect(mem.getUri(), { dbName: 'fcmtest' });

const User = (await imp('models/user.model.js')).default;
const { Driver } = await imp('models/driverModels/driver.model.js');
const { claimFcmTokenExclusively, releaseFcmToken } = await imp('utils/fcmToken.util.js');

let seq = 0;
const mkUser = (over = {}) =>
  User.create({ name: `U${seq}`, email: `u${seq++}@t.local`, role: 'user', ...over });
const mkDriver = (over = {}) =>
  Driver.create({
    name: `D${seq}`,
    phone: String(9000020000 + seq++),
    email: `d${seq}@t.local`,
    approvalStatus: 'approved',
    city: 'Indore',
    ...over,
  });

const SHARED = 'tok_shared_device_ABCDEF12';
const OTHER = 'tok_other_device_99999999';

/* ------------------------------------------------------------------ */
console.log('\n[A] The real bug: one device token on four accounts');
/* ------------------------------------------------------------------ */
// Exactly the state found in production: driver:admin, driver:Prathmesh,
// user:vikas and user:Prathmesh all holding the same token.
const dAdmin = await mkDriver({ fcmToken: SHARED });
const dPrath = await mkDriver({ fcmToken: SHARED });
const uVikas = await mkUser({ fcmToken: SHARED });
const uPrath = await mkUser({ fcmToken: SHARED });

const before =
  (await Driver.countDocuments({ fcmToken: SHARED })) +
  (await User.countDocuments({ fcmToken: SHARED }));
check('setup: 4 accounts share one token', before === 4, `(${before})`);

// uVikas opens the app and registers the device.
const stolen = await claimFcmTokenExclusively(SHARED, { ownerId: uVikas._id, ownerModel: 'User' });
check('claim reports it took the token from 3 others', stolen === 3, `(${stolen})`);

const after =
  (await Driver.countDocuments({ fcmToken: SHARED })) +
  (await User.countDocuments({ fcmToken: SHARED }));
check('exactly one account holds the token afterwards', after === 1, `(${after})`);
check('the claiming account keeps it',
  (await User.findById(uVikas._id).lean()).fcmToken === SHARED);
check('other user in same collection cleared',
  (await User.findById(uPrath._id).lean()).fcmToken === '');
check('driver in the OTHER collection cleared (1/2)',
  (await Driver.findById(dAdmin._id).lean()).fcmToken === '');
check('driver in the OTHER collection cleared (2/2)',
  (await Driver.findById(dPrath._id).lean()).fcmToken === '');

/* ------------------------------------------------------------------ */
console.log('\n[B] Unrelated devices are never touched');
/* ------------------------------------------------------------------ */
const uUntouched = await mkUser({ fcmToken: OTHER });
await claimFcmTokenExclusively(SHARED, { ownerId: uVikas._id, ownerModel: 'User' });
check('a different token on another account survives',
  (await User.findById(uUntouched._id).lean()).fcmToken === OTHER);

/* ------------------------------------------------------------------ */
console.log('\n[C] Claiming is idempotent');
/* ------------------------------------------------------------------ */
const again = await claimFcmTokenExclusively(SHARED, { ownerId: uVikas._id, ownerModel: 'User' });
check('re-claiming by the same owner takes it from nobody', again === 0, `(${again})`);
check('owner still holds it',
  (await User.findById(uVikas._id).lean()).fcmToken === SHARED);

/* ------------------------------------------------------------------ */
console.log('\n[D] Hand-off between a driver and a customer on one phone');
/* ------------------------------------------------------------------ */
// A driver signs in on the same device the customer app used.
const handoff = await claimFcmTokenExclusively(SHARED, { ownerId: dAdmin._id, ownerModel: 'Driver' });
check('claim moves the token across collections', handoff === 1, `(${handoff})`);
check('driver now holds it',
  (await Driver.findById(dAdmin._id).lean()).fcmToken === SHARED);
check('previous customer owner lost it',
  (await User.findById(uVikas._id).lean()).fcmToken === '');

/* ------------------------------------------------------------------ */
console.log('\n[E] Empty / missing token must NOT match every account');
/* ------------------------------------------------------------------ */
// The dangerous edge case. Most accounts have fcmToken '' or unset, so an
// unguarded updateMany({ fcmToken: '' }) would clear the token from every
// account in the database. Logging out without a cached token, or posting
// { token: '' }, hits this path.
const keeper = await mkUser({ fcmToken: 'tok_must_survive_12345678' });
const keeperDriver = await mkDriver({ fcmToken: 'tok_driver_survives_8888' });

const noopClaim = await claimFcmTokenExclusively('', { ownerId: keeper._id, ownerModel: 'User' });
check('claim with empty token is a no-op', noopClaim === 0, `(${noopClaim})`);
const noopClaim2 = await claimFcmTokenExclusively(undefined, { ownerId: keeper._id, ownerModel: 'User' });
check('claim with undefined token is a no-op', noopClaim2 === 0, `(${noopClaim2})`);
const noopRelease = await releaseFcmToken('');
check('release with empty token is a no-op', noopRelease === 0, `(${noopRelease})`);

check('bystander user token survived the empty-token calls',
  (await User.findById(keeper._id).lean()).fcmToken === 'tok_must_survive_12345678');
check('bystander driver token survived the empty-token calls',
  (await Driver.findById(keeperDriver._id).lean()).fcmToken === 'tok_driver_survives_8888');
check('the shared token is still exactly where we left it',
  (await Driver.findById(dAdmin._id).lean()).fcmToken === SHARED);

/* ------------------------------------------------------------------ */
console.log('\n[F] Logout releases the device from every account');
/* ------------------------------------------------------------------ */
// Put the token back on two accounts to prove release sweeps both collections.
await User.updateOne({ _id: uPrath._id }, { $set: { fcmToken: SHARED } });
const released = await releaseFcmToken(SHARED);
check('release clears it from all holders', released === 2, `(${released})`);
const remaining =
  (await Driver.countDocuments({ fcmToken: SHARED })) +
  (await User.countDocuments({ fcmToken: SHARED }));
check('no account holds the released token', remaining === 0, `(${remaining})`);
check('unrelated tokens untouched by release',
  (await User.findById(keeper._id).lean()).fcmToken === 'tok_must_survive_12345678');

/* ------------------------------------------------------------------ */
console.log('\n[G] platform: web and app tokens are stored side by side');
/* ------------------------------------------------------------------ */
const { normalizeFcmPlatform } = await imp('utils/fcmToken.util.js');
check('platform defaults to web', normalizeFcmPlatform(undefined) === 'web');
check('platform "app" accepted (case/space-insensitive)', normalizeFcmPlatform(' App ') === 'app');
check('unknown platform rejected', normalizeFcmPlatform('ios') === null);

const WEB = 'tok_desktop_browser_WEB1';
const APP = 'tok_flutter_phone_APP001';
const dBoth = await mkDriver();
await claimFcmTokenExclusively(WEB, { ownerId: dBoth._id, ownerModel: 'Driver', platform: 'web' });
await claimFcmTokenExclusively(APP, { ownerId: dBoth._id, ownerModel: 'Driver', platform: 'app' });
let both = await Driver.findById(dBoth._id).lean();
check('web token stored in fcmToken', both.fcmToken === WEB);
check('app token stored in fcmTokenApp without evicting web', both.fcmTokenApp === APP);

// The phone app logs in to a different driver: the token moves with it.
const dPhone2 = await mkDriver();
await claimFcmTokenExclusively(APP, { ownerId: dPhone2._id, ownerModel: 'Driver', platform: 'app' });
both = await Driver.findById(dBoth._id).lean();
check('app token taken from the previous account', both.fcmTokenApp === '');
check('previous account keeps its web token', both.fcmToken === WEB);
check('new account holds the app token', (await Driver.findById(dPhone2._id).lean()).fcmTokenApp === APP);

// A user account claiming the same phone token takes it across collections.
const uPhone = await mkUser();
await claimFcmTokenExclusively(APP, { ownerId: uPhone._id, ownerModel: 'User', platform: 'app' });
check('app token moved from driver to user', (await Driver.findById(dPhone2._id).lean()).fcmTokenApp === '');
check('user now holds the app token', (await User.findById(uPhone._id).lean()).fcmTokenApp === APP);

// Same token re-registered under the other platform never sits in both fields.
await claimFcmTokenExclusively(APP, { ownerId: uPhone._id, ownerModel: 'User', platform: 'web' });
const uP = await User.findById(uPhone._id).lean();
check('one token never sits in both fields', uP.fcmToken === APP && uP.fcmTokenApp === '');

// Logout releases the token from either field.
await User.updateOne({ _id: uPhone._id }, { $set: { fcmToken: '', fcmTokenApp: APP } });
check('release clears an app token', (await releaseFcmToken(APP)) === 1);
check('no account holds the released app token',
  (await User.countDocuments({ fcmTokenApp: APP })) + (await Driver.countDocuments({ fcmTokenApp: APP })) === 0);

console.log(`\n${pass} passed, ${fail} failed`);
await mongoose.disconnect();
await mem.stop();
process.exit(fail ? 1 : 0);
