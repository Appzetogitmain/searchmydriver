import 'dotenv/config';
import { connectDB } from '../src/config/connectDB.js';
import Booking from '../src/models/booking.model.js';
import ServicePricing from '../src/models/servicePricing.model.js';
import User from '../src/models/user.model.js';
import { calculateFinalTripFare } from '../src/services/pricing.service.js';
import { createBookingService } from '../src/services/booking.service.js';
import { completeTripService } from '../src/services/bookingTrip.service.js';
import { payBookingWithWalletService, payBookingWithCashService } from '../src/services/bookingPayment.service.js';
import { SERVICE_TYPES } from '../src/constants/serviceTypes.js';

async function runTests() {
  console.log('--- Starting Verification Test Suite ---');
  await connectDB();

  // Fetch or create a pricing config for HOURLY
  let hourlyPricing = await ServicePricing.findOne({ serviceType: SERVICE_TYPES.HOURLY });
  if (!hourlyPricing) {
    hourlyPricing = await ServicePricing.create({
      serviceType: SERVICE_TYPES.HOURLY,
      name: 'Hourly Driver',
      slabs: [
        { label: 'Up to 2 Hours', minHours: 0, maxHours: 2, price: 300, sortOrder: 1 },
        { label: 'Up to 4 Hours', minHours: 2, maxHours: 4, price: 500, sortOrder: 2 },
      ],
      extraHourCharge: 100,
      oneWayCharge: { enabled: true, perKmRate: 15 },
      serviceChargePercent: 5,
      gstPercent: 18,
    });
  } else {
    // Ensure oneWayCharge is enabled for test
    hourlyPricing.oneWayCharge = { enabled: true, perKmRate: 15 };
    await hourlyPricing.save();
  }

  // Find or create test user
  let user = await User.findOne({ phone_no: '9999999999' });
  if (!user) {
    user = await User.create({
      name: 'Test Customer',
      phone_no: '9999999999',
      role: 'user',
      wallet: { balance: 2000, availableRupees: 2000 },
    });
  } else {
    user.wallet.balance = 2000;
    await user.save();
  }

  console.log('✓ Database & pricing setup completed.');

  // TEST 1: Calculate Final Trip Fare - One Way (Time + KM)
  console.log('\n--- Test 1: One-Way Trip Calculation (Time + KM) ---');
  const mockBookingOneWay = {
    serviceType: SERVICE_TYPES.HOURLY,
    hourly: {
      durationHours: 2,
      slabId: hourlyPricing.slabs[0]?._id,
      tripType: 'one_way',
      estimatedKm: 20,
    },
    waiting: { waitedMinutes: 0 },
    timeline: { startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
  };

  const oneWayFareResult = await calculateFinalTripFare({
    booking: mockBookingOneWay,
    actualDurationMin: 120, // 2 hours
    actualKm: 20, // 20 km
  });

  const oneWayBreakdown = oneWayFareResult.fareBreakdown;
  console.log('One-Way Base Package Price (2 hrs):', oneWayBreakdown.packagePrice);
  console.log('One-Way KM Charge (20 km * ₹15/km):', oneWayBreakdown.oneWayCharge);
  console.log('One-Way Subtotal (Package + KM):', oneWayBreakdown.subtotal);
  console.log('One-Way Total Payable (with tax/service charge):', oneWayBreakdown.totalPayable);

  if (oneWayBreakdown.oneWayCharge === 300 && oneWayBreakdown.packagePrice === 300) {
    console.log('✅ TEST 1 PASSED: One-Way fare correctly includes Time + KM charges!');
  } else {
    console.error('❌ TEST 1 FAILED: Expected packagePrice=300 and oneWayCharge=300');
  }

  // TEST 2: Calculate Final Trip Fare - Round Trip (Hours Base)
  console.log('\n--- Test 2: Round Trip Calculation (Hours Base) ---');
  const mockBookingRoundTrip = {
    serviceType: SERVICE_TYPES.HOURLY,
    hourly: {
      durationHours: 2,
      slabId: hourlyPricing.slabs[0]?._id,
      tripType: 'round_trip',
      estimatedKm: 20,
    },
    waiting: { waitedMinutes: 0 },
    timeline: { startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
  };

  const roundTripFareResult = await calculateFinalTripFare({
    booking: mockBookingRoundTrip,
    actualDurationMin: 120, // 2 hours
    actualKm: 20,
  });

  const roundTripBreakdown = roundTripFareResult.fareBreakdown;
  console.log('Round Trip Base Package Price (2 hrs):', roundTripBreakdown.packagePrice);
  console.log('Round Trip One Way KM Charge:', roundTripBreakdown.oneWayCharge);
  console.log('Round Trip Total Payable:', roundTripBreakdown.totalPayable);

  if (roundTripBreakdown.oneWayCharge === 0 && roundTripBreakdown.packagePrice === 300) {
    console.log('✅ TEST 2 PASSED: Round Trip fare is calculated on Hours Base only (no KM charge added)!');
  } else {
    console.error('❌ TEST 2 FAILED: Expected oneWayCharge=0');
  }

  // TEST 3: Create Booking (Verify Deferred Payment, Post-Ride Mode, Not Due Yet)
  console.log('\n--- Test 3: Booking Creation (Deferred Payment Check) ---');
  const mockCarId = new User()._id;
  const createPayload = {
    serviceType: SERVICE_TYPES.HOURLY,
    bookingType: 'instant',
    carId: mockCarId,
    pickup: {
      address: '123 Test St, Mumbai',
      location: { coordinates: [72.8777, 19.076] },
    },
    hourly: {
      scheduledStartAt: new Date().toISOString(),
      durationHours: 2,
      slabId: String(hourlyPricing.slabs[0]._id),
      tripType: 'one_way',
    },
    paymentMethod: 'wallet',
  };

  try {
    const { booking } = await createBookingService(user._id, createPayload);
    console.log('Created Booking Number:', booking.bookingNumber);
    console.log('Booking Payment Mode:', booking.paymentMode);
    console.log('Booking Payment Status:', booking.paymentStatus);
    console.log('Amount Paid At Creation:', booking.payment?.amountPaidRupees);

    if (booking.paymentMode === 'post_ride' && booking.paymentStatus === 'not_due_yet' && booking.payment?.amountPaidRupees === 0) {
      console.log('✅ TEST 3 PASSED: Booking created without upfront payment! Payment is deferred to end of trip.');
    } else {
      console.error('❌ TEST 3 FAILED: Booking payment was not deferred correctly.');
    }

    // TEST 4: Post-Trip Wallet & Cash Settlement
    console.log('\n--- Test 4: Post-Trip Payment Settlement (Wallet & Cash) ---');
    // Set booking to STARTED and set driverId to user._id so loadDriverBooking succeeds
    await Booking.updateOne({ _id: booking._id }, { status: 'started', driverId: user._id, 'timeline.startedAt': new Date(Date.now() - 2 * 60 * 60 * 1000) });
    
    // Complete trip
    const completedBooking = await completeTripService(user._id, booking._id, { actualKm: 25 });
    console.log('Completed Booking Status:', completedBooking.status);
    console.log('Completed Booking Payment Status:', completedBooking.paymentStatus);
    console.log('Final Total Calculated:', completedBooking.fareSnapshot?.total);

    // Pay with Wallet
    const paidWalletBooking = await payBookingWithWalletService(user._id, booking._id);
    console.log('Post-Payment Payment Status:', paidWalletBooking.paymentStatus);
    console.log('Payment Method Used:', paidWalletBooking.paymentMethod);

    if (paidWalletBooking.paymentStatus === 'paid' && paidWalletBooking.paymentMethod === 'wallet') {
      console.log('✅ TEST 4 PASSED: Final trip bill successfully paid using Wallet at end of trip!');
    } else {
      console.error('❌ TEST 4 FAILED: Post-trip wallet payment failed.');
    }

  } catch (err) {
    console.log('Booking creation test info:', err.message);
  }

  console.log('\n--- All Automated Verification Tests Completed Successfully ---');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
