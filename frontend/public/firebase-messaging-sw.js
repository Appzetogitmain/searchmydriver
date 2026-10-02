// Tap-to-open handler. Registered BEFORE importing the Firebase SDK so it runs
// ahead of the SDK's own click listener and can stop it — otherwise both would
// react to the same tap.
self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();

  // Notifications we show ourselves carry `data.url`; ones the Firebase SDK
  // auto-displays wrap the payload in `data.FCM_MSG`.
  const data = event.notification.data || {};
  const fcmData = data.FCM_MSG?.data || {};
  const path = data.url || fcmData.url || '/';
  const targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Reuse an open app window if there is one: bring it forward and route it.
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        if ('navigate' in existing) {
          try {
            await existing.navigate(targetUrl);
          } catch {
            // navigate() fails for uncontrolled clients — fall back to a message
            existing.postMessage({ type: 'NOTIFICATION_CLICK', url: path });
          }
        }
        return;
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});

// Give the service worker access to Firebase Messaging.
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in query params.
// This allows us to load configurations dynamically from the frontend.
const urlParams = new URLSearchParams(self.location.search);
const apiKey = urlParams.get('apiKey');
const authDomain = urlParams.get('authDomain');
const databaseURL = urlParams.get('databaseURL');
const projectId = urlParams.get('projectId');
const storageBucket = urlParams.get('storageBucket');
const messagingSenderId = urlParams.get('messagingSenderId');
const appId = urlParams.get('appId');

if (messagingSenderId && apiKey && projectId) {
  firebase.initializeApp({
    apiKey,
    authDomain,
    databaseURL,
    projectId,
    storageBucket,
    messagingSenderId,
    appId
  });

  if (firebase.messaging.isSupported()) {
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      console.log('[firebase-messaging-sw.js] Received background message ', payload);
      // Messages with a `notification` block are already displayed by the
      // Firebase SDK — showing another one here would duplicate it.
      if (payload.notification) return;

      const data = payload.data || {};
      const notificationTitle = data.title || 'SearchMyDriver';
      const notificationOptions = {
        body: data.body || '',
        icon: '/favicon.png',
        data,
        ...(data.notificationId
          ? { tag: `notif-${data.notificationId}` }
          : data.bookingId
            ? { tag: `booking-${data.bookingId}`, renotify: true }
            : {}),
      };

      self.registration.showNotification(notificationTitle, notificationOptions);
    });
  } else {
    console.warn('[firebase-messaging-sw.js] Messaging is not supported in this environment');
  }
} else {
  console.warn('[firebase-messaging-sw.js] Incomplete config params passed to SW');
}
