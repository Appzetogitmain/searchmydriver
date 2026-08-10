import Booking from '../models/booking.model.js';
import Car from '../models/user/car.model.js';
import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import '../models/carType.model.js';
import '../models/carBrand.model.js';
import '../models/carModel.model.js';
import '../models/fuelType.model.js';
import { findAllEligibleOnlineDrivers } from './driverFinder.service.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import {
  adminMarkNoDriversFoundService,
  driverEarningFromFareSnapshot,
} from './booking.service.js';
import { schedulePaymentTimeout } from './bookingPaymentTimeout.service.js';
import {
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
  BOOKING_TYPE,
  PAYMENT_MODE,
  PAYMENT_POLICY,
  DISPATCH,
  DISPATCH_RESPONSE,
  SCHEDULED_BOOKING,
} from '../constants/bookingStatus.js';
import {
  estimateBookingWindow,
  findConflictingDriverIds,
} from './driverConflict.service.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToDriver,
  emitToUser,
  emitToAdmins,
  emitToBooking,
} from '../utils/socketEmitters.js';
import { sendFcmNotification } from '../config/firebase.js';
import { updateDriverTripStatusLive } from './driverLocation.service.js';
import { debitWalletService } from './wallet.service.js';
import { cancelSearchingSchedule } from './bookingSearchingTimeout.service.js';
import { recordPlatformRevenue, PLATFORM_REVENUE_SOURCE } from './platformRevenue.service.js';
import { WALLET_TXN_SOURCE } from '../models/walletTransaction.model.js';
import { resolveOutstationWalletFloorService } from './platform.service.js';

/**
 * Broadcast booking dispatcher.
 *
 * A ride request goes out to EVERY eligible online driver at once, and the
 * first to accept wins. There is no radius cap and no per-wave driver limit:
 *
 *   1. Select all approved, online, idle drivers qualified for the booking's
 *      car type (minus anyone who explicitly rejected it, or whose existing
 *      scheduled work would overlap).
 *   2. Emit BOOKING_OFFERED to all of them, plus an FCM push.
 *   3. Start a refresh timer. First driver to accept wins; everyone else gets
 *      BOOKING_OFFER_WITHDRAWN. If the timer fires with no accept, the request
 *      is re-broadcast so drivers who have since come online also see it.
 *
 *   ┌─ dispatch ─────────────────────────────────────────────────────────┐
 *   │ 1. Select ALL eligible online drivers                              │
 *   │ 2. Emit BOOKING_OFFERED to every one of them                       │
 *   │ 3. Start the refresh timer                                         │
 *   │ 4. accept → withdraw the others → STOP                             │
 *   │ 5. timer expires → re-broadcast (step 1), picking up new drivers   │
 *   │ 6. nobody online at all → retry every 30s until the 30-minute cap  │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * This replaced a wave model that offered the nearest 5 drivers within an
 * expanding 1–5 km radius. Two things made it drop requests entirely: drivers
 * just past the 5 km ceiling were never offered at all, and any driver who let
 * an offer time out was excluded from every subsequent wave — so once the few
 * nearby drivers had each been offered once, the booking sat in `searching`
 * with nothing on any driver's screen until it expired.
 *
 * Distance is still computed and drivers are sorted nearest-first (the offer
 * card shows it), but it no longer decides who is reachable.
 *
 * Timers live in memory only (`waveTimers`). A server restart drops
 * outstanding timers; the next driver action or admin sweep resumes things.
 */

/** bookingId → setTimeout handle for the active wave's expiry. */
const waveTimers = new Map();

/**
 * Read the per-service `RIDE_BUFFER_MINUTES` override (admin-tunable
 * via the pricing modal). Falls back to the platform-wide constant.
 *
 * Loaded through a dynamic import so the `bookingDispatch ↔
 * bookingScheduled` module pair can stay loosely coupled (the
 * scheduled service already pulls `dispatchNextDriverService` from
 * here, so a top-level static import would be circular).
 */
async function resolveRideBufferMinutes(serviceType) {
  try {
    const { loadScheduledDispatchConfig } = await import(
      './bookingScheduled.service.js'
    );
    const cfg = await loadScheduledDispatchConfig(serviceType);
    const value = Number(cfg?.RIDE_BUFFER_MINUTES);
    if (Number.isFinite(value) && value >= 0) return value;
  } catch (err) {
    console.warn(
      '[dispatch] failed to load RIDE_BUFFER_MINUTES override:',
      err?.message,
    );
  }
  return SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES;
}

function clearWaveTimer(bookingId) {
  const handle = waveTimers.get(String(bookingId));
  if (handle) {
    clearTimeout(handle);
    waveTimers.delete(String(bookingId));
  }
}

/**
 * Drivers who have actively turned this booking down.
 *
 * Only an explicit reject disqualifies a driver. A TIMEOUT must not: under the
 * old wave model every driver who simply didn't tap in 30s was excluded from
 * every later wave, so once the handful of nearby drivers had each been offered
 * once, the booking could never be offered to anyone again — it sat in
 * `searching` with nothing on any driver's screen until the 30-minute cap.
 */
