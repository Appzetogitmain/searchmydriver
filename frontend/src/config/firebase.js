import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

/**
 * Lazy Firebase JS SDK initializer.
 *
 * Phase 2 wires the config; Phase 3 starts using the Realtime Database for
 * live driver locations. If env vars are missing the helpers return `null`
 * so the rest of the app still loads (cleanly degraded experience).
 *
 * Required `frontend/.env` keys (matches Firebase console "web app" output):
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_DATABASE_URL  ← must point to the **Realtime Database**, not Firestore
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *   VITE_FIREBASE_VAPID_KEY      ← Optional: Public VAPID key from Cloud Messaging tab
 */

const env = import.meta.env;

function buildFirebaseConfig() {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL || (env.VITE_FIREBASE_PROJECT_ID ? `https://${env.VITE_FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com` : ''),
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const isPlaceholder = !config.apiKey || config.apiKey === 'your_firebase_api_key';
  const missing = isPlaceholder
    ? ['apiKey (placeholder detected)']
    : Object.entries(config)
        .filter(([k, v]) => !v && k !== 'databaseURL')
        .map(([k]) => k);
  return { config, missing, isPlaceholder };
}

let appInstance = null;
let dbInstance = null;
let messagingInstance = null;
let warned = false;

function warnOnce(message) {
  if (warned) return;
  warned = true;
  console.warn(`[firebase] ${message}`);
}

/**
 * Returns the singleton Firebase app, or null when the config is incomplete.
 * Safe to call from any module-load context.
 */
export function getFirebaseApp() {
  if (appInstance) return appInstance;

  const { config, missing } = buildFirebaseConfig();
  if (missing.length) {
    warnOnce(
      `Firebase config incomplete (missing: ${missing.join(', ')}). ` +
        `Live driver location features will be disabled.`,
    );
    return null;
  }

  appInstance = getApps()[0] || initializeApp(config);
  return appInstance;
}

/**
 * Returns the singleton Realtime Database instance, or null when Firebase
 * is not configured. Subscribe to refs like:
 *
 *   import { ref, onValue } from 'firebase/database';
 *   const db = getRealtimeDb();
 *   if (db) onValue(ref(db, `drivers/${id}/location`), ...);
 */
export function getRealtimeDb() {
  if (dbInstance) return dbInstance;
  const app = getFirebaseApp();
  if (!app) return null;
  dbInstance = getDatabase(app);
  return dbInstance;
}

/**
 * Returns the singleton FCM Messaging instance, or null.
 */
export function getFcmMessaging() {
  if (messagingInstance) return messagingInstance;
  const app = getFirebaseApp();
  if (!app) return null;

  const isMessagingSupported = 
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  if (!isMessagingSupported) {
    warnOnce('FCM is not supported in this browser environment.');
    return null;
  }

  try {
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (err) {
    console.warn('[firebase] FCM not supported in this browser:', err.message);
    return null;
  }
}

/** True when Firebase is fully wired. Use for feature flagging UI. */
export function isFirebaseConfigured() {
  return getFirebaseApp() !== null;
}

const SW_PATH = '/firebase-messaging-sw.js';

/** ArrayBuffer → unpadded base64url, the encoding VAPID keys are written in. */
function toBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Unregister any service worker on our scope that isn't ours for THIS
 * Firebase project. Every app served from the same origin (e.g. another
 * project on the same localhost port) shares one service-worker slot and one
 * push subscription; a leftover worker from elsewhere keeps receiving — and
 * swallowing — our pushes.
 */
async function removeForeignServiceWorkers(senderId) {
  const scope = new URL('/', window.location.origin).href;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map(async (reg) => {
      if (reg.scope !== scope) return;
      const script = (reg.active || reg.waiting || reg.installing)?.scriptURL;
      if (!script) return;
      const url = new URL(script);
      const ours = url.pathname === SW_PATH && url.searchParams.get('messagingSenderId') === senderId;
      if (!ours) {
        console.warn('[firebase] Unregistering foreign service worker:', url.pathname);
        await reg.unregister();
      }
    }),
  );
}

