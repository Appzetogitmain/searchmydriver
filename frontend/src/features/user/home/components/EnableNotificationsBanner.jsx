import { useState } from 'react';
import { BellRing, Share, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { registerUserPushToken } from '../../../../hooks/useFcm';

const DISMISS_KEY = 'smd:notif-banner-dismissed';

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function detectMode() {
  if (typeof window === 'undefined') return null;
  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  // iPhone only supports web push for apps added to the Home Screen.
  if (isIos && !isStandalone) return 'ios-install';
  const supported =
    'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  if (supported && Notification.permission === 'default') return 'enable';
  return null;
}

/**
 * Asks the customer to turn on push notifications so alerts like
 * "Your driver has arrived" reach their phone even when the app is closed.
 * On iPhone (not yet installed) it explains how to add the app to the
 * Home Screen first, since iOS only allows web push for installed apps.
 */
const EnableNotificationsBanner = () => {
  const [mode, setMode] = useState(() => (readDismissed() ? null : detectMode()));
  const [busy, setBusy] = useState(false);

  if (!mode) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // storage unavailable — banner just comes back next visit
    }
    setMode(null);
  };

  const handleEnable = async () => {
    setBusy(true);
    try {
      const ok = await registerUserPushToken();
      if (ok) {
        toast.success('Notifications enabled');
        setMode(null);
      } else if ('Notification' in window && Notification.permission === 'denied') {
        toast.error('Notifications are blocked. Allow them in your browser settings.');
        setMode(null);
      } else {
        toast.error('Could not enable notifications. Please try again.');
      }
    } catch {
      toast.error('Could not enable notifications. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative rounded-2xl border border-primary/20 bg-primary/5 p-4 pr-10">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2.5 right-2.5 p-1 rounded-full text-text-muted hover:bg-black/5"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 shrink-0 rounded-xl bg-primary/15 flex items-center justify-center">
          <BellRing className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">Get driver alerts on your phone</p>
          {mode === 'ios-install' ? (
            <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
              To get notified when your driver arrives, tap{' '}
              <Share className="inline w-3.5 h-3.5 -mt-0.5" /> <strong>Share</strong> →{' '}
              <strong>Add to Home Screen</strong>, then open SearchMyDriver from your Home Screen.
            </p>
          ) : (
            <>
              <p className="text-xs text-text-muted mt-0.5">
                Know the moment your driver is assigned and arrives, even when the app is closed.
              </p>
              <button
                type="button"
                onClick={handleEnable}
                disabled={busy}
                className="mt-2.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-60"
              >
                {busy ? 'Enabling…' : 'Enable notifications'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnableNotificationsBanner;