function rejectedDriverIds(booking) {
  return (booking.dispatch?.offers || [])
    .filter((o) => o.response === DISPATCH_RESPONSE.REJECTED)
    .map((o) => String(o.driverId));
}

/** Statuses that legitimately keep a driver's `isOnTrip` flag at `true`. */
const ON_TRIP_LOCK_STATUSES = Object.freeze([
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
]);

/**
 * Self-heal pass that runs at the top of every dispatch wave.
 *
 * Two failure modes the rest of the system can't undo on its own:
 *
 *   1. A driver tapped "Start to pickup" on a SCHEDULED booking days
 *      before pickup. The booking is now wedged at EN_ROUTE far from
 *      its actual start time, and the driver's `isOnTrip` flag is set —
 *      so the radius search excludes them from every new wave for the
 *      entire interval. Walk those bookings back to DRIVER_ASSIGNED so
 *      both sides can resume normal life. (The newer
 *      `markDriverEnRouteService` guard prevents the wedge from
 *      happening again, but legacy data still needs cleaning up.)
 *
 *   2. A driver's `isOnTrip` is `true` but they have NO booking in any
 *      "actively committed" status. Cause is usually a server crash
 *      between the booking-status update and the driver-flag update.
 *      Reset their flag so the dispatcher stops skipping them.
 *
 * Both passes are bounded by Mongo aggregations on indexed fields, so
 * the cost is negligible per wave. Failures are logged and swallowed —
 * dispatch must never block on a self-heal hiccup.
 */
async function selfHealDriverLockState() {
  // 1. Walk back any SCHEDULED booking parked in EN_ROUTE while pickup
  //    is still well beyond the buffer window. We use the platform-wide
  //    default buffer here rather than the per-service override —
  //    accidentally clearing a few minutes early is harmless (the
  //    radius search will still match conflicting drivers via the
  //    overlap window) and keeps the heal cheap (no per-booking
  //    pricing lookup).
  try {
    const wedgeCutoffMs =
      Date.now() + SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES * 60_000;
    const wedged = await Booking.find({
      isDeleted: false,
      bookingType: BOOKING_TYPE.SCHEDULED,
      status: BOOKING_STATUS.EN_ROUTE,
      'hourly.scheduledStartAt': { $gt: new Date(wedgeCutoffMs) },
    })
      .select('_id userId driverId timeline status')
      .lean();
    for (const b of wedged) {
      try {
        await Booking.updateOne(
          { _id: b._id, status: BOOKING_STATUS.EN_ROUTE },
          {
            $set: { status: BOOKING_STATUS.DRIVER_ASSIGNED },
            $unset: { 'timeline.enRouteAt': '' },
          },
        );
        if (b.driverId) {
          await Driver.updateOne(
            { _id: b.driverId },
            { $set: { isOnTrip: false } },
          );
          await updateDriverTripStatusLive(b.driverId, false);
        }
        // Sync any open driver/user/admin UIs so they don't keep
        // rendering the stale EN_ROUTE state until the next refresh.
        const payload = {
          bookingId: String(b._id),
          status: BOOKING_STATUS.DRIVER_ASSIGNED,
        };
        emitToBooking(b._id, S2C_EVENTS.BOOKING_UPDATED, payload);
        if (b.userId) emitToUser(b.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
        if (b.driverId) emitToDriver(b.driverId, S2C_EVENTS.BOOKING_UPDATED, payload);
        emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);
      } catch (err) {
        console.warn(
          '[dispatch] failed to walk back wedged scheduled booking',
          String(b._id),
          err?.message,
        );
      }
    }
  } catch (err) {
    console.warn('[dispatch] self-heal wedge sweep failed:', err?.message);
  }

  // 2. Drivers flagged on-trip with no booking to back the flag. Bulk
  //    reset — the `$nin` is bounded by the live in-progress booking
  //    count which is small in practice.
  try {
    const lockedDriverIds = await Booking.distinct('driverId', {
      isDeleted: false,
      driverId: { $ne: null },
      status: { $in: ON_TRIP_LOCK_STATUSES },
    });
    const staleDrivers = await Driver.find({ isOnTrip: true, _id: { $nin: lockedDriverIds } }).select('_id');
    await Driver.updateMany(
      { isOnTrip: true, _id: { $nin: lockedDriverIds } },
      { $set: { isOnTrip: false } },
    );
    for (const d of staleDrivers) {
      updateDriverTripStatusLive(d._id, false).catch(() => {});
    }
  } catch (err) {
    console.warn('[dispatch] self-heal stale isOnTrip sweep failed:', err?.message);
  }
}

