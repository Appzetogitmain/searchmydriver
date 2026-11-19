import mongoose from 'mongoose';
import Booking from '../models/booking.model.js';
import ServicePricing from '../models/servicePricing.model.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToDriver,
  emitToBooking,
  emitNotification,
} from '../utils/socketEmitters.js';
import { ApiError } from '../utils/apiError.js';

/**
 * No-show reminder service.
 *
 * In-process scheduler for the "are you coming?" reminders shown to the
 * customer while the driver waits at pickup (status ARRIVED).
 *
 *   - First reminder fires after free-wait + `noShowPromptMinutes`.
 *   - Further reminders every `noShowPromptMinutes`, up to
 *     `maxNoShowPrompts + 1` in total, then they stop.
 *
 * HARD RULE: reminders never change the booking status. A booking in
 * ARRIVED only moves to STARTED when the driver enters the correct
 * ride-start OTP (`startTripService`), or to CANCELLED when the driver,
 * customer or an admin cancels it explicitly. There is no auto-start,
 * auto-complete or auto-cancel from this service.
 *
 * If the customer responds:
 *   - "on_my_way"  → reset the reminder window from now.
 *   - "not_coming" → stop reminders and notify the driver. The booking
 *                    stays ARRIVED.
 *
 * Server restart drops timers — bookings stuck mid-prompt will resume
 * on the next request that touches them via `resumeNoShowSchedule()`
 * (called from the booking fetch helpers). This is the same
 * trade-off the payment-timeout service makes.
 */

/** bookingId → { phase, handle } */
const noShowTimers = new Map();

function key(id) {
  return String(id);
}

/** Stop any pending no-show timer for this booking. Safe to call twice. */
export function cancelNoShowSchedule(bookingId) {
  const k = key(bookingId);
  const entry = noShowTimers.get(k);
  if (entry?.handle) clearTimeout(entry.handle);
  noShowTimers.delete(k);
}

/**
 * Schedule PHASE A (the "are you coming?" prompt) for a booking that
 * just hit ARRIVED. Idempotent — replaces any pending timer.
 *
 * `arrivedAt` lets the caller pass the timestamp the booking actually
 * arrived (in case the schedule is being resumed mid-cycle), so we
 * fire at the right wall-clock instant rather than always 30 min
 * from "now".
 */
export async function schedulePromptTimer(bookingId, arrivedAt = new Date()) {
  cancelNoShowSchedule(bookingId);

  const booking = await Booking.findById(bookingId)
    .select('serviceType status noShow')
    .lean();
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.ARRIVED) return;

  const policy = await loadWaitingPolicy(booking.serviceType);
  const firedFor = Number(booking.noShow?.firedFor || 0);
  // Every reminder (including the last one) has already been sent —
  // nothing left to schedule. The booking just stays ARRIVED until the
  // driver enters the OTP or someone cancels manually.
  if (firedFor > policy.maxNoShowPrompts) return;
  // Customer already said they're not coming — stop reminding them.
  if (booking.noShow?.customerResponse === 'not_coming') return;
  // First prompt fires AFTER the free-wait window expires +
  // `noShowPromptMinutes` of accrual buffer. Subsequent prompts (after
  // the user said "on my way") use just `noShowPromptMinutes` so the
  // cadence feels consistent.
  const baseMinutes =
    firedFor === 0
      ? policy.freeWaitingMinutes + policy.noShowPromptMinutes
      : policy.noShowPromptMinutes;
  const promptMs = Math.max(0, baseMinutes) * 60_000;
  const fireAt = new Date(arrivedAt).getTime() + promptMs;
  const delay = Math.max(0, fireAt - Date.now());

  const handle = setTimeout(
    () => firePrompt(bookingId).catch((err) =>
      console.warn('[noShow] prompt fire failed:', err?.message),
    ),
    delay,
  );
  noShowTimers.set(key(bookingId), { phase: 'prompt', handle });
}

