import mongoose from 'mongoose';
import {
  getIoOrNull,
  roomForUser,
  roomForDriver,
  roomForBooking,
  ADMIN_ROOM,
} from '../config/socket.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import { Notification } from '../models/notification.model.js';
import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { sendFcmNotification } from '../config/firebase.js';
import { FCM_TOKEN_FIELDS } from './fcmToken.util.js';

/**
 * Thin wrappers around `io.to(room).emit(...)` so feature code never imports
 * Socket.IO directly. Every helper is safe to call before the socket server
 * has booted (returns false silently); this lets unit tests and CLI scripts
 * use the same services without crashing.
 *
 * Callers should treat these as fire-and-forget. The return value is for
 * tests and observability only.
 */

function safeEmit(room, event, payload) {
  const io = getIoOrNull();
  if (!io) return false;
  io.to(room).emit(event, payload);
  return true;
}

/**
 * Normalize the id argument to a plain string so callers can hand us
 * either a raw ObjectId, a string, or a populated Mongoose document.
 * Without this guard `${populatedDoc}` interpolates to `[object Object]`
 * and the emit lands in a phantom room (no one receives it).
 */
function toRoomId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

/** Send to all sockets of a specific app user. */
export function emitToUser(userId, event, payload) {
  const id = toRoomId(userId);
  if (!id) return false;
  return safeEmit(roomForUser(id), event, payload);
}

/** Send to all sockets of a specific driver. */
export function emitToDriver(driverId, event, payload) {
  const id = toRoomId(driverId);
  if (!id) return false;
  return safeEmit(roomForDriver(id), event, payload);
}

/** Send to everyone in a booking room (user + driver + admin observers). */
export function emitToBooking(bookingId, event, payload) {
  const id = toRoomId(bookingId);
  if (!id) return false;
  return safeEmit(roomForBooking(id), event, payload);
}

/** Broadcast to every staff dashboard. */
export function emitToAdmins(event, payload) {
  return safeEmit(ADMIN_ROOM, event, payload);
}

/** Broadcast to admins of a specific staff role only. */
export function emitToAdminRole(role, event, payload) {
  if (!role) return false;
  return safeEmit(`${ADMIN_ROOM}:role:${role}`, event, payload);
}

/* ------------------------------------------------------------------ */
/* Push notifications                                                  */
/* ------------------------------------------------------------------ */

/**
 * Send an FCM push to one customer or driver. The single path every push
 * should take, because it owns dead-token handling: when FCM rejects the
 * stored token it is cleared (only if it is still the stored one — the device
 * may have re-registered meanwhile) and the account's open app is told over
 * the socket to mint a fresh token. Without that, a dead token is re-posted
 * from the browser's cache on every app open and push stays broken for good.
 *
 * Never throws.
 *
 * @param {{ model: 'User'|'Driver', id: any }} recipient
 * @param {{ title: string, body?: string, data?: object }} payload
 * @returns {Promise<{ success: boolean, skipped?: string, invalidToken?: boolean }>}
 */