function buildOfferPayload(booking, driver, { customer, car, upcomingScheduledTripStartMs } = {}) {
  return {
    bookingId: String(booking._id),
    bookingNumber: booking.bookingNumber,
    serviceType: booking.serviceType,
    // Drivers need to tell scheduled vs instant requests apart at a
    // glance — the offer modal themes itself off this field.
    bookingType: booking.bookingType,
    paymentMode: booking.paymentMode,
    pickup: booking.pickup,
    dropoff: booking.dropoff || null,
    hourly: booking.hourly || null,
    outstation: booking.outstation || null,
    monthly: booking.monthly || null,
    monthlyRegistrationFee: booking.fareSnapshot?.totalPayable || 2000,
    // Drivers only ever see their own earning — never the customer's
    // gross total or the platform commission. Computed once here so the
    // offer payload, the active-trip view and the trip history all show
    // the same number.
    fare: {
      driverEarning: driverEarningFromFareSnapshot(booking.fareSnapshot),
      offlineTip: booking.offlineTip || 0,
      currency: 'INR',
    },
    customer: customer
      ? {
          name: customer.name || '',
          phone: customer.phone_no ? String(customer.phone_no) : '',
          profilePicture: customer.profilePicture || '',
        }
      : null,
    car: car
      ? {
          _id: String(car._id),
          vehicleNumber: car.vehicleNumber || '',
          transmission: car.transmission || '',
          carTypeName: car.carTypeId?.name || '',
          brandName: car.brandId?.name || '',
          modelName: car.modelId?.name || car.modelName || '',
          fuelTypeName: car.fuelTypeId?.name || '',
        }
      : null,
    offerExpiresAt: booking.dispatch.currentExpiresAt,
    distanceMeters: driver.distanceMeters ?? null,
    waveSize: booking.dispatch.pendingOfferIds.length,
    upcomingScheduledTripStartMs: upcomingScheduledTripStartMs || null,
  };
}

/**
 * Explain a wave that reached nobody.
 *
 * Only the two wallet rules can drop drivers who are otherwise fully
 * eligible (online, approved, idle, right car type, no conflict):
 *
 *   - the cash rule (`wallet.balance >= 0`, applied to every cash booking), and
 *   - the outstation floor (`wallet.balance >= outstationMinWalletBalance`).
 *
 * So when a wave comes back empty we re-run the identical query with BOTH
 * lifted. If drivers appear, wallet state — not driver supply — is what kept
 * the request off every driver's screen, and admins get a one-line alert
 * naming the actual rule. Diagnostics only: never throws, never changes who
 * gets offered.
 */
async function reportEmptyWave(
  booking,
  { lat, lng, carTypeIds, excludeDriverIds, minWalletBalance, requirePositiveWalletBalance },
) {
  const bookingId = String(booking._id);
  const noDriversLog = () =>
    console.warn('[dispatch] booking', bookingId, 'reached 0 drivers — none online/qualified/idle', { carTypeIds });

  // No wallet rule was in play, so supply really is the explanation.
  if (!minWalletBalance && !requirePositiveWalletBalance) {
    noDriversLog();
    return;
  }

  try {
    // Both wallet constraints must come off here. Leaving the cash rule
    // applied (as this used to) makes the diagnosis query return empty for
    // exactly the bookings it is meant to explain, and the log then blames
    // driver supply for a wallet problem.
    const withoutWalletRules = await findAllEligibleOnlineDrivers({
      lat,
      lng,
      carTypeIds,
      excludeDriverIds,
      requirePositiveWalletBalance: false,
      minWalletBalance: null,
      includeOnTrip: booking.serviceType === SERVICE_TYPES.MONTHLY,
    });
    if (!withoutWalletRules.length) {
      noDriversLog();
      return;
    }

    const blockedDriverCount = withoutWalletRules.length;
    const { kind, message } = minWalletBalance
      ? {
          kind: 'dispatch_blocked_by_wallet_floor',
          message:
            `Outstation booking ${booking.bookingNumber} reached 0 drivers: ` +
            `${blockedDriverCount} eligible driver(s) were blocked by the ` +
            `₹${minWalletBalance} outstation wallet minimum. Turn the rule off ` +
            `under Platform Settings → Outstation to dispatch to them anyway.`,
        }
      : {
          kind: 'dispatch_blocked_by_negative_wallet',
          message:
            `Cash booking ${booking.bookingNumber} reached 0 drivers: ` +
            `${blockedDriverCount} eligible driver(s) were blocked because their ` +
            `wallet balance is negative. Cash bookings are only offered to drivers ` +
            `with a balance of ₹0 or more — those drivers must clear their dues ` +
            `before they can receive cash rides.`,
        };

    console.warn('[dispatch]', message);
    emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
      kind,
      severity: 'warn',
      message,
      data: {
        bookingId,
        minWalletBalance,
        requirePositiveWalletBalance: Boolean(requirePositiveWalletBalance),
        blockedDriverCount,
        blockedDriverIds: withoutWalletRules.map((d) => String(d._id)),
      },
    });
  } catch (err) {
    console.warn('[dispatch] empty-wave diagnosis failed:', err?.message);
  }
}

function emitUserDispatchUpdate(booking) {
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, {
    bookingId: String(booking._id),
    status: booking.status,
    dispatch: {
      attempt: booking.dispatch.attemptsCount,
      maxAttempts: booking.dispatch.maxAttempts,
      radiusMeters: booking.dispatch.currentRadiusMeters,
      pendingDriverCount: booking.dispatch.pendingOfferIds.length,
    },
  });
}