/**
 * PHASE A fire — flag the booking and ping the customer.
 *
 * Cadence: the first N = `maxNoShowPrompts` prompts are non-terminal —
 * if the customer doesn't answer within `noShowPromptMinutes` we just
 * fire the next prompt. The (N+1)-th prompt is *terminal*: a missed
 * response within `noShowGraceMinutes` auto-completes the ride.
 *
 * `firedFor` records the running prompt number so the FE can show
 * "Reminder 2 of 3" and the cadence survives restarts.
 */
async function firePrompt(bookingId) {
  noShowTimers.delete(key(bookingId));

  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.ARRIVED) return;
  // NOTE: we deliberately do NOT short-circuit here on
  // `customerResponse === 'on_my_way'`. After the user says yes,
  // `recordCustomerOnMyWay` reschedules a fresh prompt — this fire IS
  // that fresh prompt and must go through. The previous response is
  // overwritten by the new prompt state below, which is the audit-safe
  // way to keep the cadence going. Race protection against double-fires
  // is handled by `noShowTimers` (Map-keyed by bookingId).

  const policy = await loadWaitingPolicy(booking.serviceType);
  const firedFor = Number(booking.noShow?.firedFor || 0) + 1;
  const maxPrompts = policy.maxNoShowPrompts;
  // Last reminder = (maxNoShowPrompts + 1)-th. Reminders are purely
  // informational: they NEVER start, complete or cancel the booking.
  // Only a verified ride-start OTP moves ARRIVED → STARTED.
  if (firedFor > maxPrompts + 1) return;
  const isFinalPrompt = firedFor > maxPrompts;
  const now = new Date();
  const windowMinutes = policy.noShowPromptMinutes;
  // No deadline on the last reminder — nothing happens when it lapses.
  const deadline = isFinalPrompt
    ? null
    : new Date(now.getTime() + windowMinutes * 60_000);

  booking.noShow = {
    promptSentAt: now,
    promptDeadlineAt: deadline,
    customerResponse: '',
    respondedAt: null,
    firedFor,
  };
  await booking.save();

  const payload = {
    bookingId: String(booking._id),
    promptSentAt: now,
    promptDeadlineAt: deadline,
    graceMinutes: isFinalPrompt ? null : windowMinutes,
    promptIndex: firedFor,
    maxPrompts,
    isFinal: isFinalPrompt,
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_NOSHOW_PROMPT, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_NOSHOW_PROMPT, payload);

  // Last reminder → stop here. The booking stays ARRIVED.
  if (isFinalPrompt) return;

  // Otherwise queue the next reminder.
  const handle = setTimeout(
    () =>
      firePrompt(bookingId).catch((err) =>
        console.warn('[noShow] reprompt failed:', err?.message),
      ),
    Math.max(0, deadline.getTime() - Date.now()),
  );
  noShowTimers.set(key(bookingId), { phase: 'reprompt', handle });
}

/**
 * Load an ARRIVED booking owned by `userId`. Throws 404 when the booking
 * doesn't exist or belongs to someone else, so a user can never answer
 * the no-show prompt for another customer's ride.
 */
async function loadOwnedBooking(bookingId, userId) {
  if (!mongoose.isValidObjectId(bookingId)) {
    throw new ApiError(404, 'Booking not found');
  }
  const booking = await Booking.findOne({
    _id: bookingId,
    userId,
    isDeleted: { $ne: true },
  }).select('serviceType noShow status userId driverId bookingNumber');
  if (!booking) throw new ApiError(404, 'Booking not found');
  return booking;
}

/**
 * Customer responded "Yes, on my way".
 *
 * Cancel the current timer, mark the response, and reschedule the next
 * reminder for `noShowPromptMinutes` from now. The cap
 * (`maxNoShowPrompts`) is preserved through `firedFor`, so reminders
 * stop after the last one. Nothing here ever changes the booking status.
 */
export async function recordCustomerOnMyWay(bookingId, userId) {
  const booking = await loadOwnedBooking(bookingId, userId);
  if (booking.status !== BOOKING_STATUS.ARRIVED) return;

  await Booking.updateOne(
    { _id: booking._id },
    {
      $set: {
        'noShow.customerResponse': 'on_my_way',
        'noShow.respondedAt': new Date(),
        'noShow.promptDeadlineAt': null,
      },
    },
  );

  cancelNoShowSchedule(booking._id);
  await schedulePromptTimer(booking._id, new Date());

  notifyDriverOfResponse(booking, 'on_my_way');
}

