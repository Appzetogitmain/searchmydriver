// Post-ride payment, end to end.   Run: npm run test:postride
//
// Walks one hourly booking through every real service call in the order the
// apps make them, and asserts the thing that was asked for: the customer is
// never asked for money until the ride is over, and the amount they are then
// asked for is computed from the clock and the odometer, not from the booking.
//
// Every transition below is the production service — nothing is stubbed except
// the GPS fixes, which stand in for the driver's phone. Redis / Firebase / SMS
// / Razorpay are stripped from the environment so nothing outside this process
// is touched; pricing is copied read-only from the configured database so the
// fares are the real ones.
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
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

const realConn = await mongoose.createConnection(REAL_URI, { dbName: REAL_DB }).asPromise();
const pricingDocs = await realConn.db.collection('servicepricings').find({}).toArray();
await realConn.close();

const mem = await MongoMemoryServer.create();
await mongoose.connect(mem.getUri(), { dbName: 'postride' });
await mongoose.connection.db.collection('servicepricings').insertMany(pricingDocs);

const Booking = (await imp('models/booking.model.js')).default;
const User = (await imp('models/user.model.js')).default;
const { Driver } = await imp('models/driverModels/driver.model.js');
const dispatch = await imp('services/bookingDispatch.service.js');
const trip = await imp('services/bookingTrip.service.js');
const payment = await imp('services/bookingPayment.service.js');
const { accumulateTripDistance } = await imp('services/tripDistance.service.js');
const { creditWalletService } = await imp('services/wallet.service.js');

const hourly = pricingDocs.find((p) => p.serviceType === 'hourly');
const perKmRate = hourly?.oneWayCharge?.perKmRate || 0;

// Pickup, and a point ~1.1 km north of it that the driver will "drive" to.
const PICKUP = { lat: 22.7196, lng: 75.8577 };
const LEG = 0.001; // ~111 m per step

const user = await User.create({ name: 'Ride User', email: `r${Date.now()}@t.local`, role: 'user' });
const driver = await Driver.create({
  name: 'Ride Driver', phone: '9000050001', email: 'rd@t.local',
  approvalStatus: 'approved', city: 'Indore', isOnline: true, wallet: { balance: 5000 },
});

// The customer's booking: 2 hours reserved, one-way (so per-km applies).
const booking = await Booking.create({
  bookingNumber: `PR${Date.now()}`,
  userId: user._id,
  serviceType: 'hourly',
  bookingType: 'instant',
  city: 'Indore',
  pickup: { address: 'Pickup', city: 'Indore', location: { type: 'Point', coordinates: [PICKUP.lng, PICKUP.lat] } },
  dropoff: { address: 'Drop', city: 'Indore', location: { type: 'Point', coordinates: [75.90, 22.75] } },
  hourly: { scheduledStartAt: new Date(), durationHours: 5, isCustomDuration: true, tripType: 'one_way', estimatedKm: 6 },
  fareSnapshot: { baseFare: 600, total: 700 },
  // What createBookingService stamps for an online hourly booking.
  paymentMethod: 'online',
  paymentMode: 'post_ride',
  paymentStatus: 'not_due_yet',
  status: 'searching',
  dispatch: { pendingOfferIds: [driver._id], offers: [{ driverId: driver._id, offeredAt: new Date() }] },
});

const reload = () => Booking.findById(booking._id).lean();
const MIN = 60_000;

/* ------------------------------------------------------------------ */
console.log('\n[1] Driver accepts — no money is asked for');
/* ------------------------------------------------------------------ */
const accepted = await dispatch.acceptBookingService(booking._id, driver._id);
check('accept succeeds', accepted.ok === true, JSON.stringify(accepted));

let b = await reload();
check('goes straight to driver_assigned, NOT awaiting_payment',
  b.status === 'driver_assigned', b.status);
check('payment mode stays post_ride', b.paymentMode === 'post_ride', b.paymentMode);
check('nothing is due yet', b.paymentStatus === 'not_due_yet', b.paymentStatus);
check('no 60-second payment deadline is armed',
  !b.timeline?.paymentDeadlineAt, String(b.timeline?.paymentDeadlineAt));

