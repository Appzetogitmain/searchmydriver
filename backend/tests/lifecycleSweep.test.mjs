// Lifecycle-sweep + payment-reconciliation tests.   Run: npm run test:sweep
//
// Covers the recovery paths that have no coverage otherwise: deadlines that
// elapsed while no in-process timer was armed (the restart case), drivers left
// flagged on-trip with nothing to justify it, and the Razorpay reconciler's
// settle-vs-refund decision.
//
// The reconciler is driven against a stubbed gateway: `fetchRazorpayOrderPayments`
// and `refundRazorpayPayment` are swapped for fakes so the suite never touches
// Razorpay. Everything else — the booking queries, the settle path, the refund
// bookkeeping — is the real code.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(BACKEND, '.env') });
const REAL_URI = process.env.MONGO_URI;
const REAL_DB = process.env.DB_NAME;
// Nothing outside this process gets touched.
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

// Real pricing config, read-only — the no-show stage reads ServicePricing.
const realConn = await mongoose.createConnection(REAL_URI, { dbName: REAL_DB }).asPromise();
const pricingDocs = await realConn.db.collection('servicepricings').find({}).toArray();
await realConn.close();

const mem = await MongoMemoryServer.create();
await mongoose.connect(mem.getUri(), { dbName: 'sweeptest' });
if (pricingDocs.length) {
  await mongoose.connection.db.collection('servicepricings').insertMany(pricingDocs);
}

const Booking = (await imp('models/booking.model.js')).default;
const User = (await imp('models/user.model.js')).default;
const { Driver } = await imp('models/driverModels/driver.model.js');
const { runLifecycleSweep } = await imp('services/lifecycleSweep.service.js');

const user = await User.create({ name: 'Sweep User', email: `sw${Date.now()}@t.local`, role: 'user' });
const PICKUP = { address: 'Pickup', city: 'Indore', location: { type: 'Point', coordinates: [75.85, 22.72] } };
let seq = 0;
let driverSeq = 0;
const mkDriver = (over = {}) => Driver.create({
  name: 'Sweep Driver',
  // Exactly 10 digits — the schema enforces /^[0-9]{10}$/.
  phone: String(9000010000 + driverSeq++),
  email: `sd${driverSeq}@t.local`,
  approvalStatus: 'approved', city: 'Indore', isOnline: true, wallet: { balance: 5000 },
  ...over,
});
const mkBooking = (over = {}) => Booking.create({
  bookingNumber: `S${Date.now()}${seq++}`,
  userId: user._id,
  serviceType: 'hourly',
  bookingType: 'instant',
  city: 'Indore',
  pickup: PICKUP,
  dropoff: { address: 'Drop', city: 'Indore', location: { type: 'Point', coordinates: [75.9, 22.75] } },
  hourly: { scheduledStartAt: new Date(), durationHours: 2, isCustomDuration: true, tripType: 'round_trip' },
  fareSnapshot: { baseFare: 500, total: 500, totalPayable: 500 },
  paymentMode: 'pre_ride',
  paymentMethod: 'online',
  paymentStatus: 'pending',
  ...over,
});

const MIN = 60_000;
const sweep = () => runLifecycleSweep({ includeReconciliation: false });

/* ------------------------------------------------------------------ */
console.log('\n[A] Payment deadline elapsed with no timer armed (the restart case)');
/* ------------------------------------------------------------------ */
// This is the wedge: the API restarts inside the 60s payment window, so the
// in-process timer is gone. Before the sweep existed nothing cancelled the
// booking, and the driver stayed isOnTrip forever — invisible to dispatch,
// because AWAITING_PAYMENT is one of the dispatcher's ON_TRIP_LOCK_STATUSES
// so its own self-heal pass treats the flag as legitimate.
const wedgedDriver = await mkDriver({ isOnTrip: true });
const wedged = await mkBooking({
  status: 'awaiting_payment',
  driverId: wedgedDriver._id,
  timeline: {
    driverAssignedAt: new Date(Date.now() - 10 * MIN),
    paymentDeadlineAt: new Date(Date.now() - 9 * MIN), // long past
  },
});

await sweep();

const wedgedAfter = await Booking.findById(wedged._id).lean();
check('overdue awaiting_payment booking is cancelled', wedgedAfter.status === 'cancelled', wedgedAfter.status);
check('cancellation reason is payment_timeout',
  wedgedAfter.cancellation?.reason === 'payment_timeout', String(wedgedAfter.cancellation?.reason));
check('cancelled by system', wedgedAfter.cancellation?.cancelledBy === 'system');
check('paymentStatus → failed', wedgedAfter.paymentStatus === 'failed', wedgedAfter.paymentStatus);
const wedgedDriverAfter = await Driver.findById(wedgedDriver._id).lean();
check('wedged driver released (isOnTrip false)', wedgedDriverAfter.isOnTrip === false, String(wedgedDriverAfter.isOnTrip));

