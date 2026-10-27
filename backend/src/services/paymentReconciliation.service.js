import Booking from '../models/booking.model.js';
import {
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
} from '../constants/bookingStatus.js';
import {
  fetchRazorpayOrderPayments,
  refundRazorpayPayment,
} from '../utils/razorpay.js';
import { applyCapturedBookingPayment } from './bookingPayment.service.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import { emitToAdmins, emitNotification } from '../utils/socketEmitters.js';

/**
 * Captured-payment reconciler.
 *
 * The checkout callback (`verifyBookingPaymentService`) is the happy path, but
 * it runs in the customer's browser: if the app is backgrounded, the network
 * drops, or the tab closes in the second between Razorpay capturing the money
 * and our callback firing, the money is taken and the booking never learns
 * about it. The 60-second payment timer then cancels the booking and releases
 * the driver, so the customer is charged for a ride that does not exist.
 *
 * Razorpay's webhook is meant to cover exactly this, and it now does (see the
 * booking branch in `payment.service.js`) — but a webhook is a delivery with a
 * finite retry budget, and it is useless if the endpoint is misconfigured. So
 * this sweep is the authority of last resort: it asks Razorpay directly what it
 * holds against each unsettled order and acts on the answer.
 *
 * Two outcomes per captured payment:
 *
 *   1. The booking is still live (awaiting payment / searching) → settle it
 *      through the same code path a normal payment takes, and the ride
 *      proceeds. The customer never notices anything went wrong.
 *   2. The booking is already terminal (cancelled by the payment timer, or by
 *      either party) → the money must go back. Refund it in full and record
 *      the refund id on the booking.
 *
 * Everything here is idempotent and safe to run concurrently with the webhook:
 * `applyCapturedBookingPayment` no-ops on a payment id it has already credited,
 * and the refund path writes `razorpay.refundId` under a conditional update so
 * only one of two racing sweeps can issue the refund.
 */

/**
 * Operating mode, from `PAYMENT_RECONCILIATION_MODE`:
 *
 *   off      — do not run at all.
 *   dry_run  — read from Razorpay and log/alert exactly what would happen,
 *              but never settle a booking or issue a refund. **The default.**
 *   on       — act: settle late captures and refund orphaned ones.
 *
 * `dry_run` is the default deliberately. This job moves real money without a
 * human in the loop, and its first pass runs against whatever data is already
 * in the database — which, on a system that has been running without webhook
 * delivery, may be a sizeable backlog. An operator should read one dry-run
 * pass before arming it rather than discovering its judgement through refunds.
 */
const MODE = (process.env.PAYMENT_RECONCILIATION_MODE || 'dry_run').toLowerCase();
const IS_OFF = MODE === 'off';
const IS_DRY_RUN = MODE === 'dry_run';

/** How far back to look. Razorpay keeps orders far longer; we only care about recent money. */
const LOOKBACK_HOURS = 72;

/** Bound the work per sweep so a backlog can't monopolise the event loop. */
const MAX_PER_SWEEP = 50;

/** Statuses where settling a late payment still lets the ride happen. */
const SETTLEABLE_STATUSES = Object.freeze([
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.SEARCHING,
]);

/**
 * Bookings that told Razorpay to collect money and have nothing to show for it.
 *
 * The filter deliberately includes terminal bookings: a booking cancelled by
 * the payment timer is the single most likely place for an orphaned capture to
 * be hiding, and it is the case that costs a real customer real money.
 */
async function findUnsettledBookings() {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);
  return Booking.find({
    isDeleted: false,
    'razorpay.orderId': { $nin: [null, ''] },
    // Nothing captured has been credited yet, and no refund has been issued.
    'razorpay.paymentId': { $in: [null, ''] },
    'razorpay.refundId': { $in: [null, ''] },
    paymentStatus: {
      $in: [
        BOOKING_PAYMENT_STATUS.PENDING,
        BOOKING_PAYMENT_STATUS.FAILED,
      ],
    },
    updatedAt: { $gte: since },
  })
    .sort({ updatedAt: 1 })
    .limit(MAX_PER_SWEEP);
}

/** The first fully-captured payment Razorpay holds for this order, if any. */
function pickCapturedPayment(payments) {
  return payments.find((p) => p?.status === 'captured') || null;
}

/**
 * Money came in for a booking that is already dead. Send it back.
 *
 * The conditional update is the concurrency guard: two sweeps (or a sweep and
 * a webhook) can both see the same orphaned capture, but only the one that
 * wins the `refundId: null` match issues the refund call.
 */
