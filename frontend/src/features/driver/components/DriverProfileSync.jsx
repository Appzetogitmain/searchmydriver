import { useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useSocketEvent } from '../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../constants/socketEvents';
import useDriverAuthStore from '../../../store/useDriverAuthStore';
import { useDriverProfileStore } from '../../../store/driver/useDriverProfileStore';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';

const PROFILE_KEY = buildCacheKey('driver-profile', {});

/** Fields the whole driver app reads off the persisted auth snapshot. */
const AUTH_MIRRORED_FIELDS = [
  'name',
  'phone',
  'email',
  'profilePicture',
  'city',
  'homeZone',
  'languages',
  'drivingLicense',
  'experienceYears',
  'onboardingStep',
  'approvalStatus',
  'approvalNote',
];

const zoneLabel = (zone) => {
  if (!zone) return null;
  return `${zone.name || ''}${zone.city ? ` (${zone.city})` : ''}`.trim() || null;
};

/**
 * Keeps the driver app's idea of "who am I" in step with the backend.
 *
 * Two copies of the driver can go stale:
 *   1. `useDriverAuthStore.driver` — persisted to localStorage at sign-in and
 *      never refreshed, so an admin edit (service zone, city, approval) was
 *      invisible until the driver logged out and back in.
 *   2. The `useDriverProfileStore` query cache — `createQueryStore` returns
 *      the cached entry forever unless something forces a re-fetch.
 *
 * Mounted once inside `DriverGuard`, this component refreshes both when:
 *   - the backend emits `DRIVER_PROFILE_UPDATED` (admin edited the driver, or
 *     the zone they're assigned to was renamed / re-drawn / removed), and
 *   - the app comes back to the foreground, which covers every change that
 *     landed while the socket was disconnected.
 *
 * Renders nothing.
 */
const DriverProfileSync = () => {
  const isAuthenticated = useDriverAuthStore((s) => s.isAuthenticated);
  const updateDriver = useDriverAuthStore((s) => s.updateDriver);
  const refresh = useDriverProfileStore((s) => s.refresh);

  // Re-read the canonical profile and mirror the fields the rest of the app
  // reads off the persisted auth snapshot.
  const syncProfile = useCallback(async () => {
    try {
      const profile = await refresh(PROFILE_KEY, {});
      if (!profile) return null;

      const patch = {};
      AUTH_MIRRORED_FIELDS.forEach((field) => {
        if (profile[field] !== undefined) patch[field] = profile[field];
      });
      if (Object.keys(patch).length > 0) updateDriver(patch);
      return profile;
    } catch {
      // Offline or an expired token — the next event or foreground pass
      // retries, and the cached copy keeps the UI usable meanwhile.
      return null;
    }
  }, [refresh, updateDriver]);

  // Zone label at the time of the last sync, so we only toast on a real
  // change (the backend also re-emits when only the boundary moved).
  const lastZoneRef = useRef(undefined);

  useSocketEvent(S2C_EVENTS.DRIVER_PROFILE_UPDATED, (payload) => {
    if (!isAuthenticated) return;
    syncProfile().then((profile) => {
      if (!profile) return;
      if (!payload?.fields?.includes('homeZone')) return;

      const label = zoneLabel(profile.homeZone);
      if (lastZoneRef.current !== undefined && lastZoneRef.current !== label) {
        toast.success(
          label
            ? `Service zone updated to ${label}`
            : 'Your service zone was removed by the admin',
        );
      }
      lastZoneRef.current = label;
    });
  });

  // First mount + every return to the foreground.
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    syncProfile().then((profile) => {
      if (profile) lastZoneRef.current = zoneLabel(profile.homeZone);
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') syncProfile();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [isAuthenticated, syncProfile]);

  return null;
};

export default DriverProfileSync;