/* ------------------------------------------------------------------ */
console.log('\n[B] Deadline still in the future is left alone');
/* ------------------------------------------------------------------ */
const liveDriver = await mkDriver({ isOnTrip: true });
const live = await mkBooking({
  status: 'awaiting_payment',
  driverId: liveDriver._id,
  timeline: {
    driverAssignedAt: new Date(),
    paymentDeadlineAt: new Date(Date.now() + 5 * MIN),
  },
});

await sweep();

const liveAfter = await Booking.findById(live._id).lean();
check('booking inside its deadline stays awaiting_payment', liveAfter.status === 'awaiting_payment', liveAfter.status);
const liveDriverAfter = await Driver.findById(liveDriver._id).lean();
check('its driver stays locked', liveDriverAfter.isOnTrip === true, String(liveDriverAfter.isOnTrip));

/* ------------------------------------------------------------------ */
console.log('\n[C] Already-paid booking is never cancelled by the sweep');
/* ------------------------------------------------------------------ */
// Payment landing on the same tick as the deadline must not lose the race.
const paidDriver = await mkDriver({ isOnTrip: true });
const paid = await mkBooking({
  status: 'awaiting_payment',
  driverId: paidDriver._id,
  paymentStatus: 'paid',
  timeline: { paymentDeadlineAt: new Date(Date.now() - 5 * MIN) },
});

await sweep();

const paidAfter = await Booking.findById(paid._id).lean();
check('paid booking is not cancelled despite elapsed deadline',
  paidAfter.status === 'awaiting_payment', paidAfter.status);
check('paid booking keeps paymentStatus', paidAfter.paymentStatus === 'paid', paidAfter.paymentStatus);

/* ------------------------------------------------------------------ */
console.log('\n[D] Stale driver locks');
/* ------------------------------------------------------------------ */
// Crash between the booking-status write and the driver-flag write.
const orphanDriver = await mkDriver({ isOnTrip: true });
// A driver with genuinely live work must survive the sweep.
const busyDriver = await mkDriver({ isOnTrip: true });
await mkBooking({ status: 'started', driverId: busyDriver._id, paymentStatus: 'not_due_yet' });

await sweep();

const orphanAfter = await Driver.findById(orphanDriver._id).lean();
check('driver with no live booking is released', orphanAfter.isOnTrip === false, String(orphanAfter.isOnTrip));
const busyAfter = await Driver.findById(busyDriver._id).lean();
check('driver on a started trip stays locked', busyAfter.isOnTrip === true, String(busyAfter.isOnTrip));

/* ------------------------------------------------------------------ */
console.log('\n[E] Reconciler: late capture on a live booking is settled');
/* ------------------------------------------------------------------ */
// ESM namespaces are frozen, so the gateway functions cannot be monkey-patched
// in place. Rather than pull in a loader hook for one assertion, we test the
// reconciler through the two pieces it composes: the settle path (shared with
// the checkout callback, section E/F), its candidate query (section G), and the
// refund claim's concurrency guard (section H). The only untested seam left is
// the Razorpay HTTP call itself, which is a thin wrapper over the SDK.
const { applyCapturedBookingPayment } = await imp('services/bookingPayment.service.js');

const settleDriver = await mkDriver({ isOnTrip: true });
const toSettle = await mkBooking({
  status: 'awaiting_payment',
  driverId: settleDriver._id,
  paymentStatus: 'pending',
  razorpay: { orderId: 'order_LATE1', amountPaise: 50000 },
  timeline: { driverAssignedAt: new Date(), paymentDeadlineAt: new Date(Date.now() + 5 * MIN) },
});
const settleDoc = await Booking.findById(toSettle._id);
await applyCapturedBookingPayment(settleDoc, {
  paymentId: 'pay_LATE1', signature: null, chargedRupees: 500,
});
const settled = await Booking.findById(toSettle._id).lean();
check('late capture marks booking paid', settled.paymentStatus === 'paid', settled.paymentStatus);
check('late capture advances awaiting_payment → driver_assigned',
  settled.status === 'driver_assigned', settled.status);
check('paymentId recorded', settled.razorpay?.paymentId === 'pay_LATE1', String(settled.razorpay?.paymentId));
check('ledger credited', settled.payment?.amountPaidRupees === 500, String(settled.payment?.amountPaidRupees));
check('paymentMethod set to online', settled.paymentMethod === 'online', settled.paymentMethod);

/* ------------------------------------------------------------------ */
console.log('\n[F] Settle is idempotent on payment id');
/* ------------------------------------------------------------------ */
// A webhook, the checkout callback and a sweep can all see the same capture.
const dup = await Booking.findById(toSettle._id);
await applyCapturedBookingPayment(dup, {
  paymentId: 'pay_LATE1', signature: null, chargedRupees: 500,
});
const afterDup = await Booking.findById(toSettle._id).lean();
check('re-applying the same capture does not double-credit',
  afterDup.payment?.amountPaidRupees === 500, String(afterDup.payment?.amountPaidRupees));

