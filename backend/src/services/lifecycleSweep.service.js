import Booking from '../models/booking.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import {
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
} from '../constants/bookingStatus.js';
import { handlePaymentTimeoutService } from './bookingPaymentTimeout.service.js';
import { resumeSearchingScheduleIfNeeded } from './bookingSearchingTimeout.service.js';
import { resumeNoShowScheduleIfNeeded } from './bookingNoShowTimeout.service.js';
import { updateDriverTripStatusLive } from './driverLocation.service.js';
import { reconcileStalePayments } from './paymentReconciliation.service.js';

/**
 * Booking-lifecycle sweep — the durable half of every deadline in the system.
 *
 * Four separate services park their deadlines in a bare in-process
 * `setTimeout` Map: the 60-second payment deadline, the 30-minute search cap,
 * the no-show prompt chain, and the dispatcher's wave timer. Those timers are
 * the right mechanism for sub-second precision, but they are process-local:
 * a restart, a crash, or a redeploy drops every one of them on the floor.
 *
 * The existing comments assume "the next request that touches the booking will
 * trip the deadline check" — and for the searching and no-show chains that is
 * broadly true, because the customer and driver apps poll the booking while
 * they are open. But nothing polls on its own, and the payment deadline has no
 * resume path at all. That produces a specific, permanent wedge:
 *
 *   1. Driver accepts; booking → AWAITING_PAYMENT; driver gets isOnTrip=true.
 *   2. The API restarts inside the 60-second payment window.
 *   3. The timer is gone, so the booking is never cancelled.
 *   4. The driver is never released, because AWAITING_PAYMENT is deliberately
 *      one of the dispatcher's ON_TRIP_LOCK_STATUSES — so the self-heal pass
 *      sees the flag as legitimate and leaves it alone.
 *
 * The driver is now invisible to dispatch forever, with no way back short of
 * manual intervention. This sweep closes that hole: timers stay the fast path,
 * and a bounded DB pass every `SWEEP_INTERVAL_MS` catches anything they missed.
 *
 * Design constraints:
 *   - **Bounded.** Every query is indexed and capped, so a backlog degrades
 *     throughput rather than stalling the event loop.
 *   - **Idempotent.** Every handler it calls already no-ops when the booking
 *     has moved on, so overlapping with a live timer is harmless.
 *   - **No Redis.** Unlike a BullMQ migration this works wherever Mongo does,
 *     which matters because `REDIS_URL` is optional throughout this codebase.
 *   - **Non-overlapping.** A pass that overruns the interval skips the next
 *     tick instead of stacking.
 */

const SWEEP_INTERVAL_MS = Number(process.env.LIFECYCLE_SWEEP_INTERVAL_MS) || 30_000;

/**
 * Payment reconciliation hits the Razorpay API, so it runs on a slower
 * cadence than the local deadline checks — every 10th pass (5 min by default).
 */
const RECONCILE_EVERY_N_PASSES = 10;

/** Cap per query so one pathological backlog can't dominate a pass. */
const BATCH_LIMIT = 100;

let intervalHandle = null;
let running = false;
let passCount = 0;

/**
 * Cancel bookings whose payment deadline elapsed while no timer was armed.
 *
 * `handlePaymentTimeoutService` is the same handler the in-process timer
 * calls; it re-checks the deadline itself and re-arms rather than cancelling
 * if time is somehow left, so handing it an already-handled booking is safe.
 */
async function sweepPaymentDeadlines() {
  const overdue = await Booking.find({
    isDeleted: false,
    status: BOOKING_STATUS.AWAITING_PAYMENT,
    paymentStatus: { $ne: BOOKING_PAYMENT_STATUS.PAID },
    'timeline.paymentDeadlineAt': { $ne: null, $lte: new Date() },
  })
    .select('_id')
    .limit(BATCH_LIMIT)
    .lean();

  let handled = 0;
  for (const { _id } of overdue) {
    try {
      await handlePaymentTimeoutService(_id);
      handled += 1;
    } catch (err) {
      console.warn('[sweep] payment timeout failed for', String(_id), '-', err?.message);
    }
  }
  return handled;
}

/**
 * Re-arm the search cap for bookings still hunting for a driver.
 *
 * `resumeSearchingScheduleIfNeeded` returns early when a timer is already
 * tracked, so steady-state cost is one indexed query plus a Map lookup per
 * searching booking. Overdue bookings get a zero-delay timer and fire at once.
 */
async function sweepSearchingTimeouts() {
  const searching = await Booking.find({
    isDeleted: false,
    status: BOOKING_STATUS.SEARCHING,
  })
    .select('_id status createdAt')
    .limit(BATCH_LIMIT)
    .lean();

  let resumed = 0;
  for (const booking of searching) {
    try {
      await resumeSearchingScheduleIfNeeded(booking);
      resumed += 1;
    } catch (err) {
      console.warn('[sweep] searching resume failed for', String(booking._id), '-', err?.message);
    }
  }
  return resumed;
}

