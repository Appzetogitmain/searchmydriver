import mongoose from 'mongoose';
import Booking from '../models/booking.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import Car from '../models/user/car.model.js';
import CarType from '../models/carType.model.js';
import User from '../models/user.model.js';
import {
  BOOKING_STATUS,
  BOOKING_TYPE,
  TRIP_TYPE,
} from '../constants/bookingStatus.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';

// Same zone the pricing engine uses — format in the customer's local time,
// not the server's (hosted servers usually run in UTC).
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

/** YYYY-MM-DD for `d` in APP_TIMEZONE (for today / tomorrow checks). */
function zonedDateKey(d) {
  return d.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
}

/**
 * Formats a Date object into time, date, and combined display strings.
 */
function formatDateTimeStrings(dateObj) {
  if (!dateObj || isNaN(new Date(dateObj).getTime())) {
    dateObj = new Date();
  }
  const d = new Date(dateObj);
  const now = new Date();

  // Time: e.g. "12:15 PM"
  const timeDisplay = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: APP_TIMEZONE,
  });

  // Check if today / tomorrow (in the app's timezone)
  const key = zonedDateKey(d);
  const isToday = key === zonedDateKey(now);
  const isTomorrow = key === zonedDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  const dateShort = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: APP_TIMEZONE,
  });

  let datePrefix = '';
  if (isToday) datePrefix = 'Today, ';
  else if (isTomorrow) datePrefix = 'Tomorrow, ';

  return {
    timeDisplay,
    dateDisplay: `${datePrefix}${dateShort}`,
    pickupDateTimeDisplay: `${dateShort}, ${timeDisplay}`,
  };
}

/**
 * Format single booking item for driver trip request view.
 */
