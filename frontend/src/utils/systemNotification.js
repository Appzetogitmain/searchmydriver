/**
 * Show a notification in the phone's / OS notification tray.
 *
 * Goes through the service worker registration because `new Notification()`
 * throws on Android Chrome. The tag is derived from the server notification
 * id, so when the same event arrives both over the socket and as a push, the
 * second one replaces the first instead of showing twice.
 */
export function notificationTag(data = {}) {
  if (data.notificationId) return `notif-${data.notificationId}`;
  if (data.bookingId) return `booking-${data.bookingId}`;
  return undefined;
}

export async function showSystemNotification({ title, body = '', data = {} }) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted' || !title) return;
  const tag = notificationTag(data);
  const options = { body, icon: '/favicon.png', data, ...(tag ? { tag } : {}) };
  try {
    const registration = await navigator.serviceWorker?.getRegistration('/');
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
    new Notification(title, options);
  } catch (err) {
    console.warn('[notify] Could not show system notification:', err?.message || err);
  }
}