// The customer must not be able to pay yet — there is no fare to pay.
await expectReject('customer cannot pay before the ride: "not due at this stage"',
  () => payment.createBookingPaymentOrderService(user._id, booking._id),
  /not due at this stage/i);

/* ------------------------------------------------------------------ */
console.log('\n[2] Driver drives to pickup and arrives');
/* ------------------------------------------------------------------ */
await trip.markDriverEnRouteService(driver._id, booking._id);
b = await reload();
check('en_route', b.status === 'en_route', b.status);
check('still nothing due', b.paymentStatus === 'not_due_yet', b.paymentStatus);

await trip.markDriverArrivedService(driver._id, booking._id, { driverCoords: PICKUP });
b = await reload();
check('arrived', b.status === 'arrived', b.status);
check('ride-start OTP issued', !!b.rideStartOtp?.code, String(b.rideStartOtp?.code));
check('still nothing due', b.paymentStatus === 'not_due_yet', b.paymentStatus);

/* ------------------------------------------------------------------ */
console.log('\n[3] Ride starts — the meter is zeroed');
/* ------------------------------------------------------------------ */
await trip.startTripService(driver._id, booking._id, { otp: b.rideStartOtp.code });
b = await reload();
check('started', b.status === 'started', b.status);
check('distance meter reset to zero at start',
  (b.trip?.actualKm || 0) === 0, String(b.trip?.actualKm));
check('STILL nothing due mid-ride', b.paymentStatus === 'not_due_yet', b.paymentStatus);

/* ------------------------------------------------------------------ */
console.log('\n[4] The car actually moves — 10 GPS fixes, ~1.1 km');
/* ------------------------------------------------------------------ */
// The driver's phone emits a fix every 5s; we feed 10 consecutive legs.
for (let i = 0; i <= 10; i += 1) {
  await accumulateTripDistance(driver._id, {
    lat: PICKUP.lat + LEG * i,
    lng: PICKUP.lng,
    accuracy: 8,
  });
}
// Plus a stretch sitting at a traffic light — must not add anything.
for (let i = 0; i < 5; i += 1) {
  await accumulateTripDistance(driver._id, {
    lat: PICKUP.lat + LEG * 10 + 0.00001 * i,
    lng: PICKUP.lng,
    accuracy: 8,
  });
}
b = await reload();
const measuredKm = b.trip?.actualKm || 0;
check('server measured ~1.11 km from the GPS stream',
  near(measuredKm, 1.11, 0.05), `(${measuredKm.toFixed(3)} km)`);
check('idling at the light added nothing',
  b.trip.pingCount === 10, `(pingCount ${b.trip.pingCount})`);

/* ------------------------------------------------------------------ */
console.log('\n[5] Customer ends the trip after 3 h of a 5 h booking');
/* ------------------------------------------------------------------ */
// Above the 2-hour minimum, so this exercises real pro-rating: the customer
// reserved 5 h, used 3 h, and should pay for 3 h. (The minimum itself is
// covered in section [10] and in the billing suite.)
await Booking.updateOne(
  { _id: booking._id },
  { $set: { 'timeline.startedAt': new Date(Date.now() - 180 * MIN) } },
);

const ended = await trip.userEndTripService(user._id, booking._id);
b = await reload();
check('trip ended, booking still started (awaiting settlement)',
  b.status === 'started' && !!b.timeline.tripEndedAt, b.status);

const bd = b.fareSnapshot.breakdown;
console.log(`        billed ${bd.billedMinutes} min @ ₹${bd.hourlyRate}/h` +
  ` = ₹${bd.packagePrice}  |  ${bd.estimatedKm} km @ ₹${bd.oneWayPerKmRate}/km = ₹${bd.oneWayCharge}` +
  `  |  total ₹${b.fareSnapshot.total}`);

check('billed for ~3 h, not the booked 5 h',
  bd.billedMinutes >= 179 && bd.billedMinutes <= 182, `(${bd.billedMinutes} min)`);