function notifyWaveWithdrawn(driverIds, bookingId, reason) {
  for (const id of driverIds) {
    emitToDriver(id, S2C_EVENTS.BOOKING_OFFER_WITHDRAWN, {
      bookingId: String(bookingId),
      reason,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Start (or continue) the dispatch loop for a booking by sending the next
 * wave of offers. Idempotent — calling this multiple times for the same
 * booking is safe; only one wave timer can exist at a time per bookingId.
 *
 * @param {string} bookingId
 */
export async function dispatchNextDriverService(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.status !== BOOKING_STATUS.SEARCHING) {
    return { ok: false, reason: 'not_searching' };
  }

  clearWaveTimer(bookingId);

  // Belt-and-braces cleanup before each wave: walks back any SCHEDULED
  // booking wedged at EN_ROUTE far from pickup and resets stale
  // `Driver.isOnTrip` flags. Without this, a single early-en-route tap
  // (or a crashed cancel path) would silently exclude the driver from
  // every dispatch wave for hours/days.
  await selfHealDriverLockState();

  // 30 minute absolute timeout
  const TIMEOUT_MS = 30 * 60 * 1000;
  if (Date.now() - booking.createdAt.getTime() >= TIMEOUT_MS) {
    return failBookingNoDrivers(bookingId, 'Timeout: No driver found after 30 minutes');
  }

  const [lng, lat] = booking.pickup?.location?.coordinates || [];
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return failBookingNoDrivers(bookingId);
  }

  // Kept only as the fallback figure reported to the customer's searching
  // screen when the broadcast reaches nobody — it is no longer a filter.
  const maxMeters = booking.dispatch?.maxRadiusMeters || DISPATCH.SEARCH_RADIUS_MAX_METERS;

  // Restrict driver matching to the user's chosen car-type so the driver
  // who picks up the offer is qualified to drive that vehicle. We also
  // pull the full car + customer doc here so we can hydrate the offer
  // payload without an extra round-trip per driver in the wave.
  const car = booking.carId
    ? await Car.findById(booking.carId)
        .populate('carTypeId', 'name')
        .populate('brandId', 'name')
        .populate('modelId', 'name')
        .populate('fuelTypeId', 'name')
        .lean()
    : null;
  const customer = await User.findById(booking.userId)
    .select('name phone_no profilePicture')
    .lean();
  const carTypeIds = car?.carTypeId?._id ? [String(car.carTypeId._id)] : [];

  // Resolve the per-service buffer (admin-tunable). Falls back to the
  // platform-wide default when pricing isn't configured for the service.
  const bufferMinutes = await resolveRideBufferMinutes(booking.serviceType);

  // Exclude drivers whose existing accepted/scheduled bookings would
  // overlap this booking's time window once the buffer is applied. Lets
  // a driver who's holding a 6 PM scheduled ride still pick up an
  // 11 AM instant offer — but blocks them from a 5:30 PM ride that
  // would clash with their commitment.
  //
  // The buffer is applied EXACTLY ONCE — on the existing booking side
  // inside `findConflictingDriverIds` — so admins reading the modal as
  // "30 min between rides" get exactly 30 min, not 60.
  const newWindow = estimateBookingWindow(booking);
  const conflictedDriverIds = newWindow
    ? await findConflictingDriverIds({
        window: newWindow,
        excludeBookingId: booking._id,
        bufferMinutes,
      })
    : [];

  const excludeDriverIds = [
    ...rejectedDriverIds(booking),
    ...conflictedDriverIds,
  ];

  // Outstation-only balance floor, and only when admins have it switched
  // on. `null` means "no requirement" — note that passing 0 instead would
  // NOT be equivalent: it becomes a `$gte: 0` filter that still excludes
  // drivers sitting on a negative balance.
  const minWalletBalance =
    booking.serviceType === SERVICE_TYPES.OUTSTATION
      ? await resolveOutstationWalletFloorService()
      : null;

  // Broadcast to every online driver at once — no radius cap, no wave size.
  // The first to accept wins; everyone else gets BOOKING_OFFER_WITHDRAWN.
  const drivers = await findAllEligibleOnlineDrivers({
    lat,
    lng,
    carTypeIds,
    excludeDriverIds,
    requireAvailableForMonthlyRide: false,
    requirePositiveWalletBalance: booking.paymentMethod === 'cash',
    minWalletBalance,
    includeOnTrip: booking.serviceType === SERVICE_TYPES.MONTHLY,
  });

  // Distance is informational now (shown on the driver's offer card), not a
  // filter — report the furthest driver reached so the customer's "searching"
  // screen still has something meaningful to display.
  const radiusMeters = drivers.length
    ? Math.max(...drivers.map((d) => d.distanceMeters || 0))
    : maxMeters;

  console.log('[dispatch] broadcasting booking', String(booking._id), 'to', drivers.length, 'online drivers', { carTypeIds, cash: booking.paymentMethod === 'cash', minWalletBalance });

  if (!drivers.length) {
    // A zero-driver wave used to be indistinguishable from "nobody is
    // online" — the booking just sat in SEARCHING and no driver phone
    // ever rang. A wallet rule is the usual culprit: cash bookings drop
    // every driver sitting on a negative balance, and outstation bookings
    // additionally drop anyone below `outstationMinWalletBalance`. Re-run
    // the same query with both lifted so the log (and the admin alert)
    // names the actual reason instead of leaving it to guesswork.
    await reportEmptyWave(booking, {
      lat,
      lng,
      carTypeIds,
      excludeDriverIds,
      minWalletBalance,
      requirePositiveWalletBalance: booking.paymentMethod === 'cash',
    });

    // If we've exhausted the radius but 30 minutes haven't passed,
    // we wait 30 seconds and try again instead of failing immediately.
    const handle = setTimeout(() => {
      dispatchNextDriverService(bookingId).catch(err => {
        console.error('[dispatch] retry after empty radius failed:', err);
      });
    }, 30000);
    waveTimers.set(String(bookingId), handle);
    return { ok: true, wave: booking.dispatch.attemptsCount, driverIds: [], radiusMeters, message: 'waiting_for_drivers' };
  }

  const expiresAt = new Date(Date.now() + DISPATCH.OFFER_TIMEOUT_SECONDS * 1000);
  booking.dispatch.currentExpiresAt = expiresAt;
  booking.dispatch.currentRadiusMeters = radiusMeters;
  booking.dispatch.attemptsCount = (booking.dispatch.attemptsCount || 0) + 1;
  booking.dispatch.pendingOfferIds = drivers.map((d) => d._id);
  // One offer row per driver per booking. A re-broadcast refreshes the existing
  // row (and un-times-out a driver who missed the previous round) instead of
  // appending a duplicate, so the array can't grow without bound.
  for (const driver of drivers) {
    const existing = booking.dispatch.offers.find(
      (o) => String(o.driverId) === String(driver._id),
    );
    if (existing) {
      existing.offeredAt = new Date();
      existing.response = null;
      existing.respondedAt = null;
      existing.distanceMeters = driver.distanceMeters ?? existing.distanceMeters ?? null;
    } else {
      booking.dispatch.offers.push({
        driverId: driver._id,
        offeredAt: new Date(),
        response: null,
        distanceMeters: driver.distanceMeters ?? null,
      });
    }
  }
  await booking.save();

  // Find any upcoming scheduled trips for these drivers later today
  const upcomingTrips = await Booking.find({
    driverId: { $in: drivers.map((d) => d._id) },
    bookingType: BOOKING_TYPE.SCHEDULED,
    status: { $in: [BOOKING_STATUS.DRIVER_ASSIGNED] },
    'hourly.scheduledStartAt': { $gte: new Date() },
    isDeleted: false,
  }).sort({ 'hourly.scheduledStartAt': 1 }).lean();

  const driverUpcomingTrips = {};
  for (const trip of upcomingTrips) {
    if (!driverUpcomingTrips[trip.driverId]) {
      // Store the earliest upcoming trip for each driver
      driverUpcomingTrips[trip.driverId] = new Date(trip.hourly.scheduledStartAt).getTime();
    }
  }

  // Emit to every driver in the wave in parallel.
  for (const driver of drivers) {
    const upcomingScheduledTripStartMs = driverUpcomingTrips[driver._id] || null;
    emitToDriver(
      driver._id,
      S2C_EVENTS.BOOKING_OFFERED,
      buildOfferPayload(booking, driver, { customer, car, upcomingScheduledTripStartMs }),
    );

    // Push notification to wake the driver's phone
    if (driver.fcmToken) {
      sendFcmNotification(driver.fcmToken, {
        title: 'New Ride Request',
        body: `A passenger requested a ${booking.serviceType} ride near you. Tap to view.`,
        data: { type: 'BOOKING_OFFERED', bookingId: String(booking._id) },
      }).catch(err => console.error('[FCM] Dispatch notification failed:', err?.message));
    }
  }
  emitUserDispatchUpdate(booking);

  // Schedule the wave-level timeout-skip.
  const handle = setTimeout(() => {
    handleWaveTimeoutService(bookingId).catch((err) => {
      console.warn('[dispatch] wave timeout handler failed:', err.message);
    });
  }, DISPATCH.OFFER_TIMEOUT_SECONDS * 1000);
  waveTimers.set(String(bookingId), handle);

  return {
    ok: true,
    wave: booking.dispatch.attemptsCount,
    driverIds: drivers.map((d) => String(d._id)),
    radiusMeters,
  };
}

async function failBookingNoDrivers(bookingId, customMessage) {
  clearWaveTimer(bookingId);

  // Scheduled bookings get a "retry, then escalate" loop instead of an
  // immediate dead-end. We park the booking back in PENDING_ASSIGNMENT
  // and queue another assign attempt RETRY_DELAY_MINUTES later — until
  // we run out of runway before the emergency-pool cutoff, at which
  // point the booking is parked in the pool for an admin to take.
  const peek = await Booking.findById(bookingId).select(
    'bookingType bookingNumber userId',
  );
  const retryableBooking =
    peek?.bookingType === BOOKING_TYPE.SCHEDULED ||
    peek?.bookingType === BOOKING_TYPE.OUTSTATION;
  if (retryableBooking) {
    const { scheduleAssignmentRetryOrEscalate } = await import(
      './bookingScheduled.service.js'
    );
    const outcome = await scheduleAssignmentRetryOrEscalate(bookingId);
    if (outcome.retried) {
      emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
        kind: 'scheduled_dispatch_retry',
        severity: 'info',
        message:
          `Scheduled booking ${peek.bookingNumber} found no drivers — ` +
          `retry #${outcome.attempt} queued.`,
        data: { bookingId: String(bookingId), attempt: outcome.attempt },
      });
      return { ok: false, reason: 'scheduled_retry_queued', attempt: outcome.attempt };
    }
    if (outcome.escalated) {
      emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
        kind: 'emergency_pool_entered',
        severity: 'warn',
        message: `Scheduled booking ${peek.bookingNumber} needs manual driver assignment`,
        data: { bookingId: String(bookingId) },
      });
      return { ok: false, reason: 'in_emergency_pool' };
    }
    // Unknown failure path (e.g. booking deleted out from under us);
    // fall through to the legacy terminator so the caller still sees a
    // settled status.
  }

  // Instant bookings (or scheduled bookings that somehow escaped the
  // branch above) follow the legacy path: NO_DRIVERS_FOUND + refund.
  const booking = await adminMarkNoDriversFoundService(bookingId);
  const escalated = booking.status === BOOKING_STATUS.IN_EMERGENCY_POOL;
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, {
    bookingId: String(booking._id),
    status: booking.status,
  });
  emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
    kind: escalated ? 'emergency_pool_entered' : 'no_drivers_found',
    severity: 'warn',
    message: customMessage || (escalated
      ? `Scheduled booking ${booking.bookingNumber} needs manual driver assignment`
      : `Booking ${booking.bookingNumber} could not find a driver`),
    data: { bookingId: String(booking._id) },
  });
  return {
    ok: false,
    reason: escalated ? 'in_emergency_pool' : 'no_drivers_found',
  };
}

