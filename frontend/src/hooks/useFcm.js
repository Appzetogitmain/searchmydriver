import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useUserAuthStore from '../store/useUserAuthStore';
import useDriverAuthStore from '../store/useDriverAuthStore';
import useSocketStore from '../store/useSocketStore';
import { requestFcmToken, onFcmMessage, isFirebaseConfigured } from '../config/firebase';
import { S2C_EVENTS } from '../constants/socketEvents';
import api from '../utils/api';
import { cacheFcmToken } from '../utils/logoutDevice';
import { showSystemNotification } from '../utils/systemNotification';

const ENDPOINT = { user: '/auth/fcm-token', driver: '/driver/fcm-token' };

/** One registration at a time — the banner tap and the auto-refresh can race. */
let inFlight = null;

async function postToken(role, token) {
  try {
    await api.post(ENDPOINT[role] || ENDPOINT.user, { token });
    return 'ok';
  } catch (err) {
    // The server checks the token with FCM first and answers 422
    // FCM_TOKEN_STALE when it is dead or belongs to another Firebase project.
    if (err?.response?.status === 422 && err.response.data?.data?.code === 'FCM_TOKEN_STALE') {
      return 'stale';
    }
    throw err;
  }
}

/**
 * Get this device's FCM token and save it on the signed-in customer or driver.
 * If the server rejects the token as stale, mint a brand-new one and retry
 * once — otherwise the browser keeps re-sending the same dead cached token.
 *
 * @param {'user'|'driver'} role
 * @param {object}  [opts]
 * @param {boolean} [opts.prompt=false]       show the permission prompt. Pass
 *   true only from a tap (required on iPhone).
 * @param {boolean} [opts.forceRefresh=false] start from a fresh token.
 * @returns {Promise<boolean>} true when the device is registered for push.
 */
export function registerPushToken(role = 'user', { prompt = false, forceRefresh = false } = {}) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (!isFirebaseConfigured()) return false;

    let token = await requestFcmToken({ prompt, forceRefresh });
    if (!token) return false;

    let result = await postToken(role, token);
    if (result === 'stale') {
      console.warn('[FCM] Server rejected the cached token as stale — minting a new one');
      token = await requestFcmToken({ forceRefresh: true });
      if (!token) return false;
      result = await postToken(role, token);
    }
    if (result !== 'ok') {
      console.warn('[FCM] Could not register a valid push token');
      return false;
    }

    // Remember it so logout can deregister this exact device.
    cacheFcmToken(token);
    console.log(`[FCM] Registered token for ${role} successfully`);
    return true;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export const registerUserPushToken = () => registerPushToken('user', { prompt: true });

/**
 * Which account this tab registers push for. The tab's app (driver routes vs
 * the rest) wins, matching how api.js picks the session; when that app has no
 * session, fall back to whichever account is signed in.
 */
function resolveRole(isUserAuthenticated, isDriverAuthenticated) {
  const isDriverRoute = window.location.pathname.startsWith('/driver');
  if (isDriverRoute && isDriverAuthenticated) return 'driver';
  if (!isDriverRoute && isUserAuthenticated) return 'user';
  if (isDriverAuthenticated) return 'driver';
  if (isUserAuthenticated) return 'user';
  return null;
}

export function useFcm() {
  const navigate = useNavigate();
  const { isAuthenticated: isUserAuthenticated } = useUserAuthStore();
  const { isAuthenticated: isDriverAuthenticated } = useDriverAuthStore();
  const { socket } = useSocketStore();

  // Keep the stored token fresh on every sign-in / app open. Silent: the
  // permission prompt is shown only by EnableNotificationsBanner on a tap.
  useEffect(() => {
    const role = resolveRole(isUserAuthenticated, isDriverAuthenticated);
    if (!role) return;
    registerPushToken(role).catch((err) => {
      console.warn('[FCM] FCM registration skipped or failed:', err?.message || err);
    });
  }, [isUserAuthenticated, isDriverAuthenticated]);

  // Foreground FCM messages: mirror into the system tray.
  useEffect(() => {
    const unsubscribe = onFcmMessage((payload) => {
      console.log('[FCM] Received message in foreground:', payload);
      const data = payload.data || {};
      const title = payload.notification?.title || data.title;
      if (!title) return;
      // Already looking at the screen this push points to (e.g. the live
      // tracking page on "driver arrived") — the socket updates it live, so
      // a system notification would just be noise.
      if (data.url && document.visibilityState === 'visible' && window.location.pathname === data.url) {
        return;
      }
      showSystemNotification({
        title,
        body: payload.notification?.body || data.body || '',
        data,
      });
    });
    return unsubscribe;
  }, [isUserAuthenticated, isDriverAuthenticated]);

  // The server tells us when FCM rejected our stored token and it was
  // cleared: mint a fresh one now instead of waiting for the next login.
  useEffect(() => {
    if (!socket) return undefined;
    const onInvalid = () => {
      const role = resolveRole(isUserAuthenticated, isDriverAuthenticated);
      if (!role) return;
      registerPushToken(role, { forceRefresh: true }).catch((err) => {
        console.warn('[FCM] Re-registration after invalid token failed:', err?.message || err);
      });
    };
    socket.on(S2C_EVENTS.PUSH_TOKEN_INVALID, onInvalid);
    return () => socket.off(S2C_EVENTS.PUSH_TOKEN_INVALID, onInvalid);
  }, [socket, isUserAuthenticated, isDriverAuthenticated]);

  // The service worker posts this when a notification is tapped while the
  // app window couldn't be navigated directly — route in-app instead.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      if (event.data?.type === 'NOTIFICATION_CLICK' && event.data.url) {
        navigate(event.data.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
}
