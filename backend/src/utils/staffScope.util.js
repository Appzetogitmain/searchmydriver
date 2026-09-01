import mongoose from 'mongoose';
import Zone from '../models/zone.model.js';
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

  let cities = [];
  if (zoneObjectIds.length > 0) {
    const zones = await Zone.find({ _id: { $in: zoneObjectIds } }).select('city name').lean();
    cities = zones.map((z) => (z.city || '').trim()).filter(Boolean);
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

  const cityRegexes = uniqueCities.map((c) => new RegExp(`^${c.trim()}$`, 'i'));

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
  const matchesCity =
    driverCity &&
    scope.cities.some((c) => c.toLowerCase() === driverCity.toLowerCase());

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

  if (!hasOverlap && scope.zoneIds.length > 0) {
    throw new ApiError(403, 'You do not have access to bookings outside your assigned city/zone');
  }
}
