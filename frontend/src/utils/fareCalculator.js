/**
 * Client-side mirror of backend `pricing.service.js`.
 * Keep math in sync with backend; this exists for instant admin preview
 * and frontend booking review (no HTTP round-trip needed).
 */
import { SERVICE_TYPES } from '../constants/serviceTypes';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function minutesOfDay(date, timeZone = 'Asia/Kolkata') {
  const at = date ? new Date(date) : new Date();
  if (Number.isNaN(at.getTime())) return 0;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(at);
    let hour = 0;
    let minute = 0;
    for (const part of parts) {
      if (part.type === 'hour') hour = parseInt(part.value, 10);
      if (part.type === 'minute') minute = parseInt(part.value, 10);
    }
    return (hour % 24) * 60 + minute;
  } catch {
    return at.getHours() * 60 + at.getMinutes();
  }
}

export function parseHHmm(s, fallback = '22:00') {
  if (!s && !fallback) return 0;
  const str = String(s || fallback).trim().toLowerCase();
  const match = str.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const meridian = match[3];
    if (meridian === 'pm' && h < 12) h += 12;
    if (meridian === 'am' && h === 12) h = 0;
    return (h % 24) * 60 + m;
  }
  const [h, m] = (s || fallback).split(':').map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

export function isNightRideAt(date, nightConfig) {
  if (!nightConfig?.enabled) return false;
  const start = parseHHmm(nightConfig.startTime, '22:00');
  const end = parseHHmm(nightConfig.endTime, '06:00');
  if (start === end) return false;
  const cur = minutesOfDay(date);
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

export function rideCoversNightWindow(startAt, durationHours, nightConfig) {
  if (!nightConfig?.enabled) return false;
  const duration = Math.max(0, Math.ceil(Number(durationHours) || 0));
  if (!duration) return isNightRideAt(startAt, nightConfig);
  const startMs = startAt ? new Date(startAt).getTime() : Date.now();
  const stepMs = 15 * 60 * 1000;
  const totalMs = duration * 60 * 60 * 1000;
  for (let t = 0; t <= totalMs; t += stepMs) {
    if (isNightRideAt(new Date(startMs + t), nightConfig)) return true;
  }
  return false;
}

export function isLongDurationNight(bookedHours, nightConfig) {
  if (!nightConfig?.enabled) return false;
  const threshold = Number(nightConfig.thresholdHours) || 0;
  if (threshold <= 0) return false;
  return Number(bookedHours) >= threshold;
}

function applySubscriptionDiscount(subtotal, subscription) {
  if (!subscription) return 0;
  const minAmount = Number(subscription.bookingDiscountMinAmount) || 0;
  if (subtotal < minAmount) return 0;
  const value = subscription.bookingDiscountValue || 0;
  if (value <= 0) return 0;
  const discount =
    subscription.bookingDiscountType === 'percentage'
      ? (subtotal * value) / 100
      : value;
  return Math.min(round2(discount), round2(subtotal));
}

export function calculateSubscriptionCheckout(plan) {
  const basePrice = round2(Number(plan?.price) || 0);
  const serviceChargePercent = Number(plan?.serviceChargePercent) || 0;
  const gstPercent = plan?.gstPercent != null ? Number(plan.gstPercent) : 18;
  const platformSharePercent = Number(plan?.platformSharePercent ?? 50);
  const driverSharePercent = Number(plan?.driverSharePercent ?? 50);
  const serviceCharge = round2((basePrice * serviceChargePercent) / 100);
  const gstAmount = round2(((basePrice + serviceCharge) * gstPercent) / 100);
  const totalPayable = round2(basePrice + serviceCharge + gstAmount);
  const platformShareRupees = round2((basePrice * platformSharePercent) / 100);
  const driverShareRupees = round2((basePrice * driverSharePercent) / 100);
  return {
    basePrice,
    serviceCharge,
    serviceChargePercent,
    gstAmount,
    gstPercent,
    totalPayable,
    platformSharePercent,
    driverSharePercent,
    platformShareRupees,
    driverShareRupees,
  };
}

/**
 * Mirror of backend `pricing.service.js#applyPlatformLayers`. See the
 * backend doc-comment for the full reasoning — short version:
 *
 *   `allowancePassThrough` is the food + stay allowance portion of the
 *   subtotal. Platform commission is NEVER applied to it; those rupees
 *   flow 1:1 to the driver. Service charge + GST still hit the full
 *   subtotal — they're customer-facing fees, not platform-vs-driver
 *   math.
 */
function applyPlatformLayers(subtotal, pricing, subscription, allowancePassThrough = 0) {
  const serviceChargePercent = pricing.serviceChargePercent || 0;
  const gstPercent = pricing.gstPercent != null && pricing.gstPercent > 0 ? pricing.gstPercent : 18;
  const serviceCharge = (subtotal * serviceChargePercent) / 100;
  const gstAmount = (subtotal * gstPercent) / 100;
  const subscriptionDiscount = applySubscriptionDiscount(subtotal, subscription);
  const totalPayable = Math.max(0, subtotal + gstAmount - subscriptionDiscount);

  const platformCommissionPercent = pricing.platformCommissionPercent || 0;
  const passThrough = Math.max(0, Math.min(Number(allowancePassThrough) || 0, subtotal));
  const commissionableSubtotal = Math.max(0, subtotal - passThrough);
  // Service-charge rate applied to the COMMISSIONABLE subtotal only, so the
  // food / stay allowance reaches the driver untouched. Must stay identical
  // to the backend — see `applyPlatformLayers` in pricing.service.js.
  const platformCommission = (commissionableSubtotal * serviceChargePercent) / 100;
  const driverFareEarning = Math.max(0, commissionableSubtotal - platformCommission);
  const driverAllowanceEarning = passThrough;
  const driverEarning = Math.max(0, driverFareEarning + driverAllowanceEarning);

  return {
    serviceCharge: round2(serviceCharge),
    serviceChargePercent,
    gstAmount: round2(gstAmount),
    gstPercent,
    subscriptionDiscount: round2(subscriptionDiscount),
    totalPayable: round2(totalPayable),
    platformCommission: round2(platformCommission),
    platformCommissionPercent,
    commissionableSubtotal: round2(commissionableSubtotal),
    allowancePassThrough: round2(passThrough),
    driverFareEarning: round2(driverFareEarning),
    driverAllowanceEarning: round2(driverAllowanceEarning),
    driverEarning: round2(driverEarning),
  };
}

export function calculateHourlyFare({
  pricing,
  slab = null,
  actualDurationMin = null,
  bookedHours = null,
  isNightRide = false,
  waitingMinutes = 0,
  tollParking = 0,
  subscription = null,
  tripType = 'round_trip',
  estimatedKm = 0,
} = {}) {
  if (!pricing) return null;

  const slabPrice = slab?.price ?? 0;
  const slabMaxHours = slab?.maxHours ?? bookedHours ?? 0;

  let extraHours = 0;
  let extraHourCharge = 0;
  if (actualDurationMin != null && slabMaxHours > 0) {
    const overflowMin = Math.max(0, actualDurationMin - slabMaxHours * 60);
    extraHours = Math.ceil(overflowMin / 60);
    extraHourCharge = extraHours * (pricing.extraHourCharge || 0);
  }

  const freeWait = pricing.waitingCharge?.freeWaitingMinutes ?? 0;
  const perMin = pricing.waitingCharge?.chargePerMinute ?? 0;
  const billableWait = Math.max(0, (waitingMinutes || 0) - freeWait);
  const waitingCharge = billableWait * perMin;

  let nightCharge = 0;
  let nightChargeTriggered = false;
  if (pricing.nightCharge?.enabled) {
    const longRide = isLongDurationNight(bookedHours ?? slabMaxHours, pricing.nightCharge);
    if (isNightRide || longRide) {
      nightChargeTriggered = true;
      nightCharge =
        pricing.nightCharge.type === 'percentage'
          ? (slabPrice * (pricing.nightCharge.amount || 0)) / 100
          : pricing.nightCharge.amount || 0;
    }
  }

  let oneWayCharge = 0;
  if (tripType === 'one_way' && pricing.oneWayCharge?.enabled) {
    const rate = pricing.oneWayCharge.perKmRate || 0;
    oneWayCharge = rate * Math.max(0, estimatedKm || 0);
  }

  const toll = pricing.tollParkingEnabled ? Math.max(0, tollParking || 0) : 0;

  const subtotal = slabPrice + extraHourCharge + waitingCharge + nightCharge + oneWayCharge + toll;
  const layers = applyPlatformLayers(subtotal, pricing, subscription);

  return {
    serviceType: SERVICE_TYPES.HOURLY,
    tripType,
    estimatedKm: Math.max(0, Number(estimatedKm) || 0),
    oneWayPerKmRate: pricing.oneWayCharge?.perKmRate || 0,
    packagePrice: round2(slabPrice),
    extraHours,
    extraHourCharge: round2(extraHourCharge),
    waitingMinutes: waitingMinutes || 0,
    waitingCharge: round2(waitingCharge),
    nightCharge: round2(nightCharge),
    nightChargeTriggered,
    oneWayCharge: round2(oneWayCharge),
    tollParking: round2(toll),
    subtotal: round2(subtotal),
    ...layers,
  };
}

/**
 * Mirrors the backend outstation pricing model with separate food
 * (per day) and stay (per night) allowances:
 *
 *   subtotal = dailyRate × days
 *            + (foodProvided ? 0 : foodAllowancePerDay   × days)
 *            + (stayProvided ? 0 : stayAllowancePerNight × nights)
 *
 * Back-compat: when both split fields are 0 and the legacy
 * `outstation.allowancePerNight` is set, fall back to the combined
 * per-night charge (waived only when BOTH provided flags are true).
 * Toll & parking are NEVER added — they're paid by the customer
 * directly to the driver.
 */
export function calculateOutstationFare({
  pricing,
  days = 1,
  // `actualKm` and `tollParking` accepted for back-compat; both are
  // no-ops in the current pricing model.
  actualKm: _actualKm = 0, // eslint-disable-line no-unused-vars
  foodProvided = true,
  stayProvided = true,
  tollParking: _tollParking = 0, // eslint-disable-line no-unused-vars
  subscription = null,
} = {}) {
  if (!pricing) return null;
  const o = pricing.outstation || {};

  const tripDays = Math.max(1, Math.ceil(days));
  const nights = Math.max(0, tripDays - 1);

  const dailyRate = Number(o.dailyRate) || 0;
  const foodAllowancePerDay = Number(o.foodAllowancePerDay) || 0;
  const stayAllowancePerNight = Number(o.stayAllowancePerNight) || 0;
  const legacyAllowancePerNight = Number(o.allowancePerNight) || 0;
  const useLegacyAllowance =
    foodAllowancePerDay <= 0 &&
    stayAllowancePerNight <= 0 &&
    legacyAllowancePerNight > 0;

  const dailyRateTotal = dailyRate * tripDays;
  let foodAllowanceTotal = 0;
  let stayAllowanceTotal = 0;
  let legacyAllowanceTotal = 0;
  if (useLegacyAllowance) {
    const bothProvided = foodProvided === true && stayProvided === true;
    legacyAllowanceTotal = bothProvided ? 0 : legacyAllowancePerNight * nights;
  } else {
    foodAllowanceTotal = foodProvided === true ? 0 : foodAllowancePerDay * tripDays;
    stayAllowanceTotal = stayProvided === true ? 0 : stayAllowancePerNight * nights;
  }
  const allowanceTotal =
    foodAllowanceTotal + stayAllowanceTotal + legacyAllowanceTotal;

  const customerArrangesAll = foodProvided === true && stayProvided === true;

  const subtotal = dailyRateTotal + allowanceTotal;
  // Outstation: the food + stay (and any legacy combined) allowance
  // is pass-through to the driver — no platform commission on it.
  // Only the daily-rate portion is commissionable.
  const layers = applyPlatformLayers(
    subtotal,
    pricing,
    subscription,
    allowanceTotal,
  );

  return {
    serviceType: SERVICE_TYPES.OUTSTATION,
    days: tripDays,
    nights,
    dailyRate: round2(dailyRate),
    dailyRateTotal: round2(dailyRateTotal),
    foodAllowancePerDay: round2(foodAllowancePerDay),
    foodAllowanceTotal: round2(foodAllowanceTotal),
    stayAllowancePerNight: round2(stayAllowancePerNight),
    stayAllowanceTotal: round2(stayAllowanceTotal),
    allowanceTotal: round2(allowanceTotal),
    allowancePerNight: round2(legacyAllowancePerNight),
    legacyAllowanceTotal: round2(legacyAllowanceTotal),
    customerArrangesAll,
    foodProvided: foodProvided === true,
    stayProvided: stayProvided === true,
    subtotal: round2(subtotal),
    ...layers,
  };
}

export const formatCurrency = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
