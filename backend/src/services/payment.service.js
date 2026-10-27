import Payment from '../models/payment.model.js';
import KitOrder from '../models/kitOrder.model.js';
import {
  PAYMENT_STATUS,
  KIT_ADMIN_STATUS,
  PAYMENT_PURPOSE,
  PAYMENT_PROVIDER,
} from '../constants/kitStatus.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import { ApiError } from '../utils/apiError.js';
import { verifyRazorpayPaymentSignature } from '../utils/razorpay.js';
import { appendKitOrderHistory } from '../utils/kitOrderHistory.util.js';
import { syncDriverKitEligibility } from '../utils/kitEligibility.util.js';

export const verifyKitPaymentService = async (driverId, body) => {
  const {
    orderId,
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
  } = body;

  if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new ApiError(400, 'Missing payment verification fields');
  }

  const kitOrder = await KitOrder.findOne({ _id: orderId, driverId });
  if (!kitOrder) throw new ApiError(404, 'Order not found');

  if (kitOrder.paymentStatus === PAYMENT_STATUS.PAID) {
    const eligibility = await syncDriverKitEligibility(driverId);
    return { order: kitOrder, eligibility, alreadyPaid: true };
  }

  if (kitOrder.razorpayOrderId !== razorpayOrderId) {
    throw new ApiError(400, 'Order mismatch');
  }

  const valid = verifyRazorpayPaymentSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });

  if (!valid) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  let payment = await Payment.findOne({ referenceId: kitOrder._id, referenceModel: 'KitOrder' });

  if (!payment) {
    payment = await Payment.create({
      provider: PAYMENT_PROVIDER.RAZORPAY,
      purpose: PAYMENT_PURPOSE.DRIVER_KIT,
      referenceId: kitOrder._id,
      referenceModel: 'KitOrder',
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      amount: kitOrder.amount,
      currency: kitOrder.currency,
      status: 'captured',
      driverId,
    });
  } else {
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    payment.status = 'captured';
    await payment.save();
  }

  const prevPayment = kitOrder.paymentStatus;
  kitOrder.paymentStatus = PAYMENT_STATUS.PAID;
  kitOrder.paymentId = payment._id;
  kitOrder.adminStatus = KIT_ADMIN_STATUS.PENDING;
  appendKitOrderHistory(kitOrder, {
    field: 'paymentStatus',
    from: prevPayment,
    to: PAYMENT_STATUS.PAID,
    note: 'Payment verified',
  });
  await kitOrder.save();

  const { upsertKitOrderReviewTask } = await import('./adminTask.service.js');
  await upsertKitOrderReviewTask(kitOrder);

  const eligibility = await syncDriverKitEligibility(driverId);

  return { order: kitOrder, payment, eligibility, alreadyPaid: false };
};

/**
 * Settle a booking payment delivered by webhook.
 *
 * Bookings were never handled here — the webhook only ever looked for a
 * KitOrder, so a captured booking payment whose checkout callback failed had
 * no path back into the system at all. The order's `notes.bookingId` (set in
 * `createBookingPaymentOrderService`) is what links the Razorpay order to the
 * booking; we fall back to matching on the stored order id when notes are
 * absent, which covers orders created before notes were added.
 *
 * Delegates to the same `applyCapturedBookingPayment` the checkout callback
 * uses, so a webhook-settled booking is indistinguishable from a normally-paid
 * one — and that function is idempotent on payment id, so a webhook racing the
 * callback or the reconciler is safe.
 */