/** Resolve once `registration` has an activated worker (10s timeout). */
function waitForActiveWorker(registration, timeoutMs = 10000) {
  if (registration.active) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const worker = registration.installing || registration.waiting;
    if (!worker) {
      reject(new Error('No service worker installing'));
      return;
    }
    const timer = setTimeout(() => reject(new Error('Service worker did not activate in time')), timeoutMs);
    const onChange = () => {
      if (worker.state === 'activated') {
        clearTimeout(timer);
        worker.removeEventListener('statechange', onChange);
        resolve();
      } else if (worker.state === 'redundant') {
        clearTimeout(timer);
        worker.removeEventListener('statechange', onChange);
        // Replaced by a newer worker that is already active — that's fine.
        if (registration.active) resolve();
        else reject(new Error('Service worker became redundant'));
      }
    };
    worker.addEventListener('statechange', onChange);
  });
}

/**
 * Drop the push subscription when it can't produce a token for our project.
 *
 * Firebase's getToken() reuses ANY existing push subscription on the worker
 * without checking which VAPID key created it. If another app subscribed this
 * origin with its own key, the token Firebase mints is bound to that other
 * project and every send from our backend fails with "SenderId mismatch".
 * Unsubscribing forces getToken() to subscribe again with our key and mint a
 * brand-new token.
 */
async function dropMismatchedSubscription(registration, vapidKey, force) {
  const sub = await registration.pushManager.getSubscription();
  if (!sub) return;
  const subKey = sub.options?.applicationServerKey;
  const mismatched = Boolean(
    vapidKey && subKey && toBase64Url(subKey) !== vapidKey.replace(/=+$/, ''),
  );
  if (force || mismatched) {
    if (mismatched) console.warn('[firebase] Push subscription was made with another VAPID key — resubscribing');
    await sub.unsubscribe();
  }
}

/**
 * Returns this device's FCM registration token, or null.
 *
 * Registers the background service worker (config passed as query params).
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.prompt=false]       ask for notification permission if
 *   not decided yet. Only pass true from a user tap — iPhone rejects the prompt
 *   otherwise and Chrome starts silently blocking repeated prompts.
 * @param {boolean} [opts.forceRefresh=false] discard the cached token and push
 *   subscription and mint a new token. Used when the server reports the
 *   current one as dead; without it Firebase hands back the same cached token
 *   for up to a week.
 */
export async function requestFcmToken({ prompt = false, forceRefresh = false } = {}) {
  const app = getFirebaseApp();
  if (!app) return null;

  const { config } = buildFirebaseConfig();
  const qs = new URLSearchParams({
    apiKey: config.apiKey || '',
    authDomain: config.authDomain || '',
    databaseURL: config.databaseURL || '',
    projectId: config.projectId || '',
    storageBucket: config.storageBucket || '',
    messagingSenderId: config.messagingSenderId || '',
    appId: config.appId || '',
  }).toString();

  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    console.warn('[firebase] FCM not supported in this browser environment.');
    return null;
  }

  let permission = Notification.permission;
  if (permission === 'default' && prompt) {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    if (prompt) console.warn('[firebase] Notification permission not granted');
    return null;
  }

  try {
    await removeForeignServiceWorkers(config.messagingSenderId);
    const registration = await navigator.serviceWorker.register(`${SW_PATH}?${qs}`, { scope: '/' });
    // Firebase only waits for activation when it registers its own default
    // worker. With a registration passed in, getToken() subscribes straight
    // away, and on a fresh install (first visit, cleared site data, updated
    // worker) that fails with "Subscription failed - no active Service Worker"
    // — so no token is ever saved.
    await waitForActiveWorker(registration);

    const messaging = getFcmMessaging();
    if (!messaging) return null;

    const vapidKey = env.VITE_FIREBASE_VAPID_KEY;
    await dropMismatchedSubscription(registration, vapidKey, forceRefresh);

    const tokenOptions = { serviceWorkerRegistration: registration };
    if (vapidKey) tokenOptions.vapidKey = vapidKey;

    const token = await getToken(messaging, tokenOptions);
    return token;
  } catch (err) {
    console.error('[firebase] Error retrieving FCM Token:', err);
    return null;
  }
}

/**
 * Expose onMessage listener for foreground messages.
 */
export function onFcmMessage(callback) {
  const messaging = getFcmMessaging();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
