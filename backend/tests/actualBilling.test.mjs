// Actual-usage billing tests.   Run: npm run test:billing
//
// Two things under test, both changes to how money is computed:
//
//   1. Time is billed on the clock, not the booked window. A 2h booking that
//      runs 30 minutes pays for 30 minutes. A full-length ride must still cost
//      exactly what the package quoted, and overtime must be unchanged —
//      otherwise this is a price change, not a fairness fix.
//
//   2. Distance is measured server-side from the driver's GPS stream. The
//      filtering rules are what separate a fair per-km charge from one
//      inflated by a car idling at a red light, so they are tested directly.
//
// Runs against a throwaway in-memory MongoDB plus the real pricing config
// copied read-only from the configured database.
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
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

const realConn = await mongoose.createConnection(REAL_URI, { dbName: REAL_DB }).asPromise();
const pricingDocs = await realConn.db.collection('servicepricings').find({}).toArray();
await realConn.close();

const mem = await MongoMemoryServer.create();
await mongoose.connect(mem.getUri(), { dbName: 'billingtest' });
await mongoose.connection.db.collection('servicepricings').insertMany(pricingDocs);

const Booking = (await imp('models/booking.model.js')).default;
const User = (await imp('models/user.model.js')).default;
const { Driver } = await imp('models/driverModels/driver.model.js');
const { calculateHourlyFare } = await imp('services/pricing.service.js');
const { evaluateLeg, haversineMeters, accumulateTripDistance, resetTripDistance, tripKm } =
  await imp('services/tripDistance.service.js');

const pricing = pricingDocs.find((p) => p.serviceType === 'hourly');
const SLAB = { price: 300, maxHours: 2, minHours: 1 };
const IMPLIED_RATE = SLAB.price / SLAB.maxHours; // ₹150/h
const customRate = pricing?.customHours?.ratePerHour || 120;
const extraRate = pricing?.extraHourCharge || 0;

// Sections A-D predate the minimum and assert pure pro-rata, so they pin the
// floor off explicitly. Section I below covers the floor itself.
const noFloorPricing = { ...pricing, minBillableHours: 0 };

const fareFor = (actualDurationMin, over = {}) =>
  calculateHourlyFare({
    pricing: noFloorPricing,
    slab: SLAB,
    isCustomDuration: false,
    actualDurationMin,
    bookedHours: 2,
    tripType: 'round_trip',
    estimatedKm: 0,
    ...over,
  });

/* ------------------------------------------------------------------ */
console.log('\n[A] Time billed on the clock, not the booked window');
/* ------------------------------------------------------------------ */
console.log(`      slab ${SLAB.maxHours}h / ₹${SLAB.price} → implied ₹${IMPLIED_RATE}/h\n`);

const half = fareFor(30);
check('30 min of a 2h package bills 30 min',
  near(half.packagePrice, IMPLIED_RATE * 0.5), `(₹${half.packagePrice}, expected ₹${IMPLIED_RATE * 0.5})`);
check('…and is flagged pro-rated', half.isProRated === true);
check('…while still reporting the quoted package price',
  half.quotedPackagePrice === SLAB.price, `(₹${half.quotedPackagePrice})`);
check('…and the minutes actually billed', half.billedMinutes === 30, `(${half.billedMinutes})`);

const oneHour = fareFor(60);
check('1 h bills half the 2h package',
  near(oneHour.packagePrice, IMPLIED_RATE), `(₹${oneHour.packagePrice})`);

/* ------------------------------------------------------------------ */
console.log('\n[B] No price change for a full-length ride');
/* ------------------------------------------------------------------ */
// The regression that matters: pro-rating must not quietly re-price rides
// that use their whole window.
const full = fareFor(120);
check('a full 2 h still costs exactly the ₹300 package',
  near(full.packagePrice, SLAB.price), `(₹${full.packagePrice})`);
check('a full-length ride is NOT flagged pro-rated', full.isProRated === false);

const quote = fareFor(null);
check('a quote (no actual duration yet) still shows the booked package price',
  near(quote.packagePrice, SLAB.price), `(₹${quote.packagePrice})`);
check('a quote is not flagged pro-rated', quote.isProRated === false);

/* ------------------------------------------------------------------ */
console.log('\n[C] Overtime is unchanged');
/* ------------------------------------------------------------------ */
const over30 = fareFor(150);
check('30 min past the window bills the full package + 1 extra hour',
  near(over30.packagePrice, SLAB.price) && over30.extraHours === 1,
  `(pkg ₹${over30.packagePrice}, extraHours ${over30.extraHours})`);
check('extra hour charged at the dedicated overtime rate',
  near(over30.extraHourCharge, extraRate), `(₹${over30.extraHourCharge})`);

const over3h = fareFor(180);
check('a full hour past the window is still 1 extra hour',
  over3h.extraHours === 1, `(${over3h.extraHours})`);

