/**
 * Why an offer stopped being actionable for this driver.
 *
 * Two very different things used to collapse into the same "Booked by another
 * driver" label: the booking really being gone, and *this* driver simply not
 * being allowed to take it right now. The second kind is about the driver, not
 * the booking — the booking is still SEARCHING and the customer is still
 * waiting — so painting it as taken told the driver a flat lie.
 *
 * Reasons come from two places, and both are handled here:
 *   - `acceptBookingService` rejections, surfaced as `data.reason` on the 400
 *     from `POST /driver/bookings/:id/accept` (and on the socket ack).
 *   - `BOOKING_OFFER_WITHDRAWN` socket payloads (`payload.reason`).
 */

/** The booking is genuinely no longer available to anyone but its new driver. */
const BOOKING_GONE_REASONS = new Set([
  // Accept-path: the race was already lost, or the booking vanished.
  'no_longer_searching',
  'not_found',
  // Withdraw-path: another driver in the wave won it.
  'awarded_to_other_driver',
  // Withdraw-path default — user cancelled, admin pulled it, etc.
  'cancelled',
]);

/**
 * True when the offer ended because the booking itself is gone, so the card
 * should go grey and read "Booked by another driver".
 *
 * Anything else — `driver_busy`, `negative_wallet_cash_blocked`,
 * `city_mismatch`, `timeout`, `rejected_by_driver`, a server error, a dropped
 * connection — leaves the booking live. We surface the message but keep the
 * card actionable, because the driver may well be able to take it once the
 * blocker clears.
 */
export function isBookingGoneReason(reason) {
  return BOOKING_GONE_REASONS.has(String(reason || ''));
}

/** Pull the reason out of an axios error raised by the accept endpoint. */
export function acceptErrorReason(err) {
  return err?.response?.data?.data?.reason || null;
}

/**
 * Driver-readable text for each accept-path refusal. The server only sends a
 * `message` for some of them; without this map the raw code (`city_mismatch`)
 * was shown to the driver verbatim.
 */
const ACCEPT_REASON_MESSAGES = {
  no_longer_searching: 'This trip has already been booked by another driver.',
  not_found: 'This trip is no longer available.',
  driver_not_found: 'Your driver account could not be found. Please log in again.',
  driver_suspended: 'Your account is suspended. You cannot accept rides.',
  driver_busy: 'You already have an ongoing ride. Complete it to accept new requests.',
  negative_wallet_cash_blocked:
    'Cannot accept cash bookings while your wallet balance is negative. Please recharge your wallet.',
  city_mismatch: 'This trip is outside your service city or zone.',
};

/** Human-readable message for a failed accept call. */
export function acceptErrorMessage(err) {
  const reason = acceptErrorReason(err);
  const serverMessage = err?.response?.data?.message;
  if (serverMessage && serverMessage !== reason) return serverMessage;
  if (reason && ACCEPT_REASON_MESSAGES[reason]) return ACCEPT_REASON_MESSAGES[reason];
  return 'Could not accept this trip. Please try again.';
}
