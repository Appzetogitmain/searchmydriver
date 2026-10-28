import Booking from '../models/booking.model.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';

/**
 * Server-measured ride distance.
 *
 * One-way hourly rides bill a per-km charge on top of time. That charge used
 * to be computed from `hourly.estimatedKm` — the distance quoted when the
 * booking was made — because the `actualKm` the fare engine accepts is never
 * sent by the apps (all four call sites in `DriverActiveTripPage` invoke
 * `completeTrip()` / `requestPayment()` with no arguments, so it defaults to
 * 0 and the fare falls back to the estimate).
 *
 * Taking it from the client instead would be worse than useless: `actualKm`
 * flows directly into the per-km charge and therefore into the driver's own
 * earnings, so a driver's app could inflate its own payout. This module is
 * the trusted alternative — distance is summed on the server from the GPS
 * stream the driver is already emitting.
 *
 * Accuracy, stated honestly: `useDriverLocation` throttles emits to one every
 * 5 seconds, so we are summing chords between samples roughly 55 m apart at
 * city speed. That slightly *under*-reads distance on bends, which errs in the
 * customer's favour, and it is not an odometer. Treat it as a fair measure,
 * not a legal one.
 */

/** Below this, a "move" is GPS jitter from a parked car, not travel. */
const MIN_LEG_METERS = 20;

/**
 * Above this, the fix is a teleport — a signal returning after a tunnel or a
 * backgrounded app — and the straight line through it is not a road distance.
 * Skipped rather than billed, and the cursor moves on.
 */
const MAX_LEG_METERS = 2000;

/** Ignore fixes this imprecise; they manufacture phantom movement. */
const MAX_ACCURACY_METERS = 100;

const EARTH_RADIUS_M = 6_371_000;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in metres between two {lat,lng} points. */
export function haversineMeters(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Decide what a single GPS leg contributes.
 *
 * Pulled out as a pure function so the filtering rules can be tested without a
 * database: these thresholds are the whole difference between a fair fare and
 * a fare inflated by a car idling at a traffic light.
 *
 * @returns {{ meters:number, advanceCursor:boolean, reason?:string }}
 */
export function evaluateLeg(previous, next, accuracy) {
  if (Number.isFinite(accuracy) && accuracy > MAX_ACCURACY_METERS) {
    return { meters: 0, advanceCursor: false, reason: 'inaccurate_fix' };
  }
  if (!previous) {
    // First fix of the ride: nothing to measure from, just set the cursor.
    return { meters: 0, advanceCursor: true, reason: 'first_fix' };
  }

  const meters = haversineMeters(previous, next);
  if (!Number.isFinite(meters)) {
    return { meters: 0, advanceCursor: false, reason: 'not_finite' };
  }
  if (meters < MIN_LEG_METERS) {
    // Stationary. Hold the cursor so slow genuine movement still accrues
    // across several samples instead of being discarded one jitter at a time.
    return { meters: 0, advanceCursor: false, reason: 'below_jitter_floor' };
  }
  if (meters > MAX_LEG_METERS) {
    return { meters: 0, advanceCursor: true, reason: 'implausible_jump' };
  }
  return { meters, advanceCursor: true };
}

/**
 * Fold one GPS fix into the driver's in-progress ride, if they have one.
 *
 * Called from `recordDriverLocation`, which every driver ping already flows
 * through. Returns `null` when the driver is not on a started trip, which is
 * the overwhelmingly common case and costs one indexed query.
 *
 * Never throws: a distance-metering hiccup must not break location streaming,
 * which the live-tracking map depends on.
 */
export async function accumulateTripDistance(driverId, { lat, lng, accuracy } = {}) {
  if (!driverId || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  try {
    // `tripEndedAt` is the freeze point. The fare is computed to the moment
    // the customer ended the trip, and the booking stays STARTED until the
    // driver confirms payment — so without this the car's drive away from the
    // drop would keep adding billable km after the fare was settled.
    const booking = await Booking.findOne({
      driverId,
      status: BOOKING_STATUS.STARTED,
      'timeline.tripEndedAt': null,
      isDeleted: false,
    }).select('trip timeline');

    if (!booking) return null;

    const prevCoords = booking.trip?.lastPingCoords;
    const previous =
      Array.isArray(prevCoords) && prevCoords.length === 2
        ? { lng: prevCoords[0], lat: prevCoords[1] }
        : null;

    const { meters, advanceCursor, reason } = evaluateLeg(previous, { lat, lng }, accuracy);
    if (!advanceCursor && meters === 0) {
      return { bookingId: String(booking._id), addedMeters: 0, reason };
    }

    const update = {
      $set: { 'trip.lastPingAt': new Date(), 'trip.lastPingCoords': [lng, lat] },
    };
    if (meters > 0) {
      update.$inc = {
        'trip.actualKm': meters / 1000,
        'trip.pingCount': 1,
      };
    }

    // Conditional on the same freeze point so a trip that ends between the
    // read above and this write doesn't get distance appended after its fare
    // was already computed.
    await Booking.updateOne(
      { _id: booking._id, status: BOOKING_STATUS.STARTED, 'timeline.tripEndedAt': null },
      update,
    );

    return { bookingId: String(booking._id), addedMeters: meters, reason };
  } catch (err) {
    console.warn('[tripDistance] accumulate failed:', err?.message);
    return null;
  }
}

/**
 * Zero the meter at the moment the ride actually begins.
 *
 * Without this the cursor still holds the driver's position from the drive to
 * pickup, and the first leg of the ride would be billed as the straight line
 * from wherever they were when they last pinged.
 */
export async function resetTripDistance(bookingId, startCoords = null) {
  const set = {
    'trip.actualKm': 0,
    'trip.pingCount': 0,
    'trip.lastPingAt': startCoords ? new Date() : null,
  };
  if (startCoords && Number.isFinite(startCoords.lat) && Number.isFinite(startCoords.lng)) {
    set['trip.lastPingCoords'] = [startCoords.lng, startCoords.lat];
  } else {
    set['trip.lastPingCoords'] = undefined;
  }
  await Booking.updateOne({ _id: bookingId }, { $set: set });
}

/** Metered distance in km, rounded to 2dp. */
export function tripKm(booking) {
  const km = Number(booking?.trip?.actualKm) || 0;
  return Math.round((km + Number.EPSILON) * 100) / 100;
}