async function handleBookingPaymentCaptured(paymentEntity, razorpayOrderId) {
  const Booking = (await import('../models/booking.model.js')).default;
  const { applyCapturedBookingPayment } = await import('./bookingPayment.service.js');

  // Prefer the note, fall back to the stored order id. The note is only a
  // hint: it round-trips through Razorpay, so it has to be validated as an
  // ObjectId before it reaches a query (a malformed value would otherwise
  // throw a CastError and fail the whole delivery), and a miss has to fall
  // through rather than conclude the booking does not exist.
  const noteId = paymentEntity?.notes?.bookingId;
  const mongoose = (await import('mongoose')).default;
  let booking = null;
  if (noteId && mongoose.Types.ObjectId.isValid(noteId)) {
    booking = await Booking.findOne({ _id: noteId, isDeleted: false });
  }
  if (!booking) {
    booking = await Booking.findOne({ 'razorpay.orderId': razorpayOrderId, isDeleted: false });
  }

  if (!booking) return { handled: false };

  // Already credited (callback or reconciler got there first).
  if (booking.razorpay?.paymentId === paymentEntity.id) {
    return { handled: true, skipped: true, kind: 'booking' };
  }

  // A booking that has already ended must not be quietly marked paid — the
  // money needs to go back instead. The reconciler owns that decision (and
  // the refund), so we leave the booking untouched and let its next pass
  // pick it up rather than duplicating the settle-or-refund logic here.
  const isLive =
    booking.status === BOOKING_STATUS.AWAITING_PAYMENT ||
    booking.status === BOOKING_STATUS.SEARCHING;
  if (!isLive) {
    console.warn(
      '[webhook] captured payment for non-live booking',
      booking.bookingNumber,
      `(status: ${booking.status}) — deferring to the reconciler for refund`,
    );
    return { handled: true, deferred: 'reconciler', kind: 'booking' };
  }

  await applyCapturedBookingPayment(booking, {
    paymentId: paymentEntity.id,
    signature: null,
    chargedRupees: (paymentEntity.amount || 0) / 100,
  });

  console.log('[webhook] settled booking', booking.bookingNumber, 'from payment.captured');
  return { handled: true, kind: 'booking' };
}

export const handleRazorpayWebhookService = async (event, payload) => {
  if (event === 'payment.captured') {
    const paymentEntity = payload?.payment?.entity;
    const orderEntity = payload?.order?.entity;
    // `order.entity` is only present when the webhook is subscribed with the
    // order payload; `payment.entity.order_id` is always there.
    const razorpayOrderId = orderEntity?.id || paymentEntity?.order_id;
    if (!paymentEntity?.id || !razorpayOrderId) return { handled: false };

    const kitOrder = await KitOrder.findOne({ razorpayOrderId });
    if (!kitOrder) {
      // Not a kit order — the other thing we take money for is bookings.
      return handleBookingPaymentCaptured(paymentEntity, razorpayOrderId);
    }
    if (kitOrder.paymentStatus === PAYMENT_STATUS.PAID) {
      return { handled: true, skipped: true };
    }

    kitOrder.paymentStatus = PAYMENT_STATUS.PAID;
    kitOrder.adminStatus = KIT_ADMIN_STATUS.PENDING;
    appendKitOrderHistory(kitOrder, {
      field: 'paymentStatus',
      from: PAYMENT_STATUS.PENDING,
      to: PAYMENT_STATUS.PAID,
      note: 'Webhook: payment captured',
    });
    await kitOrder.save();
    const { upsertKitOrderReviewTask } = await import('./adminTask.service.js');
    await upsertKitOrderReviewTask(kitOrder);
    await syncDriverKitEligibility(kitOrder.driverId);
    return { handled: true };
  }

  if (event === 'payment.failed') {
    const orderEntity = payload?.payment?.entity;
    const razorpayOrderId = orderEntity?.order_id;
    if (!razorpayOrderId) return { handled: false };

    const kitOrder = await KitOrder.findOne({ razorpayOrderId });
    if (kitOrder && kitOrder.paymentStatus === PAYMENT_STATUS.PENDING) {
      kitOrder.paymentStatus = PAYMENT_STATUS.FAILED;
      appendKitOrderHistory(kitOrder, {
        field: 'paymentStatus',
        from: PAYMENT_STATUS.PENDING,
        to: PAYMENT_STATUS.FAILED,
        note: 'Webhook: payment failed',
      });
      await kitOrder.save();
    }
    return { handled: true };
  }

  return { handled: false };
};
