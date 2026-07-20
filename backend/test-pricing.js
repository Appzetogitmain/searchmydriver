import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

import { calculateHourlyFare, calculateOutstationFare } from './src/services/pricing.service.js';

async function testPricing() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME });

  const pricing = {
    baseFare: 500,
    baseHours: 4,
    extraHourRate: 100,
    dailyRate: 1000,
    stayAllowancePerNight: 500,
    foodAllowancePerDay: 300,
    oneWayCharge: 2000,
    gstPercent: 18,
    platformCommissionPercent: 10,
    serviceChargePercent: 5
  };

  console.log("--- HOURLY CALCULATION TEST ---");
  const hourly = calculateHourlyFare({
    durationHours: 6, // 2 extra hours
    pricing
  });
  console.log(JSON.stringify(hourly, null, 2));


  console.log("\n--- OUTSTATION CALCULATION TEST (Round Trip) ---");
  const outstationRound = calculateOutstationFare({
    days: 3,
    nights: 2,
    needsStay: true,
    needsFood: true,
    tripType: 'round_trip',
    pricing
  });
  console.log(JSON.stringify(outstationRound, null, 2));

  console.log("\n--- OUTSTATION CALCULATION TEST (One Way) ---");
  const outstationOneWay = calculateOutstationFare({
    days: 1,
    nights: 0,
    needsStay: false,
    needsFood: false,
    tripType: 'one_way',
    pricing
  });
  console.log(JSON.stringify(outstationOneWay, null, 2));

  process.exit(0);
}

testPricing().catch(console.error);