/**
 * Decide whether a freshly-accepted booking should immediately mark
 * the driver as `isOnTrip: true`. Returns `true` for:
 *
 *   - Instant bookings (driver is committed right now).
 *   - Scheduled bookings whose pickup is inside one buffer window of
 *     now (e.g. ≤ 30 min away by default) — at that point we don't
 *     want to risk offering them another ride.
 *
 * Returns `false` for far-future scheduled bookings: the driver
 * stays dispatchable for non-overlapping work in the meantime and
 * the overlap-check in `dispatchNextDriverService` protects the
 * accepted booking.
 */
async function shouldImmediatelyLockDriver(booking) {
  if (!booking) return true;
  if (booking.bookingType !== BOOKING_TYPE.SCHEDULED) return true;

  const scheduledAt =
    booking?.hourly?.scheduledStartAt || booking?.outstation?.pickupAt || booking?.outstation?.startDate;
  if (!scheduledAt) return true;
  const startMs = new Date(scheduledAt).getTime();
  if (!Number.isFinite(startMs)) return true;

  const bufferMinutes = await resolveRideBufferMinutes(booking.serviceType);
  const lockLeadMs = Math.max(0, Number(bufferMinutes) || 0) * 60_000;
  return startMs - Date.now() <= lockLeadMs;
}

