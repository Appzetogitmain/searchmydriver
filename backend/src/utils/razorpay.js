import Razorpay from 'razorpay';
import crypto from 'crypto';
import { ApiError } from './apiError.js';

let razorpayInstance = null;

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new ApiError(503, 'Payment gateway is not configured. Contact support.');
  }

  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  return razorpayInstance;
}

export function getRazorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID || '';
}

export async function createRazorpayOrder({ amountPaise, currency = 'INR', receipt, notes = {} }) {
  const razorpay = getRazorpay();
  return razorpay.orders.create({
    amount: amountPaise,
    currency,
    receipt,
    notes,
  });
}

/**
 * Constant-time comparison of two hex digests.
 *
 * `crypto.timingSafeEqual` throws when the buffers differ in length, so the
 * length check has to come first — and it is not itself a leak, because the
 * expected digest's length is fixed and public (64 hex chars for sha256).
 */
function safeCompareHex(expected, received) {
  if (typeof received !== 'string' || expected.length !== received.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
  } catch {
    // Non-hex input — Buffer.from silently truncates, so a length mismatch
    // can still surface here. Treat anything unparseable as a failed match.
    return false;
  }
}

export function verifyRazorpayPaymentSignature({ orderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;

  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return safeCompareHex(expected, signature);
}

export function verifyRazorpayWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return safeCompareHex(expected, signature);
}

/**
 * Whether webhook delivery can be verified at all.
 *
 * `verifyRazorpayWebhookSignature` fails closed without the secret, which is
 * the right default but silently rejects every delivery — so the server warns
 * loudly at boot instead of letting payments go unreconciled unnoticed.
 */
export function isRazorpayWebhookConfigured() {
  return Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
}

/**
 * Every payment Razorpay has recorded against an order.
 *
 * This is the authority the reconciler trusts: it is fetched server-side over
 * TLS with our own key, so unlike the checkout callback there is no client
 * signature to verify. Returns `[]` rather than throwing when the order is
 * unknown to Razorpay, so a stale/half-written order id can't wedge a sweep.
 */
export async function fetchRazorpayOrderPayments(orderId) {
  if (!orderId) return [];
  const razorpay = getRazorpay();
  try {
    const res = await razorpay.orders.fetchPayments(orderId);
    return Array.isArray(res?.items) ? res.items : [];
  } catch (err) {
    if (err?.statusCode === 400 || err?.statusCode === 404) return [];
    throw err;
  }
}

/**
 * Refund a captured payment. `amountPaise` omitted refunds it in full.
 *
 * `speed: 'normal'` (rather than 'optimum') keeps the refund on the cheaper
 * rail — these are automated reconciliation refunds, not customer-visible
 * instant ones.
 */
export async function refundRazorpayPayment({ paymentId, amountPaise, notes = {} }) {
  if (!paymentId) throw new ApiError(400, 'paymentId is required to refund');
  const razorpay = getRazorpay();
  return razorpay.payments.refund(paymentId, {
    ...(amountPaise != null ? { amount: amountPaise } : {}),
    speed: 'normal',
    notes,
  });
}