function formatTripRequestItem(booking, driver, carDoc, carTypeDoc) {
  const driverIdStr = String(driver._id);
  const isTaken =
    booking.status !== BOOKING_STATUS.SEARCHING &&
    booking.status !== BOOKING_STATUS.PENDING_ASSIGNMENT;
  const isAssignedToMe = String(booking.driverId) === driverIdStr;
  const takenByOther = isTaken && !isAssignedToMe;
  const isDirectOffer = (booking.dispatch?.pendingOfferIds || []).some(
    (id) => String(id) === driverIdStr,
  );

  // Scheduled date / pickup date
  const rawPickupDate =
    booking.hourly?.scheduledStartAt ||
    booking.outstation?.pickupAt ||
    booking.outstation?.startDate ||
    booking.monthly?.startDate ||
    booking.createdAt ||
    new Date();

  const { timeDisplay, dateDisplay, pickupDateTimeDisplay } =
    formatDateTimeStrings(rawPickupDate);

  // Service & Trip types
  const isHourly = booking.serviceType === SERVICE_TYPES.HOURLY;
  const isOutstation = booking.serviceType === SERVICE_TYPES.OUTSTATION;
  const isMonthly = booking.serviceType === SERVICE_TYPES.MONTHLY;

  let rawTripType = TRIP_TYPE.ROUND_TRIP;
  if (isHourly && booking.hourly?.tripType) rawTripType = booking.hourly.tripType;
  if (isOutstation && booking.outstation?.tripType) rawTripType = booking.outstation.tripType;

  const tripTypeDisplay = rawTripType === TRIP_TYPE.ONE_WAY ? 'One Way' : 'Round Trip';
  const bookingTypeDisplay = isOutstation
    ? 'Outstation'
    : isMonthly
    ? 'Monthly'
    : 'In Station';

  // Need Driver / Package Title
  let needDriver = '2 Hours';
  let packageTitle = '2 HOURS - Plus';
  if (isHourly) {
    const hours = booking.hourly?.durationHours || 2;
    needDriver = `${hours} Hours`;
    packageTitle = `${hours} HOURS - ${booking.hourly?.isCustomDuration ? 'Custom' : 'Plus'}`;
  } else if (isOutstation) {
    const days = booking.outstation?.days || 1;
    needDriver = `${days} Days`;
    packageTitle = `${days} DAYS - Outstation`;
  } else if (isMonthly) {
    needDriver = '1 Month';
    packageTitle = 'Monthly Driver Plan';
  }

  // Driver Earning Calculation
  const fareTotal = Number(booking.fareSnapshot?.total || 0);
  const driverEarning = Number(
    booking.fareSnapshot?.breakdown?.driverShare ||
      booking.fareSnapshot?.driverEarning ||
      Math.round(fareTotal > 0 ? fareTotal * 0.8 : 250),
  );

  // Payment Mode
  // `paymentMethod` is what the customer chose. `paymentMode` only says
  // *when* they pay (hourly/outstation are always post_ride, even online),
  // so it must not be used to decide cash vs online.
  const isCash = booking.paymentMethod === 'cash';

  const paymentDisplay = isCash
    ? 'Cash'
    : booking.paymentMethod === 'wallet'
      ? 'Wallet'
      : 'Online';

  // Car Details
  const carTypeName =
    carTypeDoc?.name ||
    carDoc?.carTypeId?.name ||
    (typeof carDoc?.carTypeId === 'string' ? carDoc.carTypeId : 'Sedan');

  const transmission = carDoc?.transmission
    ? carDoc.transmission.charAt(0).toUpperCase() + carDoc.transmission.slice(1)
    : 'Manual';

  const carCategory =
    carDoc?.brandId?.name ||
    carDoc?.modelName ||
    (carTypeName ? carTypeName.toUpperCase() : 'Standard');

  // Category for filtering: 'current' | 'scheduled' | 'outstation' | 'incity'
  let category = 'incity';
  if (isOutstation) {
    category = 'outstation';
  } else if (booking.bookingType === BOOKING_TYPE.SCHEDULED) {
    category = 'scheduled';
  } else if (isDirectOffer || booking.status === BOOKING_STATUS.SEARCHING) {
    category = 'current';
  }

  const driverWalletBalance = Number(driver.wallet?.balance || 0);
  const cashBlocked = isCash && driverWalletBalance < 0;

  return {
    _id: String(booking._id),
    bookingId: String(booking._id),
    bookingNumber: booking.bookingNumber || `TRP${String(booking._id).slice(-6).toUpperCase()}`,
    tripIdDisplay: `Trip ID: ${booking.bookingNumber || `TRP${String(booking._id).slice(-6).toUpperCase()}`}`,
    category,
    serviceType: booking.serviceType,
    bookingType: booking.bookingType,
    bookingTypeDisplay,
    tripType: rawTripType,
    tripTypeDisplay,
    packageTitle,
    customerType: 'B2C',
    paymentMode: paymentDisplay,
    isCash,
    cashBlocked,
    driverEarning,
    totalFare: fareTotal,
    timeDisplay,
    dateDisplay,
    pickupDateTimeDisplay,
    needDriver,
    pickupLocation: booking.pickup?.address || 'Pickup location not specified',
    pickupCoords: booking.pickup?.location?.coordinates || null,
    pickupCity: booking.pickup?.city || booking.city || '',
    dropLocation:
      booking.dropoff?.address ||
      booking.outstation?.destinationAddress ||
      (isHourly ? booking.pickup?.address : 'As directed'),
    dropCoords: booking.dropoff?.location?.coordinates || null,
    dropCity: booking.dropoff?.city || '',
    carType: carTypeName.charAt(0).toUpperCase() + carTypeName.slice(1),
    transmission,
    carCategory,
    status: booking.status,
    expiresAt: booking.dispatch?.currentExpiresAt || null,
    isDirectOffer,
    isTaken,
    takenByOther,
    isAssignedToMe,
    canAccept: !isTaken && !cashBlocked && driver.approvalStatus !== 'suspended',
  };
}

/**
 * Get all trip requests eligible for a given driver.
 * Includes:
 * 1. Live Wave / Broadcast Offers where driver is in pendingOfferIds
 * 2. In-City (Local / Hourly) searching requests in driver's city / zone
 * 3. Outstation (One-Way & Round Trip) searching requests
 * 4. Scheduled bookings awaiting assignment
 * 5. Recently assigned bookings (for real-time "Booked by another" feedback)
 */
