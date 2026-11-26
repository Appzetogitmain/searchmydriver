import toast from 'react-hot-toast';
import useCallStore from '../store/useCallStore';
import useSocketStore from '../store/useSocketStore';
import { canUseAppCalling } from '../hooks/useWebRTC';

/** `tel:` link for an Indian mobile (adds +91 to bare 10-digit numbers). */
export function telHref(phone) {
  if (!phone) return null;
  const raw = String(phone).trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+91${digits}`;
  return `tel:+${digits}`;
}

/**
 * The one entry point for every "Call" button on a trip.
 *
 * Prefers the in-app (WebRTC) call. Falls back to the phone dialer only when
 * in-app calling can't work here (insecure context, unsupported browser, or
 * socket offline) and a number is known.
 */
export function placeCall({ bookingId, name, photo, phone }) {
  const { startCall, callState } = useCallStore.getState();
  if (callState !== 'idle') return;

  const socketReady = Boolean(useSocketStore.getState().socket?.connected);
  if (bookingId && startCall && canUseAppCalling() && socketReady) {
    startCall(bookingId, name, photo);
    return;
  }

  const href = telHref(phone);
  if (href) {
    window.location.href = href;
    return;
  }
  toast.error(socketReady ? 'Calling is not available on this device.' : 'You are offline. Reconnecting…');
}
