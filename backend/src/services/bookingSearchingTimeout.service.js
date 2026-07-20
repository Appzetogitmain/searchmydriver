import Booking from '../models/booking.model.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import { emitToUser, emitToAdmins } from '../utils/socketEmitters.js';
import { adminMarkNoDriversFoundService } from './booking.service.js';

/**
 * Searching Timeout Service.
 * 
 * If a booking is stuck in SEARCHING for more than 30 minutes, 
 * it is automatically cancelled and admins/users are notified.
 */

const searchingTimers = new Map();

function key(id) {
  return String(id);
}

export function cancelSearchingSchedule(bookingId) {
  const k = key(bookingId);
  const entry = searchingTimers.get(k);
  if (entry?.handle) clearTimeout(entry.handle);
  searchingTimers.delete(k);
}

export async function scheduleSearchingTimeout(bookingId, createdAt) {
  cancelSearchingSchedule(bookingId);

  const booking = await Booking.findById(bookingId).select('status').lean();
  if (!booking) return;

  // We only schedule if it's currently SEARCHING
  if (booking.status !== BOOKING_STATUS.SEARCHING && booking.status !== BOOKING_STATUS.DISPATCHING) {
    return;
  }

  // 30 minutes grace period
  const promptMs = 30 * 60 * 1000;
  const fireAt = new Date(createdAt || Date.now()).getTime() + promptMs;
  const delay = Math.max(0, fireAt - Date.now());

  const handle = setTimeout(
    () => fireSearchingTimeout(bookingId).catch((err) => console.error('[SearchingTimeout]', err)),
    delay
  );

  searchingTimers.set(key(bookingId), { handle });
}

export async function resumeSearchingScheduleIfNeeded(booking) {
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.SEARCHING && booking.status !== BOOKING_STATUS.DISPATCHING) {
    cancelSearchingSchedule(booking._id);
    return;
  }

  const k = key(booking._id);
  if (searchingTimers.has(k)) {
    // Already tracking
    return;
  }

  // Schedule if not already
  await scheduleSearchingTimeout(booking._id, booking.timeline.createdAt);
}

async function fireSearchingTimeout(bookingId) {
  searchingTimers.delete(key(bookingId));

  const booking = await adminMarkNoDriversFoundService(bookingId);
  if (!booking) return;

  const escalated = booking.status === BOOKING_STATUS.IN_EMERGENCY_POOL;

  // Notify User
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, {
    bookingId: String(booking._id),
    status: booking.status,
  });

  // Notify Admins
  emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
    kind: escalated ? 'emergency_pool_entered' : 'no_drivers_found_timeout',
    severity: 'warn',
    message: escalated
      ? `Scheduled booking ${booking.bookingNumber} needs manual driver assignment (Searching timeout)`
      : `Booking ${booking.bookingNumber} was automatically cancelled after 30 minutes of searching.`,
    data: { bookingId: String(booking._id) },
  });
}