/**
 * Customer responded "No, not coming".
 *
 * We record the answer and tell the driver, but the booking stays
 * ARRIVED — it is NOT auto-completed or auto-cancelled. The ride only
 * moves on when the driver enters the customer's OTP, or when the
 * driver / customer / admin cancels through the normal cancel flow
 * (which applies the cancellation policy and the driver's waiting share).
 */
export async function recordCustomerNotComing(bookingId, userId) {
  const booking = await loadOwnedBooking(bookingId, userId);
  if (booking.status !== BOOKING_STATUS.ARRIVED) return;

  cancelNoShowSchedule(booking._id);
  await Booking.updateOne(
    { _id: booking._id },
    {
      $set: {
        'noShow.customerResponse': 'not_coming',
        'noShow.respondedAt': new Date(),
        'noShow.promptDeadlineAt': null,
      },
    },
  );

  notifyDriverOfResponse(booking, 'not_coming');
}

/** Push the customer's answer to the driver app (socket + notification). */
function notifyDriverOfResponse(booking, response) {
  if (!booking.driverId) return;
  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    noShow: { customerResponse: response, respondedAt: new Date() },
  };
  emitToDriver(booking.driverId, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);

  if (response === 'not_coming') {
    emitNotification(
      { driverId: booking.driverId },
      {
        title: 'Customer says they are not coming',
        body: `${booking.bookingNumber ? `Booking ${booking.bookingNumber}` : 'The booking'} stays open. Wait for the customer's OTP or cancel the ride from the trip screen.`,
        severity: 'warning',
        data: {
          type: 'NOSHOW_NOT_COMING',
          bookingId: String(booking._id),
          url: `/driver/trip/${booking._id}`,
        },
      },
    ).catch((err) =>
      console.warn('[noShow] driver notification failed:', err?.message),
    );
  }
}

/**
 * Cold-start helper. Re-attach a timer for any ARRIVED booking that
 * had its in-process timer dropped by a restart. Called opportunistically
 * from booking fetch paths so we never need a cron.
 */
export async function resumeNoShowScheduleIfNeeded(booking) {
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.ARRIVED) return;
  if (noShowTimers.has(key(booking._id))) return;
  const deadline = booking.noShow?.promptDeadlineAt;
  if (deadline) {
    // A live deadline always means "send the next reminder". `firePrompt`
    // itself stops once the cap is reached, so legacy bookings that were
    // parked on the old auto-complete deadline just get no more prompts.
    const remaining = Math.max(0, new Date(deadline).getTime() - Date.now());
    const handle = setTimeout(
      () =>
        firePrompt(booking._id).catch((err) =>
          console.warn('[noShow] resumed reprompt failed:', err?.message),
        ),
      remaining,
    );
    noShowTimers.set(key(booking._id), { phase: 'reprompt', handle });
    return;
  }
  // Otherwise, resume PHASE A using the original arrivedAt anchor.
  await schedulePromptTimer(
    booking._id,
    booking.timeline?.arrivedAt || new Date(),
  );
}

/**
 * Pull the waiting-charge policy for a service, falling back to safe
 * defaults if no pricing doc exists.
 */
async function loadWaitingPolicy(serviceType) {
  const pricing = await ServicePricing.findOne({
    serviceType,
    isActive: true,
  })
    .select('waitingCharge')
    .lean();
  const w = pricing?.waitingCharge || {};
  return {
    freeWaitingMinutes: Math.max(0, Number(w.freeWaitingMinutes ?? 15)),
    chargePerMinute: Math.max(0, Number(w.chargePerMinute ?? 2)),
    noShowPromptMinutes: Math.max(1, Number(w.noShowPromptMinutes ?? 15)),
    noShowGraceMinutes: Math.max(1, Number(w.noShowGraceMinutes ?? 5)),
    maxNoShowPrompts: Math.max(0, Math.min(5, Number(w.maxNoShowPrompts ?? 2))),
    maxBillableMinutes: Math.max(0, Number(w.maxBillableMinutes ?? 45)),
  };
}
