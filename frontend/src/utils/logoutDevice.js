/**
 * Server-side logout + push deregistration.
 *
 * Two problems this fixes, both caused by `logout()` having been a purely
 * local zustand reset:
 *
 *   1. **The refresh cookie was never cleared.** Signing out wiped local state
 *      but left a valid httpOnly refresh token in the browser, so the session
 *      was still live as far as the API was concerned.
 *
 *   2. **The device stayed subscribed to push.** An FCM token identifies a
 *      device, not an account, and nothing removed it on logout — so a
 *      signed-out phone kept receiving the previous account's ride
 *      notifications, including pickup address and OTP.
 *
 * Deliberately uses bare `fetch` rather than the shared axios instance:
 * `utils/api.js` imports the auth stores, so a store importing it back would
 * be a circular import. Logout also wants none of that instance's behaviour —
 * no auth header, no 401 refresh-and-retry.
 *
 * Never rejects. Signing out must succeed locally even with no network, so the
 * caller clears state regardless of what the server says.
 */

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

/** localStorage key holding this device's last registered FCM token. */
export const FCM_TOKEN_CACHE_KEY = 'fcm-device-token';

const LOGOUT_PATHS = {
  user: '/auth/logout',
  driver: '/driver/auth/logout',
  admin: '/admin/auth/logout',
};

/** Remember the token so logout can tell the server what to deregister. */
export function cacheFcmToken(token) {
  try {
    if (token) localStorage.setItem(FCM_TOKEN_CACHE_KEY, token);
  } catch {
    // Private mode / blocked storage — logout just won't deregister.
  }
}

function readCachedFcmToken() {
  try {
    return localStorage.getItem(FCM_TOKEN_CACHE_KEY) || null;
  } catch {
    return null;
  }
}

function clearCachedFcmToken() {
  try {
    localStorage.removeItem(FCM_TOKEN_CACHE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Tell the API this device is signing out. Fire-and-forget.
 *
 * @param {'user'|'driver'|'admin'} audience which app is signing out
 */
export async function logoutOnServer(audience) {
  const path = LOGOUT_PATHS[audience];
  if (!path) return;

  const fcmToken = readCachedFcmToken();
  // Drop the local copy first: even if the request fails we must not leave a
  // stale token behind for the next account on this device to inherit.
  clearCachedFcmToken();

  try {
    await fetch(`${API_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Audience': audience },
      body: JSON.stringify(fcmToken ? { fcmToken } : {}),
      keepalive: true,
    });
  } catch {
    // Offline or server down — local sign-out still proceeds.
  }
}