check('above the 2 h minimum, so the floor does not apply',
  bd.minimumApplied === false, `(minimumApplied ${bd.minimumApplied})`);
check('time charge is pro-rated to ~3 h, not the 5 h package',
  near(bd.packagePrice, bd.hourlyRate * 3, 10), `(₹${bd.packagePrice} vs ₹${bd.hourlyRate}/h)`);
check('flagged pro-rated for the invoice', bd.isProRated === true);
check('quoted 5 h package retained for comparison',
  bd.quotedPackagePrice > bd.packagePrice, `(quoted ₹${bd.quotedPackagePrice}, billed ₹${bd.packagePrice})`);
check('no phantom overtime inside the booked window',
  bd.extraHours === 0, `(extraHours ${bd.extraHours})`);

check('per-km charged on the MEASURED distance, not the 6 km estimate',
  near(bd.estimatedKm, measuredKm, 0.05), `(fare used ${bd.estimatedKm} km, meter said ${measuredKm.toFixed(3)})`);
check('per-km amount matches rate × measured km',
  near(bd.oneWayCharge, perKmRate * measuredKm, 0.1), `(₹${bd.oneWayCharge})`);

// The bill must add up from its own parts. Asserted structurally rather than
// against a fixed rupee figure because the night charge is wall-clock
// dependent: a flat ₹150 applies when the ride window touches 22:00-06:00, so
// pinning the total would make this test pass or fail based on the hour it is
// run at. (`serviceCharge` is deliberately excluded — it is the platform's
// commission figure and is not added to what the customer pays; see
// `applyPlatformLayers`.)
const componentSum =
  bd.packagePrice + bd.extraHourCharge + bd.waitingCharge + bd.nightCharge +
  bd.stayAllowance + bd.foodAllowance + bd.oneWayCharge + bd.tollParking;
check('subtotal equals the sum of its line items',
  near(componentSum, bd.subtotal, 0.02), `(parts ₹${componentSum.toFixed(2)} vs subtotal ₹${bd.subtotal})`);
check('total equals subtotal + GST',
  near(bd.subtotal + bd.gstAmount, bd.totalPayable, 0.02),
  `(₹${(bd.subtotal + bd.gstAmount).toFixed(2)} vs ₹${bd.totalPayable})`);
check('the fare the customer owes is the recomputed one',
  near(b.fareSnapshot.total, bd.totalPayable, 0.02),
  `(snapshot ₹${b.fareSnapshot.total} vs breakdown ₹${bd.totalPayable})`);
if (bd.nightCharge > 0) {
  console.log(`        (night charge ₹${bd.nightCharge} applied — this ride window touches 22:00-06:00)`);
}

check('NOW payment becomes due', b.paymentStatus === 'pending', b.paymentStatus);
check('invoice number stamped', !!b.invoiceNumber, String(b.invoiceNumber));

/* ------------------------------------------------------------------ */
console.log('\n[6] Driver cannot close the ride until the customer pays');
/* ------------------------------------------------------------------ */
await expectReject('completing without payment is refused',
  () => trip.completeTripService(driver._id, booking._id, {}),
  /has not completed payment/i);

/* ------------------------------------------------------------------ */
console.log('\n[7] Customer pays — after the ride');
/* ------------------------------------------------------------------ */
// Payment is only now permitted; fund the wallet and settle.
await creditWalletService({
  userId: user._id, amount: 2000, source: 'topup',
  description: 'test funding',
});
const due = b.fareSnapshot.total;
await payment.payBookingWithWalletService(user._id, booking._id);
b = await reload();
check('booking is paid', b.paymentStatus === 'paid', b.paymentStatus);
check('amount paid equals the recomputed fare',
  near(b.payment.amountPaidRupees, due, 0.02), `(paid ₹${b.payment.amountPaidRupees}, fare ₹${due})`);
check('payment timestamp recorded', !!b.timeline.paymentReceivedAt);

const wallet = await User.findById(user._id).lean();
check('wallet debited by exactly the fare',
  near(wallet.wallet.balance, 2000 - due, 0.02), `(balance ₹${wallet.wallet.balance})`);