/* ------------------------------------------------------------------ */
console.log('\n[D] Custom-duration bookings pro-rate on their own rate');
/* ------------------------------------------------------------------ */
const custom = calculateHourlyFare({
  pricing: noFloorPricing, slab: null, isCustomDuration: true,
  actualDurationMin: 30, bookedHours: 5, tripType: 'round_trip',
});
check(`30 min of a custom 5h booking bills 30 min at ₹${customRate}/h`,
  near(custom.packagePrice, customRate * 0.5), `(₹${custom.packagePrice})`);
check('quoted price reflects the full custom window',
  custom.quotedPackagePrice === customRate * 5, `(₹${custom.quotedPackagePrice})`);

/* ------------------------------------------------------------------ */
console.log('\n[E] Per-km applies to one-way only');
/* ------------------------------------------------------------------ */
// Round trips bill time only — this is the product decision, so it is pinned.
const perKm = pricing?.oneWayCharge?.perKmRate || 0;
const roundTrip = fareFor(120, { tripType: 'round_trip', estimatedKm: 10 });
check('round trip ignores distance entirely',
  roundTrip.oneWayCharge === 0, `(₹${roundTrip.oneWayCharge})`);
const oneWay = fareFor(120, { tripType: 'one_way', estimatedKm: 10 });
check(`one-way bills ₹${perKm}/km`,
  near(oneWay.oneWayCharge, perKm * 10), `(₹${oneWay.oneWayCharge})`);

/* ------------------------------------------------------------------ */
console.log('\n[F] GPS leg filtering');
/* ------------------------------------------------------------------ */
const INDORE = { lat: 22.7196, lng: 75.8577 };
// ~111 m north.
const north111 = { lat: 22.7206, lng: 75.8577 };
check('haversine is sane (~111 m for 0.001°)',
  near(haversineMeters(INDORE, north111), 111, 3), `(${haversineMeters(INDORE, north111).toFixed(1)} m)`);

check('first fix only seeds the cursor, bills nothing',
  evaluateLeg(null, INDORE, 10).meters === 0 && evaluateLeg(null, INDORE, 10).advanceCursor === true);

// A car parked at a light: GPS wanders a few metres.
const jitter = { lat: 22.71962, lng: 75.85772 };
const jitterLeg = evaluateLeg(INDORE, jitter, 10);
check('jitter below the floor bills nothing',
  jitterLeg.meters === 0, `(${jitterLeg.meters} m)`);
check('…and holds the cursor so slow real movement still accrues',
  jitterLeg.advanceCursor === false);

const realLeg = evaluateLeg(INDORE, north111, 10);
check('a genuine 111 m leg is billed', near(realLeg.meters, 111, 3) && realLeg.advanceCursor === true,
  `(${realLeg.meters.toFixed(1)} m)`);

// Signal returning after a tunnel.
const teleport = { lat: 22.80, lng: 75.95 };
const teleportLeg = evaluateLeg(INDORE, teleport, 10);
check('an implausible jump is not billed', teleportLeg.meters === 0, `(${teleportLeg.meters})`);
check('…but the cursor moves on so the next leg measures from reality',
  teleportLeg.advanceCursor === true);

check('an inaccurate fix is ignored entirely',
  evaluateLeg(INDORE, north111, 500).meters === 0 &&
  evaluateLeg(INDORE, north111, 500).advanceCursor === false);

