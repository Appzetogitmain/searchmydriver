import mongoose from 'mongoose';
import Zone from '../models/zone.model.js';
import Booking from '../models/booking.model.js';
import { USER_ROLES } from '../constants/roles.js';
import { isSuperAdmin } from '../constants/staffPermissions.js';
import { ApiError } from './apiError.js';

/**
 * Returns the city/zone scoping parameters for a given staff member.
 * - Super Admin (`role: 'admin'`): isScoped = false (unrestricted global access).
 * - Sub Admin (`role: 'sub_admin'`) & Team Member: isScoped = true (restricted to assigned zones and cities).
 */
export async function getStaffScope(staff) {
  if (!staff) {
    return {
      isScoped: true,
      isEmptyScope: true,
      zoneIds: [],
      zoneObjectIds: [],
      cities: [],
      cityRegexes: [],
    };
  }

  if (isSuperAdmin(staff)) {
    return {
      isScoped: false,
      isEmptyScope: false,
      zoneIds: [],
      zoneObjectIds: [],
      cities: [],
      cityRegexes: [],
    };
  }

  const rawZones = staff.assignedZones || [];
  const zoneObjectIds = rawZones
    .map((z) => {
      const idStr = String(z?._id || z || '');
      if (mongoose.Types.ObjectId.isValid(idStr)) {
        return new mongoose.Types.ObjectId(idStr);
      }
      return null;
    })
    .filter(Boolean);

  const zoneIds = zoneObjectIds.map(String);

  // A zone's `city` and its `name` both count as the city it covers: some
  // zones are named after the city people type at signup ("chhatarpur") while
  // `city` holds the geocoded locality ("Malehra"). Matching only `city` hid
  // that zone's own customers from its admin.
  let cities = [];
  if (zoneObjectIds.length > 0) {
    const zones = await Zone.find({ _id: { $in: zoneObjectIds } }).select('city name').lean();
    cities = zones
      .flatMap((z) => [z.city, z.name])
      .map((c) => (c || '').trim())
      .filter(Boolean);
  }

  if (staff.city && typeof staff.city === 'string' && staff.city.trim()) {
    const directCity = staff.city.trim();
    if (!cities.some((c) => c.toLowerCase() === directCity.toLowerCase())) {
      cities.push(directCity);
    }
  }

  // Deduplicate case-insensitively
  const uniqueCities = [];
  for (const c of cities) {
    if (!uniqueCities.some((u) => u.toLowerCase() === c.toLowerCase())) {
      uniqueCities.push(c);
    }
  }

  // Escape so a zone name like "delhi (NCR)" can't break or widen the match.
  const cityRegexes = uniqueCities.map(
    (c) => new RegExp(`^\\s*${c.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'),
  );

  const isEmptyScope = zoneIds.length === 0 && uniqueCities.length === 0;

  return {
    isScoped: true,
    isEmptyScope,
    zoneIds,
    zoneObjectIds,
    cities: uniqueCities,
    cityRegexes,
  };
}

/**
 * Asserts that a staff member has access to a specific driver.
 */
export async function assertStaffCanAccessDriver(staff, driver) {
  if (isSuperAdmin(staff)) return;

  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const scope = await getStaffScope(staff);
  if (scope.isEmptyScope) {
    throw new ApiError(403, 'You do not have access to this driver (no assigned city/zone)');
  }

  const driverCity = (driver.city || driver.address?.city || '').trim();
  const driverHomeZoneId = driver.homeZone ? String(driver.homeZone._id || driver.homeZone) : null;

  const matchesZone = driverHomeZoneId && scope.zoneIds.includes(driverHomeZoneId);
  const matchesCity = driverCity && cityInScope(scope, driverCity);

  if (!matchesZone && !matchesCity) {
    throw new ApiError(403, 'You do not have access to drivers outside your assigned city');
  }
}

/**
 * Asserts that a staff member has access to a specific booking.
 */
export async function assertStaffCanAccessBooking(staff, booking) {
  if (isSuperAdmin(staff)) return;

  if (!booking) {
    throw new ApiError(404, 'Booking not found');
  }

  const scope = await getStaffScope(staff);
  if (scope.isEmptyScope) {
    throw new ApiError(403, 'You do not have access to this booking (no assigned city/zone)');
  }

  const bookingZoneIds = (booking.zoneIds || []).map((z) => String(z?._id || z));
  const hasOverlap = bookingZoneIds.some((id) => scope.zoneIds.includes(id));
  const bookingCity = (booking.city || booking.pickup?.city || '').trim();
  const matchesCity = bookingCity && cityInScope(scope, bookingCity);

  if (!hasOverlap && !matchesCity) {
    throw new ApiError(403, 'You do not have access to bookings outside your assigned city/zone');
  }
}

/** True when `city` is one of the staff member's cities (case/space-insensitive). */
export function cityInScope(scope, city) {
  const value = String(city || '').trim().toLowerCase();
  return Boolean(value) && scope.cities.some((c) => c.toLowerCase() === value);
}

/**
 * Mongo filter for the customers a scoped staff member may see.
 *
 * A customer belongs to the city on their profile — NOT to every city they
 * have ever taken a ride in. (Previously a Chhatarpur customer who booked one
 * trip in Indore showed up for the Indore admin.) Only customers with no city
 * on their profile fall back to where their bookings were made.
 *
 * Returns `null` for unscoped (super admin) staff, and a filter that matches
 * nothing when the staff member has no city/zone at all.
 */
export async function buildUserScopeFilter(scope) {
  if (!scope.isScoped) return null;
  if (scope.isEmptyScope) return { _id: { $in: [] } };

  const conditions = [];
  if (scope.cityRegexes.length > 0) {
    conditions.push({ city: { $in: scope.cityRegexes } });
  }
  if (scope.zoneObjectIds.length > 0) {
    const bookedHereIds = await Booking.distinct('userId', {
      zoneIds: { $in: scope.zoneObjectIds },
    });
    if (bookedHereIds.length > 0) {
      conditions.push({
        _id: { $in: bookedHereIds },
        $or: [{ city: { $exists: false } }, { city: null }, { city: /^\s*$/ }],
      });
    }
  }
  return conditions.length ? { $or: conditions } : { _id: { $in: [] } };
}

/** Mongo filter for the drivers a scoped staff member may see (null = unscoped). */
export function buildDriverScopeFilter(scope) {
  if (!scope.isScoped) return null;
  if (scope.isEmptyScope) return { _id: { $in: [] } };
  const conditions = [];
  if (scope.cityRegexes.length > 0) {
    conditions.push({ city: { $in: scope.cityRegexes } });
    conditions.push({ 'address.city': { $in: scope.cityRegexes } });
  }
  if (scope.zoneObjectIds.length > 0) {
    conditions.push({ homeZone: { $in: scope.zoneObjectIds } });
  }
  return conditions.length ? { $or: conditions } : { _id: { $in: [] } };
}

/**
 * Asserts that a staff member may view / act on a specific customer.
 * Same rule as `buildUserScopeFilter`: the customer's profile city decides;
 * customers without a city fall back to where they've booked.
 */
export async function assertStaffCanAccessUser(staff, user) {
  if (isSuperAdmin(staff)) return;
  if (!user) throw new ApiError(404, 'User not found');

  const scope = await getStaffScope(staff);
  if (scope.isEmptyScope) {
    throw new ApiError(403, 'You do not have access to this user (no assigned city/zone)');
  }

  const userCity = String(user.city || '').trim();
  if (userCity) {
    if (cityInScope(scope, userCity)) return;
  } else if (scope.zoneObjectIds.length > 0) {
    const bookedHere = await Booking.exists({
      userId: user._id,
      zoneIds: { $in: scope.zoneObjectIds },
    });
    if (bookedHere) return;
  }
  throw new ApiError(403, 'You do not have access to users outside your assigned city');
}

/** True when a staff member may access this driver (non-throwing variant). */
export async function staffCanAccessDriver(staff, driver) {
  try {
    await assertStaffCanAccessDriver(staff, driver);
    return true;
  } catch {
    return false;
  }
}
