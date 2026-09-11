/**
 * Utilities for city normalization, extraction, and validation.
 * Used to restrict in-city (same-city) bookings for Outstation One-Way trips.
 */

/**
 * Normalizes city name for comparison.
 * @param {string} name
 * @returns {string}
 */
export function normalizeCityName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/\b(city|district|division|nagar|cantonment|cantt|rural|urban)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Extracts a candidate city name from a formatted address string.
 * @param {string} address
 * @returns {string}
 */
export function extractCityFromAddress(address) {
  if (!address || typeof address !== 'string') return '';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return '';

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    // Skip country
    if (/^(india|bharat)$/i.test(part)) continue;
    // Skip state + pin code
    if (
      /\d{6}/.test(part) ||
      /^(madhya pradesh|maharashtra|rajasthan|gujarat|uttar pradesh|delhi|karnataka|punjab|haryana|tamil nadu|telangana|andhra pradesh|kerala|west bengal|bihar|chhattisgarh|jharkhand|odisha|assam|goa|uttarakhand|himachal pradesh)/i.test(
        part
      )
    ) {
      continue;
    }
    const cleaned = part.replace(/\d+/g, '').trim();
    if (cleaned.length >= 3) {
      return cleaned;
    }
  }
  return parts[parts.length - 1] || '';
}

/**
 * Returns a human-friendly display name for a location's city.
 * @param {object|string} location
 * @returns {string}
 */
export function getCityDisplayName(location) {
  if (!location) return '';
  if (location.city && typeof location.city === 'string' && location.city.trim()) {
    return location.city.trim();
  }
  const address =
    location.address || location.formatted_address || (typeof location === 'string' ? location : '');
  return extractCityFromAddress(address) || '';
}

/**
 * Checks whether pickup and destination are in the same city.
 * @param {object|string} pickup
 * @param {object|string} destination
 * @returns {boolean}
 */
export function isSameCity(pickup, destination) {
  if (!pickup || !destination) return false;

  const pickupCity = pickup.city ? normalizeCityName(pickup.city) : '';
  const destCity = destination.city ? normalizeCityName(destination.city) : '';

  // 1. Both have explicitly parsed city fields
  if (pickupCity && destCity) {
    if (pickupCity === destCity) return true;
    if (pickupCity.length >= 4 && destCity.length >= 4) {
      if (pickupCity.includes(destCity) || destCity.includes(pickupCity)) return true;
    }
    return false;
  }

  // 2. Extract city from formatted address strings
  const pickupAddress =
    pickup.address || pickup.formatted_address || (typeof pickup === 'string' ? pickup : '');
  const destAddress =
    destination.address || destination.formatted_address || (typeof destination === 'string' ? destination : '');

  const extractedPickupCity = pickupCity || normalizeCityName(extractCityFromAddress(pickupAddress));
  const extractedDestCity = destCity || normalizeCityName(extractCityFromAddress(destAddress));

  if (extractedPickupCity && extractedDestCity) {
    if (extractedPickupCity === extractedDestCity) return true;
    if (extractedPickupCity.length >= 4 && extractedDestCity.length >= 4) {
      if (extractedPickupCity.includes(extractedDestCity) || extractedDestCity.includes(extractedPickupCity)) {
        return true;
      }
    }
    return false;
  }

  // 3. Fallback: check if pickup city name is present in destination address
  const effectivePickupCity = extractedPickupCity || pickupCity;
  if (effectivePickupCity && effectivePickupCity.length >= 3 && destAddress) {
    const regex = new RegExp(`\\b${effectivePickupCity}\\b`, 'i');
    if (regex.test(destAddress)) {
      if (extractedDestCity && extractedDestCity !== effectivePickupCity) {
        return false;
      }
      return true;
    }
  }

  return false;
}