/* ------------------------------------------------------------------ */
console.log('\n[8] Driver closes the ride');
/* ------------------------------------------------------------------ */
const completed = await trip.completeTripService(driver._id, booking._id, {});
check('completed', completed.status === 'completed', completed.status);

b = await reload();
check('fare did not move after completion',
  near(b.fareSnapshot.total, due, 0.02), `(₹${b.fareSnapshot.total} vs ₹${due})`);

const driverAfter = await Driver.findById(driver._id).lean();
check('driver released for new offers', driverAfter.isOnTrip === false, String(driverAfter.isOnTrip));

/* ------------------------------------------------------------------ */
console.log('\n[9] Distance is frozen after the ride ends');
/* ------------------------------------------------------------------ */
const kmAtEnd = (await reload()).trip.actualKm;
await accumulateTripDistance(driver._id, { lat: PICKUP.lat + 0.05, lng: PICKUP.lng, accuracy: 8 });
check('driving away adds no billable distance',
  near((await reload()).trip.actualKm, kmAtEnd), '(meter kept running)');

/* ------------------------------------------------------------------ */
console.log('\n[10] Cancelling mid-ride is billed as a short ride');
/* ------------------------------------------------------------------ */
// Regression guard. Moving payment post-ride broke the old fee model:
// `computeUserCancellation` charges a percentage of what has been PAID, and
// under post-ride nothing is paid until the end — so a mid-ride cancellation
// returned a ₹0 fee and the driver was paid nothing for the time they gave.
// A started ride is now settled as the short ride it was, floored at the
// minimum, so the customer owes the minimum and the driver is covered.
const booking2 = await Booking.create({
  bookingNumber: `PRC${Date.now()}`,
  userId: user._id, driverId: driver._id,
  serviceType: 'hourly', bookingType: 'instant', city: 'Indore',
  pickup: { address: 'Pickup', city: 'Indore', location: { type: 'Point', coordinates: [PICKUP.lng, PICKUP.lat] } },
  hourly: { scheduledStartAt: new Date(), durationHours: 2, isCustomDuration: true, tripType: 'one_way', estimatedKm: 6 },
  fareSnapshot: { baseFare: 240, total: 330 },
  paymentMethod: 'online', paymentMode: 'post_ride', paymentStatus: 'not_due_yet',
  status: 'started',
  timeline: { startedAt: new Date(Date.now() - 10 * MIN) },
});

const booking2Svc = await imp('services/booking.service.js');
await booking2Svc.cancelBookingByUserService(user._id, booking2._id, 'changed my mind');

const c = await Booking.findById(booking2._id).lean();
check('booking is cancelled', c.status === 'cancelled', c.status);
check('a mid-ride cancellation leaves an amount OWING, not ₹0',
  c.paymentStatus === 'pending', c.paymentStatus);
check('the amount owed is greater than zero',
  c.fareSnapshot.total > 0, `(₹${c.fareSnapshot.total})`);
check('billed at the 2-hour minimum despite a 10-minute ride',
  c.fareSnapshot.breakdown?.minimumApplied === true &&
    c.fareSnapshot.breakdown?.billedMinutes === 120,
  `(billed ${c.fareSnapshot.breakdown?.billedMinutes} min, actual ${c.fareSnapshot.breakdown?.actualMinutes})`);
check('settled amount recorded on the cancellation for audit',
  near(c.cancellation?.settledFareRupees, c.fareSnapshot.total, 0.02),
  `(₹${c.cancellation?.settledFareRupees})`);
check('no cancellation fee stacked on top of the settled fare',
  (c.cancellation?.feeCharged || 0) === 0, `(fee ₹${c.cancellation?.feeCharged})`);
console.log(`        cancelled after 10 min -> billed ${c.fareSnapshot.breakdown?.billedMinutes} min = ₹${c.fareSnapshot.total}`);

await new Promise((r) => setTimeout(r, 1500)); // let fire-and-forget writes finish
console.log(`\n${pass} passed, ${fail} failed`);
await mongoose.disconnect();
await mem.stop();
process.exit(fail ? 1 : 0);