/* ------------------------------------------------------------------ */
console.log('\n[G] Distance accumulates onto the live booking only');
/* ------------------------------------------------------------------ */
const user = await User.create({ name: 'Bill User', email: `b${Date.now()}@t.local`, role: 'user' });
const driver = await Driver.create({
  name: 'Bill Driver', phone: '9000030001', email: 'bd@t.local',
  approvalStatus: 'approved', city: 'Indore', isOnline: true,
});
const mk = (over = {}) => Booking.create({
  bookingNumber: `B${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
  userId: user._id, driverId: driver._id,
  serviceType: 'hourly', bookingType: 'instant', city: 'Indore',
  pickup: { address: 'P', city: 'Indore', location: { type: 'Point', coordinates: [75.8577, 22.7196] } },
  hourly: { scheduledStartAt: new Date(), durationHours: 2, tripType: 'one_way', estimatedKm: 6 },
  fareSnapshot: { baseFare: 300, total: 330 },
  ...over,
});

const live = await mk({ status: 'started', timeline: { startedAt: new Date() } });
await resetTripDistance(live._id);
await accumulateTripDistance(driver._id, { lat: 22.7196, lng: 75.8577, accuracy: 10 }); // seed
await accumulateTripDistance(driver._id, { lat: 22.7206, lng: 75.8577, accuracy: 10 }); // +111 m
await accumulateTripDistance(driver._id, { lat: 22.7216, lng: 75.8577, accuracy: 10 }); // +111 m

const afterPings = await Booking.findById(live._id).lean();
check('two 111 m legs accumulate to ~0.22 km',
  near(tripKm(afterPings), 0.22, 0.02), `(${tripKm(afterPings)} km)`);
check('ping count tracks accepted samples', afterPings.trip.pingCount === 2, `(${afterPings.trip.pingCount})`);

// Jitter must not inflate the meter.
const before = tripKm(afterPings);
await accumulateTripDistance(driver._id, { lat: 22.72161, lng: 75.85771, accuracy: 10 });
check('idling does not add distance',
  near(tripKm(await Booking.findById(live._id).lean()), before), '(meter moved while parked)');

/* ------------------------------------------------------------------ */
console.log('\n[H] Metering stops when the customer ends the trip');
/* ------------------------------------------------------------------ */
// The fare is frozen at tripEndedAt but the booking stays STARTED until the
// driver confirms payment — so without a freeze the drive away from the drop
// would keep adding billable km after the fare was settled.
await Booking.updateOne({ _id: live._id }, { $set: { 'timeline.tripEndedAt': new Date() } });
const atEnd = tripKm(await Booking.findById(live._id).lean());
await accumulateTripDistance(driver._id, { lat: 22.7300, lng: 75.8577, accuracy: 10 });
check('distance is frozen once the trip is ended',
  near(tripKm(await Booking.findById(live._id).lean()), atEnd),
  '(km kept accruing after trip end)');

// And a driver with no live trip must not accrue anything anywhere.
await Booking.updateOne({ _id: live._id }, { $set: { status: 'completed' } });
const res = await accumulateTripDistance(driver._id, { lat: 22.7400, lng: 75.8577, accuracy: 10 });
check('a driver with no started trip accrues nothing', res === null, JSON.stringify(res));

/* ------------------------------------------------------------------ */
console.log('\n[I] Minimum billable duration');
/* ------------------------------------------------------------------ */
// The driver reserved the slot and turned down other work, so a ride shorter
// than the minimum is still billed for the minimum.
const floored = { ...pricing, minBillableHours: 2 };
const withFloor = (actualDurationMin, slab, bookedHours) =>
  calculateHourlyFare({
    pricing: floored, slab, isCustomDuration: !slab,
    actualDurationMin, bookedHours, tripType: 'round_trip', estimatedKm: 0,
  });

const short2h = withFloor(30, SLAB, 2);
check('30 min on a 2h slab bills the full 2h minimum',
  near(short2h.packagePrice, SLAB.price), `(₹${short2h.packagePrice})`);
check('…flagged so the invoice can explain it', short2h.minimumApplied === true);
check('…actual minutes still reported for display',
  short2h.actualMinutes === 30, `(${short2h.actualMinutes})`);
check('…billed minutes raised to the floor',
  short2h.billedMinutes === 120, `(${short2h.billedMinutes})`);

const short5h = withFloor(30, null, 5);
check('30 min on a 5h custom booking bills 2h, not 5h',
  near(short5h.packagePrice, customRate * 2), `(₹${short5h.packagePrice})`);
check('…so the floor raises, but never to the whole booked window',
  short5h.packagePrice < customRate * 5);

// THE TRAP: flooring only the minutes would overflow a sub-minimum window and
// bill overtime the customer never used.
const SHORT_SLAB = { price: 180, maxHours: 1, minHours: 0 };
const trap = withFloor(20, SHORT_SLAB, 1);
check('20 min on a 1h slab charges NO phantom extra hour',
  trap.extraHours === 0, `(extraHours ${trap.extraHours}, charge ₹${trap.extraHourCharge})`);
check('…and bills exactly 2h at the slab rate',
  near(trap.packagePrice, (SHORT_SLAB.price / SHORT_SLAB.maxHours) * 2), `(₹${trap.packagePrice})`);

// Above the floor, nothing changes.
const above = withFloor(180, SLAB, 2);
check('a 3h ride is unaffected by the floor', above.minimumApplied === false);
check('…and still bills package + 1 extra hour',
  near(above.packagePrice, SLAB.price) && above.extraHours === 1,
  `(₹${above.packagePrice}, extraHours ${above.extraHours})`);

const exact = withFloor(120, SLAB, 2);
check('a ride exactly at the floor is not flagged', exact.minimumApplied === false);

// The floor must be genuinely optional.
const noFloor = calculateHourlyFare({
  pricing: { ...pricing, minBillableHours: 0 }, slab: SLAB,
  isCustomDuration: false, actualDurationMin: 30, bookedHours: 2, tripType: 'round_trip',
});
check('minBillableHours = 0 restores pure pro-rata',
  near(noFloor.packagePrice, IMPLIED_RATE * 0.5) && noFloor.minimumApplied === false,
  `(₹${noFloor.packagePrice})`);

// The quote must still show the booked package, not the floor.
const flooredQuote = withFloor(null, SLAB, 2);
check('a quote is never "minimum applied"', flooredQuote.minimumApplied === false);
check('…and still quotes the booked package price',
  near(flooredQuote.packagePrice, SLAB.price), `(₹${flooredQuote.packagePrice})`);

console.log(`\n${pass} passed, ${fail} failed`);
await mongoose.disconnect();
await mem.stop();
process.exit(fail ? 1 : 0);