/** Driver accepts a live offer for a booking. First driver in the wave wins. */
export async function acceptBookingService(bookingId, driverId) {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.status !== BOOKING_STATUS.SEARCHING) {
    return { ok: false, reason: 'no_longer_searching' };
  }
  const pending = (booking.dispatch?.pendingOfferIds || []).map(String);
  if (!pending.includes(String(driverId))) {
    return { ok: false, reason: 'not_in_active_wave' };
  }

  clearWaveTimer(bookingId);
  cancelSearchingSchedule(bookingId);

  // Mark this driver's offer as accepted.
  const offer = booking.dispatch.offers.find(
    (o) => String(o.driverId) === String(driverId) && o.response == null,
  );
  if (offer) {
    offer.response = DISPATCH_RESPONSE.ACCEPTED;
    offer.respondedAt = new Date();
  }

  // Withdraw all the other drivers in this wave — they lost the race.
  const losers = pending.filter((id) => String(id) !== String(driverId));
  for (const loserId of losers) {
    const otherOffer = booking.dispatch.offers.find(
      (o) => String(o.driverId) === String(loserId) && o.response == null,
    );
    if (otherOffer) {
      otherOffer.response = DISPATCH_RESPONSE.CANCELLED;
      otherOffer.respondedAt = new Date();
    }
  }

  booking.dispatch.pendingOfferIds = [];
  booking.dispatch.currentExpiresAt = null;
  booking.driverId = driverId;
  const acceptedAt = new Date();
  booking.timeline.driverAssignedAt = acceptedAt;

  // When a previous driver cancelled a *paid* booking the dispatcher
  // re-queues it as SEARCHING with paymentStatus still PAID. In that
  // case we skip the AWAITING_PAYMENT phase entirely and the new
  // driver gets a fully-paid booking they can start immediately. The
  // booking's `cancellation` block (set by redispatchAfterDriverCancel)
  // is cleared so the UI doesn't keep showing the old popup.
  const alreadyPaid =
    booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID;
  const isCash = booking.paymentMethod === 'cash' || booking.paymentMode === PAYMENT_MODE.POST_RIDE;

  if (alreadyPaid || isCash) {
    booking.status = BOOKING_STATUS.DRIVER_ASSIGNED;
    booking.timeline.paymentDeadlineAt = null;
    booking.cancellation = null;
    if (isCash) {
      // Cash bookings do not require an upfront customer payment
      // before the driver starts heading to pickup.
      booking.paymentMode = PAYMENT_MODE.POST_RIDE;
      booking.paymentStatus = BOOKING_PAYMENT_STATUS.NOT_DUE_YET;
      
      if (booking.serviceType === SERVICE_TYPES.MONTHLY) {
        // For monthly rides, the platform fee is collected in cash by the driver.
        // We must debit the driver's wallet immediately upon acceptance.
        const feeAmount = booking.fareSnapshot?.totalPayable || 2000;
        try {
          await debitWalletService({
            userId: driverId,
            userType: 'Driver',
            amount: feeAmount,
            source: WALLET_TXN_SOURCE.MONTHLY_REGISTRATION_DEDUCTION,
            refId: booking._id,
            allowNegative: true,
          });
          // Record revenue since it was successfully debited
          recordPlatformRevenue({
            source: PLATFORM_REVENUE_SOURCE.MONTHLY_REGISTRATION,
            amountRupees: feeAmount,
            bookingId: booking._id,
            bookingNumber: booking.bookingNumber || '',
            serviceType: booking.serviceType,
            userId: booking.userId,
          }).catch(e => console.warn('[dispatch] monthly cash revenue log failed', e.message));
        } catch (err) {
          console.error('[dispatch] monthly cash wallet debit failed', err.message);
        }
      }
    }
  } else {
    // Standard "first acceptance" flow: lock in PRE_RIDE, set the 60s
    // payment deadline, and arm the auto-cancel timer.
    booking.timeline.paymentDeadlineAt = new Date(
      acceptedAt.getTime() + PAYMENT_POLICY.PAYMENT_DEADLINE_SECONDS * 1000,
    );
    booking.status = BOOKING_STATUS.AWAITING_PAYMENT;
    booking.paymentMode = PAYMENT_MODE.PRE_RIDE;
    booking.paymentStatus = BOOKING_PAYMENT_STATUS.PENDING;
  }
  await booking.save();

  // Mark the driver as on-trip so future dispatches skip them. Other
  // drivers in the lost wave stay available.
  //
  // For SCHEDULED bookings whose pickup is more than the configured
  // buffer away we leave `isOnTrip` alone — the driver can still be
  // offered other non-overlapping rides in the meantime, and the
  // conflict-overlap check in `dispatchNextDriverService` prevents
  // anything from clashing with the upcoming pickup. The flag flips
  // on automatically when the driver hits "I'm on the way"
  // (`markDriverEnRouteService`), which is the moment they're
  // physically committed to that pickup.
  const shouldLockDriver = await shouldImmediatelyLockDriver(booking);
  if (shouldLockDriver) {
    await Driver.updateOne({ _id: driverId }, { $set: { isOnTrip: true } });
  }

  // Kick off the auto-cancel timer only for the standard (unpaid) flow.
  // Re-dispatched bookings are already paid → no payment timer needed.
  if (!alreadyPaid) {
    schedulePaymentTimeout(booking._id);
  }

  // For scheduled bookings, NOW is the right moment to queue the
  // pre-pickup reminder toasts — we have a driver, so the reminders
  // will be useful to both sides. Fire-and-forget (queue is best-effort).
  if (booking.bookingType === BOOKING_TYPE.SCHEDULED) {
    import('./bookingScheduled.service.js')
      .then(({ enqueueRemindersAfterAssignment }) =>
        enqueueRemindersAfterAssignment(booking),
      )
      .catch((err) =>
        console.warn(
          '[bookingDispatch] reminder enqueue failed for',
          String(booking._id),
          err?.message,
        ),
      );
  }

  // Notify the losing drivers that the offer is gone.
  notifyWaveWithdrawn(losers, booking._id, 'awarded_to_other_driver');

  // We split the payload by audience so the driver never sees the
  // customer's `paymentMode`/`paymentStatus`. They only need to know the
  // booking is parked in `awaiting_payment` so their UI can render the
  // "user is making payment" overlay.
  const userPayload = {
    bookingId: String(booking._id),
    status: booking.status,
    paymentMode: booking.paymentMode,
    paymentStatus: booking.paymentStatus,
    driverId: String(driverId),
    timeline: booking.timeline?.toObject?.() || booking.timeline,
    // When this is a re-dispatched (already-paid) booking we wipe the
    // old cancellation block so the FE doesn't keep flashing the
    // "driver bailed" popup.
    cancellation: booking.cancellation
      ? booking.cancellation?.toObject?.() || booking.cancellation
      : null,
  };
  const driverPayload = {
    bookingId: String(booking._id),
    status: booking.status,
    driverId: String(driverId),
    timeline: booking.timeline?.toObject?.() || booking.timeline,
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, userPayload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToDriver(driverId, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, userPayload);

  return { ok: true, status: booking.status };
}

