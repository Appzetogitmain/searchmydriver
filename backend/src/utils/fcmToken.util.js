import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';

/**
 * FCM device-token ownership.
 *
 * An FCM registration token identifies a *browser/device*, not an account. The
 * app registers it against whoever is signed in, so on a shared device — a
 * driver testing the customer app, a family phone, an office laptop — the same
 * token ends up stored on several accounts at once. Nothing ever removed it,
 * because logout only cleared local state.
 *
 * That is a privacy bug, not just untidy data: `emitNotification` looks up the
 * recipient's `fcmToken` and pushes to it, so a token held by four accounts
 * delivers all four accounts' notifications to one device. A customer could
 * receive a stranger's ride details, pickup address and OTP.
 *
 * The invariant these helpers enforce is **one token, one account**. It is
 * applied at registration rather than only at logout, because logout is the
 * one moment we cannot rely on: an app can be uninstalled, storage cleared, or
 * a session can simply expire. Registration, by contrast, always happens on
 * the device we need to re-point.
 */

/**
 * Give `token` exclusively to one account: assign it to the owner and clear it
 * from every other customer and driver that still holds it.
 *
 * Assigning the owner is part of this function rather than left to the caller
 * on purpose. The callers happen to set it themselves first (they save the
 * account document anyway), but a "claim" that only ever *removed* the token
 * would be a trap: calling it on an owner that didn't already hold the token
 * would strip it from every account and leave it with nobody — the device would
 * silently stop receiving push. Owning both halves makes the postcondition
 * unconditional: afterwards, exactly this one account holds the token.
 *
 * Returns the number of *other* accounts the token was taken from, so callers
 * can log a hand-off (useful for spotting shared devices in the wild).
 *
 * @param {string} token              the FCM registration token
 * @param {object} owner
 * @param {string} owner.ownerId      account that keeps the token
 * @param {'User'|'Driver'} owner.ownerModel which collection the owner is in
 */
export async function claimFcmTokenExclusively(token, { ownerId, ownerModel }) {
  if (!token || !ownerId) return 0;

  // Clear from the same collection, except the owner, and from the other
  // collection entirely. `updateMany` is a single indexed write per
  // collection; the common case matches nothing and costs almost nothing.
  const sameCollection = ownerModel === 'Driver' ? Driver : User;
  const otherCollection = ownerModel === 'Driver' ? User : Driver;

  const [same, other] = await Promise.all([
    sameCollection.updateMany(
      { fcmToken: token, _id: { $ne: ownerId } },
      { $set: { fcmToken: '' } },
    ),
    otherCollection.updateMany({ fcmToken: token }, { $set: { fcmToken: '' } }),
    // Idempotent: a no-op when the caller already saved it.
    sameCollection.updateOne({ _id: ownerId }, { $set: { fcmToken: token } }),
  ]);

  const stolenFrom = (same.modifiedCount || 0) + (other.modifiedCount || 0);
  if (stolenFrom > 0) {
    console.log(
      `[fcm] token ...${String(token).slice(-8)} reassigned to ${ownerModel} ${ownerId}` +
        ` — cleared from ${stolenFrom} other account(s) on the same device`,
    );
  }
  return stolenFrom;
}

/**
 * Drop `token` from every account holding it. Used on logout, where the device
 * is explicitly giving up its subscription.
 *
 * Deliberately requires no authentication: the only thing possessing a device
 * token lets you do here is unsubscribe that same device, which is exactly
 * what a logging-out client is asking for. It cannot be used to read anything
 * or to affect any other device.
 */
export async function releaseFcmToken(token) {
  if (!token) return 0;
  const [u, d] = await Promise.all([
    User.updateMany({ fcmToken: token }, { $set: { fcmToken: '' } }),
    Driver.updateMany({ fcmToken: token }, { $set: { fcmToken: '' } }),
  ]);
  return (u.modifiedCount || 0) + (d.modifiedCount || 0);
}
