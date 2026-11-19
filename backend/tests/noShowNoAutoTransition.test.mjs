// No-show reminders must never move a booking out of ARRIVED.
// Run: npm run test:noshow
//
// Rule under test: once the driver has arrived, only the ride-start OTP
// starts the trip. Reminders, a missed final reminder, a "not coming"
// answer, a server restart (sweep resume) — none of them may start,
// complete or cancel the booking. Runs against an in-memory Mongo only.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const k of Object.keys(process.env)) {
  if (/^(REDIS|FIREBASE|SMS_|RAZORPAY|CLOUDINARY|MONGO)/.test(k)) delete process.env[k];
}
const mongoose = (await import('mongoose')).default;
const imp = (p) => import(path.join(BACKEND, 'src', p));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};
const tick = (ms = 300) => new Promise((r) => setTimeout(r, ms));

const mem = await MongoMemoryServer.create();
await mongoose.connect(mem.getUri(), { dbName: 'noshowtest' });

const Booking = (await imp('models/booking.model.js')).default;
const User = (await imp('models/user.model.js')).default;
const { Driver } = await imp('models/driverModels/driver.model.js');
const noShow = await imp('services/bookingNoShowTimeout.service.js');
const { userEndTripService } = await imp('services/bookingTrip.service.js');

const user = await User.create({ name: 'NS User', email: `ns${Date.now()}@t.local`, role: 'user' });
const other = await User.create({ name: 'Other', email: `ot${Date.now()}@t.local`, role: 'user' });
const driver = await Driver.create({
  name: 'NS Driver', phone: '9000020000', email: 'nsd@t.local',
  approvalStatus: 'approved', city: 'Indore', isOnline: true, isOnTrip: true,
});
const PICKUP = { address: 'Pickup', city: 'Indore', location: { type: 'Point', coordinates: [75.85, 22.72] } };
let seq = 0;
const HOUR = 60 * 60_000;
const mkArrived = (over = {}) => Booking.create({
  bookingNumber: `NS${Date.now()}${seq++}`,
  userId: user._id,
  driverId: driver._id,
  serviceType: 'hourly',
  bookingType: 'instant',
  city: 'Indore',
  pickup: PICKUP,
  dropoff: { address: 'Drop', city: 'Indore', location: { type: 'Point', coordinates: [75.9, 22.75] } },
  hourly: { scheduledStartAt: new Date(), durationHours: 2, isCustomDuration: true, tripType: 'round_trip' },
  fareSnapshot: { baseFare: 500, total: 500, totalPayable: 500 },
  paymentMode: 'pre_ride',
  paymentMethod: 'online',
  paymentStatus: 'paid',
  status: 'arrived',
  // Arrived long ago, so every timer is already overdue and fires at once.
  timeline: { arrivedAt: new Date(Date.now() - 5 * HOUR) },
  rideStartOtp: { code: '1234', generatedAt: new Date(Date.now() - 5 * HOUR), verifiedAt: null, attempts: 0 },
  ...over,
});
const reload = (id) => Booking.findById(id).lean();
const stillArrived = (b) => b.status === 'arrived' && !b.timeline?.startedAt && !b.timeline?.completedAt;

console.log('\n[1] every reminder fires, booking stays ARRIVED');
{
  const b = await mkArrived();
  await noShow.schedulePromptTimer(b._id, b.timeline.arrivedAt);
  // Drive the whole reminder chain: each prompt's deadline is pushed into
  // the past and resumed, as the 30s lifecycle sweep would after a restart.
  for (let i = 0; i < 10; i++) {
    await tick();
    noShow.cancelNoShowSchedule(b._id);
    const cur = await reload(b._id);
    if (cur.noShow?.promptDeadlineAt) {
      await Booking.updateOne({ _id: b._id }, { $set: { 'noShow.promptDeadlineAt': new Date(Date.now() - 1000) } });
    }
    await noShow.resumeNoShowScheduleIfNeeded(await reload(b._id));
  }
  await tick();
  const after = await reload(b._id);
  check('reminders were sent', Number(after.noShow?.firedFor) >= 1, `firedFor=${after.noShow?.firedFor}`);
  check('reminders capped (default 2 + 1 last)', Number(after.noShow?.firedFor) === 3, `firedFor=${after.noShow?.firedFor}`);
  check('still ARRIVED, not started/completed', stillArrived(after), JSON.stringify({ s: after.status, t: after.timeline }));
  check('last reminder has no deadline', after.noShow?.promptDeadlineAt == null);
  noShow.cancelNoShowSchedule(b._id);
}

console.log('\n[2] legacy booking parked on the old auto-complete deadline');
{
  const b = await mkArrived({
    noShow: { promptSentAt: new Date(), promptDeadlineAt: new Date(Date.now() - 1000), firedFor: 3, customerResponse: '' },
  });
  await noShow.resumeNoShowScheduleIfNeeded(await reload(b._id));
  await tick(500);
  check('not auto-completed after restart', stillArrived(await reload(b._id)));
  noShow.cancelNoShowSchedule(b._id);
}

console.log('\n[3] customer says "not coming"');
{
  const b = await mkArrived();
  await noShow.recordCustomerNotComing(b._id, user._id);
  await tick();
  const after = await reload(b._id);
  check('response recorded', after.noShow?.customerResponse === 'not_coming');
  check('still ARRIVED, not completed/cancelled', stillArrived(after), after.status);
  const d = await Driver.findById(driver._id).lean();
  check('driver still locked on trip', d.isOnTrip === true);
  await noShow.resumeNoShowScheduleIfNeeded(after);
  await tick();
  check('no more reminders after "not coming"', Number((await reload(b._id)).noShow?.firedFor || 0) === 0);
  noShow.cancelNoShowSchedule(b._id);
}

console.log('\n[4] another user cannot answer for this booking');
{
  const b = await mkArrived();
  let status = null;
  try { await noShow.recordCustomerNotComing(b._id, other._id); } catch (e) { status = e.statusCode; }
  check('404 for non-owner', status === 404, `got ${status}`);
  check('booking untouched', (await reload(b._id)).noShow?.customerResponse !== 'not_coming');
  let bad = null;
  try { await noShow.recordCustomerOnMyWay('not-an-id', user._id); } catch (e) { bad = e.statusCode; }
  check('404 for malformed id', bad === 404, `got ${bad}`);
}

console.log('\n[5] a STARTED row without a verified OTP cannot be ended');
{
  const b = await mkArrived({ status: 'started' });
  let status = null;
  try { await userEndTripService(user._id, b._id); } catch (e) { status = e.statusCode; }
  check('end trip refused (409)', status === 409, `got ${status}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
await mongoose.disconnect();
await mem.stop();
process.exit(fail ? 1 : 0);
