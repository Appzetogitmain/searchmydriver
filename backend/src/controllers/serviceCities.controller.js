import Zone from '../models/zone.model.js';
import WebCity from '../models/webCity.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { getStaffScope } from '../utils/staffScope.util.js';

/**
 * Returns distinct active cities where services are available across the platform.
 * Sourced from:
 * 1. Active operational zones (`Zone.find({ isActive: true })`)
 * 2. Active website cities (`WebCity.find({ isActive: true })`)
 *
 * If the caller is a city/zone-scoped sub_admin, results are restricted to their assigned cities.
 */
export const getActiveServiceCities = asyncHandler(async (req, res) => {
  const staffScope = await getStaffScope(req.staff);

  // If scoped staff has empty scope (no assigned city/zone), return empty list
  if (staffScope.isScoped && staffScope.isEmptyScope) {
    return res.status(200).json(new ApiResponse(200, [], 'Active service cities fetched successfully'));
  }

  // 1. Fetch distinct cities from active zones
  const activeZoneCities = await Zone.find({ isActive: true })
    .distinct('city')
    .then((cities) => cities.filter(Boolean).map((c) => c.trim()));

  // 2. Fetch distinct names from active web cities
  const activeWebCities = await WebCity.find({ isActive: true })
    .distinct('name')
    .then((cities) => cities.filter(Boolean).map((c) => c.trim()));

  // Merge and deduplicate case-insensitively
  const cityMap = new Map();
  for (const c of [...activeZoneCities, ...activeWebCities]) {
    const trimmed = c.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (!cityMap.has(lower)) {
      // Capitalize first letter of each word nicely if not already
      const formatted = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      cityMap.set(lower, formatted);
    }
  }

  let finalCities = Array.from(cityMap.values());

  // If sub-admin / team-member is scoped, restrict strictly to their allowed cities
  if (staffScope.isScoped && staffScope.cities.length > 0) {
    const allowedLower = new Set(staffScope.cities.map((c) => c.toLowerCase()));
    finalCities = finalCities.filter((c) => allowedLower.has(c.toLowerCase()));

    // Ensure all assigned cities are present even if not yet in Zone/WebCity
    for (const assignedCity of staffScope.cities) {
      if (!allowedLower.has(assignedCity.toLowerCase())) {
        finalCities.push(assignedCity);
      }
    }
  }

  // Sort alphabetically
  finalCities.sort((a, b) => a.localeCompare(b));

  return res.status(200).json(
    new ApiResponse(200, finalCities, 'Active service cities fetched successfully')
  );
});
