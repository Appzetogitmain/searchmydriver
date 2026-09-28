import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MapPin, Loader2, X } from 'lucide-react';
import useUserAuthStore from '../../store/useUserAuthStore';
import useDriverAuthStore from '../../store/useDriverAuthStore';
import useLocationStatusStore, { LOCATION_STATUS } from '../../store/useLocationStatusStore';

// Driver auth / onboarding screens don't need location.
const DRIVER_EXCLUDED = ['/driver/login', '/driver/signup', '/driver/register', '/driver/forgot-password', '/driver/link-phone'];

function getPlatform() {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

/** Manual steps for when the one-tap attempt couldn't fix it. */
function getSteps(status) {
  const platform = getPlatform();
  if (status === LOCATION_STATUS.GPS_OFF) {
    if (platform === 'ios') {
      return ['Open Settings → Privacy & Security → Location Services', 'Turn Location Services on', 'Come back here — we’ll pick it up automatically'];
    }
    return ['Swipe down from the top of your screen', 'Tap the Location (📍) tile to turn it on', 'Come back here — we’ll pick it up automatically'];
  }
  if (status === LOCATION_STATUS.PERMISSION_BLOCKED) {
    if (platform === 'ios') {
      return [
        'Open Settings → Privacy & Security → Location Services and make sure it is on',
        isStandalone()
          ? 'Scroll to Safari Websites → choose "While Using the App"'
          : 'In Safari, tap "aA" in the address bar → Website Settings → Location → Allow',
        'Come back here and tap Try again',
      ];
    }
    if (platform === 'android') {
      return isStandalone()
        ? ['Open Chrome → Settings → Site settings → Location', 'Find SearchMyDriver and set it to Allow', 'Come back here and tap Try again']
        : ['Tap the icon to the left of the web address (ⓘ or 🔒)', 'Tap Permissions → Location → Allow', 'Come back here and tap Try again'];
    }
    return ['Click the icon to the left of the web address', 'Set Location to Allow', 'Come back here and click Try again'];
  }
  return [];
}

const COPY = {
  [LOCATION_STATUS.NEEDS_PERMISSION]: {
    title: 'Allow location access',
    body: 'We use your location to show nearby drivers, set your pickup point and track your trip.',
    cta: 'Enable location',
  },
  [LOCATION_STATUS.GPS_OFF]: {
    title: 'Your phone’s location is off',
    body: 'Turn on location so we can find drivers near you and get your pickup right.',
    cta: 'Turn on location',
  },
  [LOCATION_STATUS.PERMISSION_BLOCKED]: {
    title: 'Location access is blocked',
    body: 'SearchMyDriver needs your location to find nearby drivers and track your trip.',
    cta: 'Try again',
  },
};

/**
 * App-wide location check. Mounted once in App: whenever the customer or
 * driver opens (or returns to) the app, it checks whether location works and,
 * if not, shows a sheet explaining how to turn it on. It re-checks as soon as
 * the user comes back from Settings and closes itself once location works.
 */
export default function LocationGate() {
  const { pathname } = useLocation();
  const isUser = useUserAuthStore((s) => s.isAuthenticated);
  const isDriver = useDriverAuthStore((s) => s.isAuthenticated);
  const { status, checking, sheetOpen, attempted, check, dismissSheet, maybeAutoOpen } =
    useLocationStatusStore();

  const active =
    (isUser && pathname.startsWith('/user')) ||
    (isDriver && pathname.startsWith('/driver') && !DRIVER_EXCLUDED.some((p) => pathname.startsWith(p)));

  // Check on app open, and every time the app comes back to the foreground
  // (e.g. after turning on GPS in quick settings).
  useEffect(() => {
    if (!active) return undefined;
    const run = () => check().then(maybeAutoOpen);
    run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [active, check, maybeAutoOpen]);

  // Browser-level permission changes (e.g. user allows it from site settings).
  useEffect(() => {
    if (!active || !navigator.permissions?.query) return undefined;
    let permStatus = null;
    const onChange = () => check();
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((s) => {
        permStatus = s;
        s.addEventListener?.('change', onChange);
      })
      .catch(() => {});
    return () => permStatus?.removeEventListener?.('change', onChange);
  }, [active, check]);

  const copy = COPY[status];
  if (!active || !sheetOpen || !copy) return null;

  // Blocked needs manual steps straight away; GPS-off shows them once the
  // one-tap attempt didn't fix it (Chrome often shows its own turn-on dialog).
  const steps =
    status === LOCATION_STATUS.PERMISSION_BLOCKED || (status === LOCATION_STATUS.GPS_OFF && attempted)
      ? getSteps(status)
      : [];

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={dismissSheet} />
      <div className="relative bg-white rounded-t-3xl w-full max-w-lg animate-slide-up px-5 pt-3 pb-8">
        <div className="flex justify-center pb-3">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <button
          type="button"
          onClick={dismissSheet}
          aria-label="Close"
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-text-muted"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <MapPin className="w-7 h-7 text-primary" />
          </div>
          <h3 className="text-lg font-bold text-text">{copy.title}</h3>
          <p className="text-sm text-text-muted mt-1 max-w-xs">{copy.body}</p>
        </div>

        {steps.length > 0 && (
          <ol className="mt-5 space-y-2.5">
            {steps.map((step, i) => (
              <li key={step} className="flex items-start gap-3 text-sm text-text">
                <span className="w-6 h-6 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        )}

        <button
          type="button"
          disabled={checking}
          onClick={() => check({ request: true })}
          className="mt-6 w-full py-3.5 rounded-2xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
          {checking ? 'Checking location…' : copy.cta}
        </button>
        <button
          type="button"
          onClick={dismissSheet}
          className="mt-2 w-full py-2.5 text-sm font-semibold text-text-muted"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