/**
 * Driver rejects their pending offer. Removes them from the active wave; if
 * the wave is now empty, immediately dispatches the next one.
 */
export async function rejectBookingService(bookingId, driverId) {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.status !== BOOKING_STATUS.SEARCHING) {
    return { ok: false, reason: 'not_searching' };
  }
  const pending = (booking.dispatch?.pendingOfferIds || []).map(String);
  if (!pending.includes(String(driverId))) {
    return { ok: false, reason: 'not_in_active_wave' };
  }

  const offer = booking.dispatch.offers.find(
    (o) => String(o.driverId) === String(driverId) && o.response == null,
  );
  if (offer) {
    offer.response = DISPATCH_RESPONSE.REJECTED;
    offer.respondedAt = new Date();
  }
  booking.dispatch.pendingOfferIds = booking.dispatch.pendingOfferIds.filter(
    (id) => String(id) !== String(driverId),
  );
  const stillPending = booking.dispatch.pendingOfferIds.length;
  if (stillPending === 0) {
    booking.dispatch.currentExpiresAt = null;
  }
  await booking.save();

  emitToDriver(driverId, S2C_EVENTS.BOOKING_OFFER_WITHDRAWN, {
    bookingId: String(booking._id),
    reason: 'rejected_by_driver',
  });

  if (stillPending === 0) {
    // Everyone in the wave bailed — move on with an expanded radius.
    clearWaveTimer(bookingId);
    return dispatchNextDriverService(bookingId);
  }

  // Wave still has other drivers; keep waiting for them.
  return { ok: true, pendingDriverCount: stillPending };
}

