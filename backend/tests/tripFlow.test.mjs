// Trip-flow test against a throwaway in-memory MongoDB.   Run: npm run test:flow
//
// Covers: customer-only trip end, fare frozen at end time, payment-confirm
// completion, and one-instant-ride-at-a-time dispatch rules.
// Copies the ServicePricing docs from the .env database (read-only) so fares
// match the configured pricing. Redis / Firebase / SMS / payments are disabled
// so nothing outside this process is touched.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(BACKEND, '.env') });
const REAL_URI = process.env.MONGO_URI;
const REAL_DB = process.env.DB_NAME;
for (const k of Object.keys(process.env)) {
  if (/^(REDIS|FIREBASE|SMS_|RAZORPAY|CLOUDINARY)/.test(k)) delete process.env[k];
}
const mongoose = (await import('mongoose')).default;
const imp = (p) => import(path.join(BACKEND, 'src', p));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};
const expectReject = async (name, fn, re) => {
  try { await fn(); check(name, false, '(no error thrown)'); }
  catch (e) { check(name, re.test(e.message), `(got: ${e.message})`); }
};

// 1. Real pricing config, read-only.
const realConn = await mongoose.createConnection(REAL_URI, { dbName: REAL_DB }).asPromise();
const pricingDocs = await realConn.db.collection('servicepricings').find({}).toArray();
await realConn.close();

// 2. In-memory DB.
const mem = await MongoMemoryServer.create();
await mongoose.connect(mem.getUri(), { dbName: 'flowtest' });
await mongoose.connection.db.collection('servicepricings').insertMany(pricingDocs);

const Booking = (await imp('models/booking.model.js')).default;
const User = (await imp('models/user.model.js')).default;
const { Driver } = await imp('models/driverModels/driver.model.js');
const trip = await imp('services/bookingTrip.service.js');
const dispatch = await imp('services/bookingDispatch.service.js');
const conflict = await imp('services/driverConflict.service.js');

const hourly = pricingDocs.find((p) => p.serviceType === 'hourly');
const rate = hourly?.customHours?.ratePerHour;
const extraRate = hourly?.extraHourCharge || 0;
console.log(`pricing: hourly custom rate ₹${rate}/h, extra hour ₹${extraRate}`);

const user = await User.create({ name: 'Flow Test User', email: `u${Date.now()}@t.local`, role: 'user' });
const otherUser = await User.create({ name: 'Other User', email: `o${Date.now()}@t.local`, role: 'user' });
const driver = await Driver.create({
  name: 'Flow Test Driver', phone: '9000000001', email: 'd@t.local',
  approvalStatus: 'approved', city: 'Indore', isOnline: true, wallet: { balance: 5000 },
});
const PICKUP = { address: 'Pickup', city: 'Indore', location: { type: 'Point', coordinates: [75.85, 22.72] } };
let seq = 0;
const mkBooking = (over = {}) => Booking.create({
  bookingNumber: `T${Date.now()}${seq++}`,
  userId: user._id,
  serviceType: 'hourly',
  bookingType: 'instant',
  city: 'Indore',
  pickup: PICKUP,
  dropoff: { address: 'Drop', city: 'Indore', location: { type: 'Point', coordinates: [75.9, 22.75] } },
  hourly: { scheduledStartAt: new Date(), durationHours: 5, isCustomDuration: true, tripType: 'round_trip' },
  fareSnapshot: { baseFare: rate * 5, total: rate * 5 },
  paymentMode: 'post_ride',
  paymentMethod: 'cash',
  paymentStatus: 'not_due_yet',
  ...over,
});

const HOUR = 3600_000;

console.log('\n[A] Customer-only trip end');
const b1 = await mkBooking({
  status: 'started', driverId: driver._id,
  timeline: { driverAssignedAt: new Date(Date.now() - 3 * HOUR), startedAt: new Date(Date.now() - 2 * HOUR) },
});
await expectReject('driver "Complete trip" refused before customer ends', () =>
  trip.calculateAndRequestPaymentService(driver._id, b1._id), /customer to end/);
await expectReject('driver payment confirm refused before customer ends', () =>
  trip.completeTripService(driver._id, b1._id, { paymentMethod: 'cash' }), /customer to end/);
await expectReject('another user cannot end this trip', () =>
  trip.userEndTripService(otherUser._id, b1._id), /not found/i);

const ended = await trip.userEndTripService(user._id, b1._id);
check('user ends trip → still STARTED, awaiting payment', ended.status === 'started', ended.status);
check('tripEndedAt stamped, endedBy = user', !!ended.timeline.tripEndedAt && ended.timeline.tripEndedBy === 'user');
// Time is billed on the clock, not the booked window. This booking reserved
// 5h and used ~2h, so it pays for ~2h. (It previously charged the full 5h
// package; that was the behaviour this assertion was written to lock in, and
// it is deliberately inverted here.) The tolerance is one minute's worth of
// fare: `actualDurationMin` is ceil()'d from timestamps, so a sub-second drift
// at setup shows up as a 121st minute.
const expectedBase = rate * 2;
const oneMinute = rate / 60;
check(
  `5h booked, ran 2h → billed ~2h pro-rata (≈₹${expectedBase}), not the 5h package (₹${rate * 5})`,
  Math.abs(ended.fareSnapshot.baseFare - expectedBase) <= oneMinute * 1.5 &&
    ended.fareSnapshot.baseFare < rate * 5,
  `(baseFare ${ended.fareSnapshot.baseFare})`,
);
check('under-used booking is flagged pro-rated for the invoice',
  ended.fareSnapshot.breakdown?.isProRated === true,
  String(ended.fareSnapshot.breakdown?.isProRated));