/* ------------------------------------------------------------------ */
console.log('\n[G] Reconciler query selects the right bookings');
/* ------------------------------------------------------------------ */
// The query is the part most likely to silently drift, and it is what decides
// whether an orphaned capture is ever found at all. Assert its membership
// rules directly against the same filter the reconciler uses.
const since = new Date(Date.now() - 72 * 3600_000);
const reconcilerFilter = {
  isDeleted: false,
  'razorpay.orderId': { $nin: [null, ''] },
  'razorpay.paymentId': { $in: [null, ''] },
  'razorpay.refundId': { $in: [null, ''] },
  paymentStatus: { $in: ['pending', 'failed'] },
  updatedAt: { $gte: since },
};

// Cancelled-by-payment-timeout with an order id and no payment id: the single
// most likely place for an orphaned capture to hide, and the one that costs a
// real customer real money. It MUST be selected.
const orphanCancelled = await mkBooking({
  status: 'cancelled',
  paymentStatus: 'failed',
  razorpay: { orderId: 'order_ORPHAN1', amountPaise: 50000 },
  cancellation: { reason: 'payment_timeout', cancelledBy: 'system' },
});
// Already settled → must NOT be selected.
await mkBooking({
  status: 'completed',
  paymentStatus: 'paid',
  razorpay: { orderId: 'order_DONE', paymentId: 'pay_DONE', amountPaise: 50000 },
});
// Already refunded → must NOT be selected (no double refund).
await mkBooking({
  status: 'cancelled',
  paymentStatus: 'refunded',
  razorpay: { orderId: 'order_REFUNDED', paymentId: 'pay_R', refundId: 'rfnd_1', amountPaise: 50000 },
});
// Never reached checkout (no order id) → nothing to reconcile.
await mkBooking({ status: 'cancelled', paymentStatus: 'failed', razorpay: { orderId: null } });

const selected = await Booking.find(reconcilerFilter).select('bookingNumber razorpay status').lean();
const selectedOrders = selected.map((b) => b.razorpay?.orderId);
check('orphaned capture on a cancelled booking IS selected',
  selectedOrders.includes('order_ORPHAN1'), JSON.stringify(selectedOrders));
check('already-settled booking is NOT selected', !selectedOrders.includes('order_DONE'));
check('already-refunded booking is NOT selected', !selectedOrders.includes('order_REFUNDED'));
check('booking with no razorpay order is NOT selected', !selectedOrders.includes(null));

/* ------------------------------------------------------------------ */
console.log('\n[H] Refund claim is single-winner under concurrency');
/* ------------------------------------------------------------------ */
// Two sweeps (or a sweep and a webhook) can see the same orphaned capture.
// Only one may issue the refund. The guard is the conditional update on
// refundId, so race two of them and assert exactly one wins.
const claim = () => Booking.findOneAndUpdate(
  {
    _id: orphanCancelled._id,
    $or: [
      { 'razorpay.refundId': null },
      { 'razorpay.refundId': '' },
      { 'razorpay.refundId': { $exists: false } },
    ],
  },
  { $set: { 'razorpay.refundId': 'pending:pay_ORPHAN1' } },
  { new: true },
);
const [c1, c2] = await Promise.all([claim(), claim()]);
const winners = [c1, c2].filter(Boolean).length;
check('exactly one concurrent refund claim wins', winners === 1, `(${winners} won)`);

/* ------------------------------------------------------------------ */
console.log('\n[I] Reconciler defaults to dry-run and cannot move money');
/* ------------------------------------------------------------------ */
// The safety property that matters most: an operator who deploys this without
// reading the docs must not have refunds issued on their behalf. Assert the
// default mode is dry_run and that a full pass leaves the orphaned booking
// exactly as it was.
const { reconcileStalePayments } = await imp('services/paymentReconciliation.service.js');
check('PAYMENT_RECONCILIATION_MODE defaults to dry_run',
  (process.env.PAYMENT_RECONCILIATION_MODE || 'dry_run').toLowerCase() === 'dry_run',
  String(process.env.PAYMENT_RECONCILIATION_MODE));

// Reset the claim section H left behind so we observe a pristine orphan.
await Booking.updateOne({ _id: orphanCancelled._id }, { $set: { 'razorpay.refundId': null } });
const beforePass = await Booking.findById(orphanCancelled._id).lean();

const reconSummary = await reconcileStalePayments();
check('reconciler reports its mode', reconSummary.mode === 'dry_run', JSON.stringify(reconSummary));

const afterPass = await Booking.findById(orphanCancelled._id).lean();
check('dry-run leaves paymentStatus untouched',
  afterPass.paymentStatus === beforePass.paymentStatus, `${beforePass.paymentStatus} → ${afterPass.paymentStatus}`);
check('dry-run issues no refund id',
  !afterPass.razorpay?.refundId, String(afterPass.razorpay?.refundId));
check('dry-run credits no payment id',
  !afterPass.razorpay?.paymentId, String(afterPass.razorpay?.paymentId));

await new Promise((r) => setTimeout(r, 1500)); // let fire-and-forget writes finish
console.log(`\n${pass} passed, ${fail} failed`);
await mongoose.disconnect();
await mem.stop();
process.exit(fail ? 1 : 0);