/** Record a TIMEOUT response for drivers who dropped out of the broadcast. */
async function markOffersTimedOut(bookingId, driverIds) {
  if (!driverIds.length) return;
  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  const ids = new Set(driverIds.map(String));
  for (const offer of booking.dispatch?.offers || []) {
    if (ids.has(String(offer.driverId)) && offer.response == null) {
      offer.response = DISPATCH_RESPONSE.TIMEOUT;
      offer.respondedAt = new Date();
    }
  }
  await booking.save();
}

/**
 * Periodic re-broadcast while a booking is still searching.
 *
 * Under the broadcast model this is a *refresh*, not a hand-off to the next
 * wave: the request goes back out to every online driver, so a driver who was
 * mid-fare or offline last round now sees it. Drivers still in the broadcast
 * keep their card on screen — only those who dropped out of it (went offline,
 * started a trip, took another booking) get BOOKING_OFFER_WITHDRAWN. Without
 * that distinction every driver's offer modal would blink out and back once a
 * cycle.
 */
export async function handleWaveTimeoutService(bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.SEARCHING) return;

  const previousPending = (booking.dispatch?.pendingOfferIds || []).map(String);
  if (previousPending.length === 0) return;

  const result = await dispatchNextDriverService(bookingId);
  const stillOffered = new Set((result?.driverIds || []).map(String));

  const dropped = previousPending.filter((id) => !stillOffered.has(id));
  if (dropped.length) {
    await markOffersTimedOut(bookingId, dropped);
    notifyWaveWithdrawn(dropped, bookingId, 'timeout');
  }
}

/** Backwards-compat alias for legacy callers. */
export const handleOfferTimeoutService = handleWaveTimeoutService;

/**
 * Withdraw every in-flight offer for a booking (used by user-cancel and
 * post-payment dispatch transitions).
 */
export async function withdrawCurrentOfferService(bookingId, reason = 'cancelled') {
  clearWaveTimer(bookingId);
  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  const pending = (booking.dispatch?.pendingOfferIds || []).map(String);
  if (!pending.length) return;

  for (const driverId of pending) {
    const offer = booking.dispatch.offers.find(
      (o) => String(o.driverId) === String(driverId) && o.response == null,
    );
    if (offer) {
      offer.response = DISPATCH_RESPONSE.CANCELLED;
      offer.respondedAt = new Date();
    }
  }
  booking.dispatch.pendingOfferIds = [];
  booking.dispatch.currentExpiresAt = null;
  await booking.save();

  notifyWaveWithdrawn(pending, bookingId, reason);
}

export async function getDriverPendingOffersService(driverId) {
  const driver = await Driver.findById(driverId).lean();
  if (!driver) return [];

  const activeBookings = await Booking.find({
    status: { $in: [BOOKING_STATUS.SEARCHING, BOOKING_STATUS.PENDING_ASSIGNMENT] },
    'dispatch.pendingOfferIds': driverId
  }).populate('userId', 'name phone rating')
    .populate('carId', 'brand model year registrationNumber color')
    .lean();

  const offers = [];
  for (const booking of activeBookings) {
    // If the wave expired, do not include it. The wave timer will clear it soon.
    if (booking.dispatch?.currentExpiresAt && new Date(booking.dispatch.currentExpiresAt) < new Date()) {
      continue;
    }

    const offerObj = booking.dispatch?.offers?.find(
      (o) => String(o.driverId) === String(driverId) && o.response == null
    );

    let customer = booking.userId;
    let car = booking.carId;

    if (!customer) {
      customer = await User.findById(booking.userId).lean();
    }
    if (!car && booking.carId) {
      car = await Car.findById(booking.carId).lean();
    }

    const payload = buildOfferPayload(booking, driver, { customer, car });
    
    // Add the distance meters computed during dispatch
    if (offerObj && offerObj.distanceMeters) {
      payload.distanceMeters = offerObj.distanceMeters;
    }

    offers.push(payload);
  }

  return offers;
}
