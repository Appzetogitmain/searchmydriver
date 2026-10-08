import { create } from 'zustand';
import { primeGeolocationCache } from '../hooks/useGeolocation';

/**
 * Single source of truth for "can this device give us a location right now?".
 *
 *   ok                  – we have a fix
 *   needs_permission    – browser hasn't asked yet
 *   permission_blocked  – user (or iOS Location Services) denied it
 *   gps_off             – permission granted but the phone's location is off
 *   unsupported         – no geolocation API at all
 *
 * A web app can't switch the phone's GPS on itself, so the job here is to
 * detect the problem precisely, let the UI explain the fix, and re-check the
 * moment the user comes back so the app recovers without a reload.
 */
export const LOCATION_STATUS = Object.freeze({
  UNKNOWN: 'unknown',
  OK: 'ok',
  NEEDS_PERMISSION: 'needs_permission',
  PERMISSION_BLOCKED: 'permission_blocked',
  GPS_OFF: 'gps_off',
  UNSUPPORTED: 'unsupported',
});

function getPosition(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function queryPermission() {
  try {
    if (!navigator.permissions?.query) return null;
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return null; // older Safari — fall through to a real request
  }
}

let inflight = null;

const useLocationStatusStore = create((set, get) => ({
  status: LOCATION_STATUS.UNKNOWN,
  checking: false,
  sheetOpen: false,
  dismissed: false,
  // True once the user pressed "Enable" and it still failed — the sheet then
  // shows manual steps instead of only the button.
  attempted: false,

  /**
   * Re-evaluate location. `request: true` actually asks for a position even
   * when permission hasn't been granted yet (shows the browser prompt) —
   * call it from a tap so iOS/Chrome allow the prompt.
   */
  check: ({ request = false } = {}) => {
    if (inflight) return inflight;
    inflight = (async () => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        set({ status: LOCATION_STATUS.UNSUPPORTED });
        return LOCATION_STATUS.UNSUPPORTED;
      }
      set({ checking: true });

      const perm = await queryPermission();
      let next;
      if (perm === 'denied') {
        next = LOCATION_STATUS.PERMISSION_BLOCKED;
      } else if (perm === 'prompt' && !request) {
        next = LOCATION_STATUS.NEEDS_PERMISSION;
      } else {
        try {
          const pos = await getPosition({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 });
          primeGeolocationCache(pos);
          next = LOCATION_STATUS.OK;
        } catch (err) {
          if (err?.code === 1) {
            next = LOCATION_STATUS.PERMISSION_BLOCKED;
          } else if (err?.code === 3) {
            // High-accuracy timeouts also happen indoors with GPS on — retry
            // with network location before calling it "GPS off".
            try {
              const pos = await getPosition({ enableHighAccuracy: false, timeout: 8_000, maximumAge: 5 * 60_000 });
              primeGeolocationCache(pos);
              next = LOCATION_STATUS.OK;
            } catch (err2) {
              next = err2?.code === 1 ? LOCATION_STATUS.PERMISSION_BLOCKED : LOCATION_STATUS.GPS_OFF;
            }
          } else {
            next = LOCATION_STATUS.GPS_OFF; // POSITION_UNAVAILABLE
          }
        }
      }

      set({
        status: next,
        checking: false,
        ...(next === LOCATION_STATUS.OK ? { sheetOpen: false, attempted: false } : {}),
        ...(request && next !== LOCATION_STATUS.OK ? { attempted: true } : {}),
      });
      return next;
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  },

  /** Open the "enable location" sheet (e.g. from an in-page chip). */
  openSheet: () => set({ sheetOpen: true }),

  /** User closed the sheet — don't auto-open it again this app session. */
  dismissSheet: () => set({ sheetOpen: false, dismissed: true }),

  /** Auto-open on app start / resume, unless dismissed or already fine. */
  maybeAutoOpen: () => {
    const { status, dismissed } = get();
    const needsFix = status !== LOCATION_STATUS.OK
      && status !== LOCATION_STATUS.UNKNOWN
      && status !== LOCATION_STATUS.UNSUPPORTED;
    if (needsFix && !dismissed) set({ sheetOpen: true });
  },
}));

export default useLocationStatusStore;