check(`quoted package price still recorded (₹${rate * 5}) so the invoice can show both`,
  ended.fareSnapshot.breakdown?.quotedPackagePrice === rate * 5,
  String(ended.fareSnapshot.breakdown?.quotedPackagePrice));
check('payment now pending', ended.paymentStatus === 'pending', ended.paymentStatus);
const total1 = ended.fareSnapshot.total;
console.log(`        final fare total ₹${total1}`);

const again = await trip.userEndTripService(user._id, b1._id);
check('second End-trip tap keeps same end time', String(again.timeline.tripEndedAt) === String(ended.timeline.tripEndedAt));
const driverView = await trip.calculateAndRequestPaymentService(driver._id, b1._id);
check('driver can open fare after customer ended; fare unchanged', driverView.fareSnapshot.total === total1,
  `(${driverView.fareSnapshot.total} vs ${total1})`);

console.log('\n[B] Fare frozen at end time (overtime case)');
const b2 = await mkBooking({
  status: 'started', driverId: driver._id,
  timeline: { driverAssignedAt: new Date(Date.now() - 9 * HOUR), startedAt: new Date(Date.now() - 8 * HOUR) },
});
await trip.userEndTripService(user._id, b2._id);
// Pretend the customer ended 2h ago (6h into a 5h booking), and the driver confirms now.
const b2doc = await Booking.findById(b2._id).lean();
await Booking.updateOne({ _id: b2._id }, { $set: { 'timeline.tripEndedAt': new Date(b2doc.timeline.startedAt.getTime() + 6 * HOUR) } });
const done2 = await trip.completeTripService(driver._id, b2._id, { paymentMethod: 'cash' });
check('trip completes after driver confirms cash', done2.status === 'completed', done2.status);
check('overtime billed to end time: 1 extra hour (not 3)', done2.fareSnapshot.breakdown?.extraHours === 1,
  `(extraHours ${done2.fareSnapshot.breakdown?.extraHours})`);

console.log('\n[C] Complete booking A (cash) → completed');
const done1 = await trip.completeTripService(driver._id, b1._id, { paymentMethod: 'cash' });
check('booking A completed', done1.status === 'completed', done1.status);
check('booking A fare unchanged at completion', done1.fareSnapshot.total === total1, `(${done1.fareSnapshot.total})`);
const dAfter = await Driver.findById(driver._id).lean();
check('driver freed (isOnTrip false) after completion', dAfter.isOnTrip === false, String(dAfter.isOnTrip));

console.log('\n[D] One ride at a time');
const active = await mkBooking({
  status: 'started', driverId: driver._id,
  timeline: { driverAssignedAt: new Date(Date.now() - HOUR), startedAt: new Date(Date.now() - 0.5 * HOUR) },
});
const offer = (b) => Booking.updateOne({ _id: b._id }, { $set: { 'dispatch.pendingOfferIds': [driver._id], 'dispatch.offers': [{ driverId: driver._id, offeredAt: new Date() }] } });
const instantNew = await mkBooking({ userId: otherUser._id, status: 'searching' });
await offer(instantNew);
const r1 = await dispatch.acceptBookingService(instantNew._id, driver._id);
check('busy driver cannot accept a new INSTANT ride', r1.ok === false && r1.reason === 'driver_busy', JSON.stringify(r1));

const tomorrow = new Date(Date.now() + 24 * HOUR);
const schedNew = await mkBooking({ userId: otherUser._id, status: 'searching', bookingType: 'scheduled',
  hourly: { scheduledStartAt: tomorrow, durationHours: 3, isCustomDuration: true, tripType: 'round_trip' } });
await offer(schedNew);
const r2 = await dispatch.acceptBookingService(schedNew._id, driver._id);
check('busy driver CAN accept a future SCHEDULED ride', r2.ok === true, JSON.stringify(r2));

const instWindow = conflict.estimateBookingWindow({ bookingType: 'instant', hourly: { durationHours: 2 } });
const busyForInstant = await conflict.findConflictingDriverIds({ window: instWindow });
check('busy driver excluded from new instant requests', busyForInstant.includes(String(driver._id)));
const farWindow = { startMs: Date.now() + 48 * HOUR, endMs: Date.now() + 50 * HOUR };
const busyForFar = await conflict.findConflictingDriverIds({ window: farWindow, excludeBusyDrivers: false });
check('busy driver still offered non-overlapping scheduled/monthly', !busyForFar.includes(String(driver._id)));

await Booking.updateOne({ _id: active._id }, { $set: { status: 'completed' } });
const instantNew2 = await mkBooking({ userId: otherUser._id, status: 'searching' });
await offer(instantNew2);
const r3 = await dispatch.acceptBookingService(instantNew2._id, driver._id);
check('after current ride completes, driver can accept instant again', r3.ok === true, JSON.stringify(r3));

await new Promise((r) => setTimeout(r, 1500)); // let fire-and-forget writes finish
console.log(`\n${pass} passed, ${fail} failed`);
await mongoose.disconnect();
await mem.stop();
process.exit(fail ? 1 : 0);
