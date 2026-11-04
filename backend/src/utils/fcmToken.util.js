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

/** Which account field stores each platform's token. */
export const FCM_TOKEN_FIELDS = Object.freeze({ web: 'fcmToken', app: 'fcmTokenApp' });
export const FCM_PLATFORMS = Object.keys(FCM_TOKEN_FIELDS);

/** Normalise a client-supplied platform; anything unknown is `null`. */
export function normalizeFcmPlatform(platform) {
  const p = String(platform ?? 'web').trim().toLowerCase();
  return FCM_TOKEN_FIELDS[p] ? p : null;
}

/** Clear `token` from whichever token field(s) of a matching account hold it. */
async function clearTokenEverywhere(Model, token, extraFilter = {}) {
  const results = await Promise.all(
    Object.values(FCM_TOKEN_FIELDS).map((f) =>
      Model.updateMany({ ...extraFilter, [f]: token }, { $set: { [f]: '' } }),
    ),
  );
  return results.reduce((n, r) => n + (r.modifiedCount || 0), 0);
}

/**
 * Give `token` exclusively to one account: store it in the owner's field for
 * `platform` and clear it from every other customer and driver — and from the
 * owner's other platform field — that still holds it.
 *
 * Assigning the owner is part of this function rather than left to the caller
 * on purpose: a "claim" that only ever *removed* the token would strip it from
 * every account when called on an owner that didn't already hold it, and the
 * device would silently stop receiving push. Afterwards, exactly this one
 * account holds the token, in exactly one field.
 *
 * Returns the number of *other* account fields the token was taken from.
 *
 * @param {string} token              the FCM registration token
 * @param {object} owner
 * @param {string} owner.ownerId      account that keeps the token
 * @param {'User'|'Driver'} owner.ownerModel which collection the owner is in
 * @param {'web'|'app'} [owner.platform='web'] which token field to store it in
 */
export async function claimFcmTokenExclusively(token, { ownerId, ownerModel, platform = 'web' }) {
  if (!token || !ownerId) return 0;
  const field = FCM_TOKEN_FIELDS[normalizeFcmPlatform(platform) || 'web'];
  const otherField = Object.values(FCM_TOKEN_FIELDS).find((f) => f !== field);

  const sameCollection = ownerModel === 'Driver' ? Driver : User;
  const otherCollection = ownerModel === 'Driver' ? User : Driver;

  const [same, other] = await Promise.all([
    clearTokenEverywhere(sameCollection, token, { _id: { $ne: ownerId } }),
    clearTokenEverywhere(otherCollection, token),
    // The same token can't be both this account's web and app token.
    sameCollection.updateOne({ _id: ownerId, [otherField]: token }, { $set: { [otherField]: '' } }),
  ]);
  // Idempotent: a no-op when the caller already saved it.
  await sameCollection.updateOne({ _id: ownerId }, { $set: { [field]: token } });

  const stolenFrom = same + other;
  if (stolenFrom > 0) {
    console.log(
      `[fcm] token ...${String(token).slice(-8)} reassigned to ${ownerModel} ${ownerId}` +
        ` — cleared from ${stolenFrom} other account(s) on the same device`,
    );
  }
  return stolenFrom;
}

/**
 * Drop `token` from every account (either platform field) holding it. Used on
 * logout, where the device is explicitly giving up its subscription.
 *
 * Deliberately requires no authentication: the only thing possessing a device
 * token lets you do here is unsubscribe that same device, which is exactly
 * what a logging-out client is asking for. It cannot be used to read anything
 * or to affect any other device.
 */
export async function releaseFcmToken(token) {
  if (!token) return 0;
  const [u, d] = await Promise.all([clearTokenEverywhere(User, token), clearTokenEverywhere(Driver, token)]);
  return u + d;
}

