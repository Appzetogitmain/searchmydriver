import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useUserAuthStore from '../store/useUserAuthStore';
import useDriverAuthStore from '../store/useDriverAuthStore';
import { requestFcmToken, onFcmMessage } from '../config/firebase';
import api from '../utils/api';

/**
 * Show a system notification while the app is open. Uses the service worker
 * registration because `new Notification()` throws on Android Chrome.
 */
async function showForegroundNotification({ title, body, data = {} }) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    console.warn('[FCM] Notification permission is not granted; cannot display foreground push.');
    return;
  }
  const options = {
    body,
    icon: '/favicon.png',
    data,
    ...(data.bookingId ? { tag: `booking-${data.bookingId}`, renotify: true } : {}),
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration('/');
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
    new Notification(title, options);
  } catch (err) {
    console.warn('[FCM] Could not show foreground notification:', err?.message || err);
  }
}

/**
 * Ask for notification permission (if needed), get this device's FCM token
 * and save it on the logged-in customer. Must be called from a tap on iPhone,
 * where the permission prompt is only allowed after a user gesture.
 * Returns true when the device is registered for push.
 */
export async function registerUserPushToken() {
  const { isFirebaseConfigured } = await import('../config/firebase');
  if (!isFirebaseConfigured()) return false;
  const token = await requestFcmToken();
  if (!token) return false;
  await api.post('/auth/fcm-token', { token });
  console.log('[FCM] Registered token for user successfully');
  return true;
}

export function useFcm() {
  const navigate = useNavigate();
  const { isAuthenticated: isUserAuthenticated } = useUserAuthStore();
  const { isAuthenticated: isDriverAuthenticated } = useDriverAuthStore();

  useEffect(() => {
    let active = true;

    async function registerPush() {
      if (!isUserAuthenticated && !isDriverAuthenticated) return;

      try {
        const { isFirebaseConfigured } = await import('../config/firebase');
        if (!isFirebaseConfigured()) return;

        console.log('[FCM] Requesting FCM registration...');
        const token = await requestFcmToken();
        if (!token || !active) return;

        console.log('[FCM] Received token:', token);

        const isDriverRoute = window.location.pathname.startsWith('/driver');
        if (isDriverRoute && isDriverAuthenticated) {
          await api.post('/driver/fcm-token', { token });
          console.log('[FCM] Registered token for driver successfully');
        } else if (!isDriverRoute && isUserAuthenticated) {
          await api.post('/auth/fcm-token', { token });
          console.log('[FCM] Registered token for user successfully');
        }
      } catch (err) {
        console.warn('[FCM] FCM registration skipped or failed:', err?.message || err);
      }
    }

    registerPush();

    // Setup foreground message listener
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
      showForegroundNotification({
        title,
        body: payload.notification?.body || data.body || '',
        data,
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [isUserAuthenticated, isDriverAuthenticated]);

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