/** Re-arm the no-show prompt chain for drivers waiting at pickup. */
async function sweepNoShowTimeouts() {
  const arrived = await Booking.find({
    isDeleted: false,
    status: BOOKING_STATUS.ARRIVED,
  })
    .select('_id status serviceType noShow timeline')
    .limit(BATCH_LIMIT)
    .lean();

  let resumed = 0;
  for (const booking of arrived) {
    try {
      await resumeNoShowScheduleIfNeeded(booking);
      resumed += 1;
    } catch (err) {
      console.warn('[sweep] no-show resume failed for', String(booking._id), '-', err?.message);
    }
  }
  return resumed;
}

/**
 * Release drivers flagged on-trip with no booking to justify it.
 *
 * The dispatcher runs an equivalent pass, but only at the top of a dispatch
 * wave — so a driver stranded by a crash stays stranded for as long as no new
 * booking happens to come in, which is precisely the quiet period when a stuck
 * driver is most costly. Running it here makes the recovery time bounded by
 * the sweep interval instead of by traffic.
 */
async function sweepStaleDriverLocks() {
  const lockedDriverIds = await Booking.distinct('driverId', {
    isDeleted: false,
    driverId: { $ne: null },
    status: {
      $in: [
        BOOKING_STATUS.DRIVER_ASSIGNED,
        BOOKING_STATUS.AWAITING_PAYMENT,
        BOOKING_STATUS.EN_ROUTE,
        BOOKING_STATUS.ARRIVED,
        BOOKING_STATUS.STARTED,
      ],
    },
  });

  const stale = await Driver.find({ isOnTrip: true, _id: { $nin: lockedDriverIds } })
    .select('_id')
    .limit(BATCH_LIMIT)
    .lean();
  if (!stale.length) return 0;

  await Driver.updateMany(
    { isOnTrip: true, _id: { $in: stale.map((d) => d._id) } },
    { $set: { isOnTrip: false } },
  );
  for (const d of stale) {
    updateDriverTripStatusLive(d._id, false).catch(() => {});
  }

  console.warn('[sweep] released', stale.length, 'driver(s) stuck with isOnTrip and no live booking');
  return stale.length;
}

/**
 * Run one full pass. Each stage is independently guarded so a failure in one
 * does not prevent the others from running — the stages are unrelated and a
 * payment-gateway outage must not stop drivers being unstuck.
 */
export async function runLifecycleSweep({ includeReconciliation = true } = {}) {
  const results = {};
  const stages = [
    ['paymentDeadlines', sweepPaymentDeadlines],
    ['searchingTimeouts', sweepSearchingTimeouts],
    ['noShowTimeouts', sweepNoShowTimeouts],
    ['staleDriverLocks', sweepStaleDriverLocks],
  ];

  for (const [name, fn] of stages) {
    try {
      results[name] = await fn();
    } catch (err) {
      results[name] = 'error';
      console.warn(`[sweep] stage ${name} failed:`, err?.message);
    }
  }

  if (includeReconciliation) {
    try {
      results.reconciliation = await reconcileStalePayments();
    } catch (err) {
      results.reconciliation = 'error';
      console.warn('[sweep] reconciliation failed:', err?.message);
    }
  }

  return results;
}

/**
 * Start the periodic sweep. Called once from the server bootstrap, after the
 * DB is connected.
 *
 * The first pass runs immediately rather than after one interval: a restart is
 * exactly when the backlog of dropped timers is largest, so waiting 30 seconds
 * to clean it up is the wrong default.
 */
export function startLifecycleSweep() {
  if (intervalHandle) return;

  const tick = async () => {
    // A pass that overruns the interval must not stack with the next one —
    // the stages are idempotent but duplicated work is pure waste.
    if (running) return;
    running = true;
    passCount += 1;
    const includeReconciliation = passCount % RECONCILE_EVERY_N_PASSES === 1;
    try {
      await runLifecycleSweep({ includeReconciliation });
    } catch (err) {
      console.warn('[sweep] pass failed:', err?.message);
    } finally {
      running = false;
    }
  };

  // Boot-time catch-up pass, including reconciliation (passCount becomes 1).
  tick().catch(() => {});

  intervalHandle = setInterval(tick, SWEEP_INTERVAL_MS);
  // Don't hold the process open on shutdown.
  intervalHandle.unref?.();

  console.log(
    `✅ Lifecycle sweep started (every ${Math.round(SWEEP_INTERVAL_MS / 1000)}s, ` +
      `payment reconciliation every ${Math.round((SWEEP_INTERVAL_MS * RECONCILE_EVERY_N_PASSES) / 1000)}s)`,
  );
}

export function stopLifecycleSweep() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