async function refundOrphanedCapture(booking, payment) {
  const amountRupees = (payment.amount || 0) / 100;

  if (IS_DRY_RUN) {
    console.warn(
      '[reconcile:dry-run] WOULD REFUND',
      payment.id,
      `₹${amountRupees}`,
      'for booking',
      booking.bookingNumber,
      `(status: ${booking.status}) — set PAYMENT_RECONCILIATION_MODE=on to act`,
    );
    return { action: 'dry_run_refund', amountRupees };
  }

  const claimed = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      $or: [
        { 'razorpay.refundId': null },
        { 'razorpay.refundId': '' },
        { 'razorpay.refundId': { $exists: false } },
      ],
    },
    { $set: { 'razorpay.refundId': `pending:${payment.id}` } },
    { new: true },
  );
  if (!claimed) return { action: 'skipped_already_refunding' };

  try {
    const refund = await refundRazorpayPayment({
      paymentId: payment.id,
      amountPaise: payment.amount,
      notes: {
        reason: 'auto_reconciliation_booking_not_live',
        bookingId: String(booking._id),
        bookingNumber: booking.bookingNumber || '',
        bookingStatus: booking.status,
      },
    });

    await Booking.updateOne(
      { _id: booking._id },
      {
        $set: {
          'razorpay.refundId': refund.id,
          'razorpay.paymentId': payment.id,
          paymentStatus: BOOKING_PAYMENT_STATUS.REFUNDED,
        },
      },
    );

    const amountRupees = (payment.amount || 0) / 100;
    console.warn(
      '[reconcile] refunded orphaned capture',
      payment.id,
      `₹${amountRupees}`,
      'for booking',
      booking.bookingNumber,
      `(status: ${booking.status})`,
    );

    emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
      kind: 'payment_auto_refunded',
      severity: 'warn',
      message:
        `Booking ${booking.bookingNumber} was charged ₹${amountRupees} but is ` +
        `${booking.status} — the payment was captured after the booking ended. ` +
        `An automatic refund has been issued (${refund.id}).`,
      data: {
        bookingId: String(booking._id),
        paymentId: payment.id,
        refundId: refund.id,
        amountRupees,
        bookingStatus: booking.status,
      },
    });

    emitNotification(
      { userId: booking.userId },
      {
        title: 'Refund issued',
        body:
          `Your payment of ₹${amountRupees} for booking ${booking.bookingNumber} ` +
          `was received after the ride was cancelled. We have refunded it in full — ` +
          `it should reach your account in 5-7 working days.`,
        severity: 'info',
        data: { type: 'PAYMENT_REFUNDED', bookingId: String(booking._id) },
      },
    ).catch(() => {});

    return { action: 'refunded', refundId: refund.id, amountRupees };
  } catch (err) {
    // Release the claim so the next sweep retries rather than leaving the
    // booking permanently marked as "refund in progress".
    await Booking.updateOne(
      { _id: booking._id, 'razorpay.refundId': `pending:${payment.id}` },
      { $set: { 'razorpay.refundId': null } },
    ).catch(() => {});
    throw err;
  }
}

/** Money came in for a booking that can still run. Credit it and carry on. */
async function settleLateCapture(booking, payment) {
  const amountRupees = (payment.amount || 0) / 100;

  if (IS_DRY_RUN) {
    console.warn(
      '[reconcile:dry-run] WOULD SETTLE',
      payment.id,
      `₹${amountRupees}`,
      'onto booking',
      booking.bookingNumber,
      `(status: ${booking.status}) — set PAYMENT_RECONCILIATION_MODE=on to act`,
    );
    return { action: 'dry_run_settle', amountRupees };
  }

  await applyCapturedBookingPayment(booking, {
    paymentId: payment.id,
    signature: null,
    chargedRupees: (payment.amount || 0) / 100,
  });

  console.warn(
    '[reconcile] settled late capture',
    payment.id,
    'for booking',
    booking.bookingNumber,
  );

  emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
    kind: 'payment_late_settled',
    severity: 'info',
    message:
      `Booking ${booking.bookingNumber} was paid but the checkout callback never ` +
      `reached us. The payment has been reconciled from Razorpay and the booking ` +
      `is now settled.`,
    data: {
      bookingId: String(booking._id),
      paymentId: payment.id,
      amountRupees: (payment.amount || 0) / 100,
    },
  });

  return { action: 'settled', amountRupees: (payment.amount || 0) / 100 };
}

/**
 * One reconciliation pass. Never throws — a gateway hiccup must not take the
 * sweep loop down with it, and the next pass will pick the booking up again.
 *
 * Returns a per-run summary so the caller can log something meaningful.
 */
export async function reconcileStalePayments() {
  const summary = { mode: MODE, checked: 0, settled: 0, refunded: 0, failed: 0 };
  if (IS_OFF) return { ...summary, skipped: 'mode_off' };

  let candidates;
  try {
    candidates = await findUnsettledBookings();
  } catch (err) {
    console.warn('[reconcile] failed to query unsettled bookings:', err?.message);
    return summary;
  }

  for (const booking of candidates) {
    summary.checked += 1;
    try {
      const payments = await fetchRazorpayOrderPayments(booking.razorpay.orderId);
      const captured = pickCapturedPayment(payments);
      if (!captured) continue;

      if (SETTLEABLE_STATUSES.includes(booking.status)) {
        const result = await settleLateCapture(booking, captured);
        if (result.action === 'settled' || result.action === 'dry_run_settle') {
          summary.settled += 1;
        }
      } else {
        const result = await refundOrphanedCapture(booking, captured);
        if (result.action === 'refunded' || result.action === 'dry_run_refund') {
          summary.refunded += 1;
        }
      }
    } catch (err) {
      summary.failed += 1;
      console.warn(
        '[reconcile] booking',
        String(booking._id),
        'reconciliation failed:',
        err?.message,
      );
    }
  }

  if (summary.settled || summary.refunded || summary.failed) {
    console.log('[reconcile] pass complete', summary);
  }
  return summary;
}