export async function getDriverEligibleTripRequestsService(driverId, filters = {}) {
  const driver = await Driver.findById(driverId).lean();
  if (!driver) return [];
  if (driver.approvalStatus === 'suspended') return [];

  const driverCity = (driver.city || '').trim().toLowerCase();
  const driverHomeZone = driver.homeZone ? String(driver.homeZone) : null;
  const outstationOptIn = Boolean(driver.availableForOutstation);
  const preferredZones = (driver.preferredOutstationZones || []).map(String);

  // Time window for recently taken/assigned bookings so other drivers see "Booked" transition
  const recentTakenCutoff = new Date(Date.now() - 45 * 1000); // 45 seconds grace window

  // Build booking query
  const queryOrConditions = [
    // 1. Direct broadcast offers targeted to this driver
    {
      'dispatch.pendingOfferIds': driverId,
      status: { $in: [BOOKING_STATUS.SEARCHING, BOOKING_STATUS.PENDING_ASSIGNMENT] },
    },
    // 2. Open searching bookings
    {
      status: { $in: [BOOKING_STATUS.SEARCHING, BOOKING_STATUS.PENDING_ASSIGNMENT] },
    },
    // 3. Recently taken bookings for live state sync
    {
      status: {
        $in: [
          BOOKING_STATUS.DRIVER_ASSIGNED,
          BOOKING_STATUS.AWAITING_PAYMENT,
          BOOKING_STATUS.EN_ROUTE,
        ],
      },
      'timeline.driverAssignedAt': { $gte: recentTakenCutoff },
    },
  ];

  const candidateBookings = await Booking.find({
    isDeleted: false,
    $or: queryOrConditions,
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('carId')
    .populate('userId', 'name phone rating')
    .lean();

  if (!candidateBookings.length) {
    return [];
  }

  // Pre-fetch car types for reference
  const carTypeIds = candidateBookings
    .map((b) => b.carId?.carTypeId)
    .filter(Boolean);
  const carTypes = await CarType.find({ _id: { $in: carTypeIds } }).lean();
  const carTypeMap = new Map(carTypes.map((ct) => [String(ct._id), ct]));

  const results = [];

  for (const booking of candidateBookings) {
    const isOutstation = booking.serviceType === SERVICE_TYPES.OUTSTATION;
    const isDirectOffer = (booking.dispatch?.pendingOfferIds || []).some(
      (id) => String(id) === String(driverId),
    );

    // City & Zone Matching
    const bookingCity = (booking.city || booking.pickup?.city || '').trim().toLowerCase();
    const isCityMatch = !driverCity || !bookingCity || driverCity === bookingCity;
    const isZoneMatch =
      driverHomeZone && (booking.zoneIds || []).map(String).includes(driverHomeZone);

    // Eligibility rules:
    if (!isDirectOffer) {
      if (isOutstation) {
        // Must be opted into outstation
        if (!outstationOptIn) continue;
        // If preferred zones configured, check zone match or city match
        if (preferredZones.length > 0) {
          const hasZoneOverlap = (booking.zoneIds || []).some((z) =>
            preferredZones.includes(String(z)),
          );
          if (!hasZoneOverlap && !isCityMatch) continue;
        }
      } else {
        // In-city: check city or zone match
        if (!isCityMatch && !isZoneMatch) continue;
      }
    }

    const carDoc = booking.carId || null;
    const carTypeDoc = carDoc?.carTypeId ? carTypeMap.get(String(carDoc.carTypeId)) : null;

    const formatted = formatTripRequestItem(booking, driver, carDoc, carTypeDoc);

    // Apply category filter if passed
    if (filters.category && filters.category !== 'all') {
      if (filters.category === 'incity' && formatted.serviceType !== SERVICE_TYPES.HOURLY) {
        continue;
      }
      if (filters.category === 'outstation' && formatted.serviceType !== SERVICE_TYPES.OUTSTATION) {
        continue;
      }
      if (filters.category === 'scheduled' && formatted.bookingType !== BOOKING_TYPE.SCHEDULED) {
        continue;
      }
      if (filters.category === 'current' && formatted.isTaken) {
        continue;
      }
    }

    results.push(formatted);
  }

  return results;
}