export async function sendPushToRecipient({ model, id }, payload) {
  try {
    const recipientId = toRoomId(id);
    if (!recipientId || (model !== 'User' && model !== 'Driver')) {
      return { success: false, skipped: 'no-recipient' };
    }
    const Model = model === 'Driver' ? Driver : User;
    const fields = Object.values(FCM_TOKEN_FIELDS); // fcmToken (web), fcmTokenApp (app)
    const doc = await Model.findById(recipientId).select(fields.join(' ')).lean();
    // Every distinct token this account has: the browser and the phone app
    // each get their own copy.
    const targets = [];
    for (const field of fields) {
      const token = doc?.[field];
      if (token && !targets.some((t) => t.token === token)) targets.push({ field, token });
    }
    if (!targets.length) return { success: false, skipped: 'no-token' };

    const results = await Promise.all(
      targets.map(async ({ field, token }) => {
        const result = await sendFcmNotification(token, payload);
        if (result?.invalidToken) {
          // Only clear it if it's still the stored one — the device may have
          // re-registered meanwhile.
          await Model.updateOne({ _id: recipientId, [field]: token }, { $set: { [field]: '' } });
          console.warn(
            `[fcm] cleared dead ${field} ...${String(token).slice(-8)} for ${model} ${recipientId} (${result.code})`,
          );
          // Only the web app listens for this; the Flutter app refreshes its
          // native token on its own (onTokenRefresh) and on next launch.
          if (field === FCM_TOKEN_FIELDS.web) {
            const emit = model === 'Driver' ? emitToDriver : emitToUser;
            emit(recipientId, S2C_EVENTS.PUSH_TOKEN_INVALID, { reason: result.code || 'invalid' });
          }
        }
        return result;
      }),
    );
    return {
      success: results.some((r) => r?.success),
      sent: results.filter((r) => r?.success).length,
      invalidToken: results.some((r) => r?.invalidToken),
    };
  } catch (err) {
    console.error('[fcm] sendPushToRecipient failed:', err?.message || err);
    return { success: false, error: err?.message };
  }
}

/* ------------------------------------------------------------------ */
/* Sugar for common payload shapes                                     */
/* ------------------------------------------------------------------ */

/**
 * In-app notification toast. `target` is one of:
 *   { userId: '...' }, { driverId: '...' }, { admin: true }, { adminRole: 'sub_admin' }
 *
 * @param {object} target
 * @param {{ title: string; body?: string; severity?: 'info'|'success'|'warn'|'error'; data?: object }} notification
 */
export async function emitNotification(target, notification) {
  const payload = {
    _id: new mongoose.Types.ObjectId(),
    title: notification.title,
    body: notification.body || '',
    severity: notification.severity || 'info',
    data: notification.data || {},
    isRead: false,
    createdAt: new Date(),
  };

  // Emit the Socket.IO event immediately for instant delivery (non-blocking)
  let emitted = false;
  if (target.userId) emitted = emitToUser(target.userId, S2C_EVENTS.NOTIFICATION, payload);
  else if (target.driverId) emitted = emitToDriver(target.driverId, S2C_EVENTS.NOTIFICATION, payload);
  else if (target.adminRole) emitted = emitToAdminRole(target.adminRole, S2C_EVENTS.NOTIFICATION, payload);
  else if (target.admin) emitted = emitToAdmins(S2C_EVENTS.NOTIFICATION, payload);

  // Run DB save and FCM push notification asynchronously in the background
  (async () => {
    try {
      let recipientModel = null;
      let recipientId = null;

      if (target.userId) {
        recipientModel = 'User';
        recipientId = target.userId;
      } else if (target.driverId) {
        recipientModel = 'Driver';
        recipientId = target.driverId;
      } else if (target.admin || target.adminRole) {
        recipientModel = 'Admin';
      }

      if (recipientModel) {
        await Notification.create({
          _id: payload._id,
          recipientId,
          recipientModel,
          title: payload.title,
          body: payload.body,
          severity: payload.severity,
          data: payload.data,
        });

        if (recipientModel !== 'Admin') {
          await sendPushToRecipient(
            { model: recipientModel, id: recipientId },
            {
              title: payload.title,
              body: payload.body,
              // notificationId lets the app de-duplicate the push against the
              // in-app socket notification for the same event.
              data: { ...(payload.data || {}), notificationId: String(payload._id) },
            },
          );
        }
      }
    } catch (err) {
      console.error('[Notification] Background DB/FCM task failed:', err);
    }
  })();

  return emitted;
}

/**
 * Operational alert for admin dashboards (driver shortage, kit low, etc.).
 *
 * @param {{ kind: string; severity?: 'info'|'warn'|'critical'; message: string; data?: object }} alert
 */
export function emitAdminAlert(alert) {
  return emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
    kind: alert.kind,
    severity: alert.severity || 'info',
    message: alert.message,
    data: alert.data || {},
    occurredAt: Date.now(),
  });
}
