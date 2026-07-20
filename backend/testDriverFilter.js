import 'dotenv/config';
import mongoose from 'mongoose';
import { Driver } from './src/models/driverModels/driver.model.js';
import { findDriversInExpandingRadius } from './src/services/driverFinder.service.js';

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  const driver = await Driver.findOne({ isOnline: true, approvalStatus: 'approved' });
  if (!driver) {
    console.log('No active driver found to test.');
    process.exit(0);
  }

  const [lng, lat] = driver.location.coordinates;
  const originalBalance = driver.wallet.balance;

  console.log(`\nTesting with driver ${driver.name}, original balance: ${originalBalance}`);

  await Driver.updateOne({ _id: driver._id }, { $set: { 'wallet.balance': -50 } });
  
  const res1 = await findDriversInExpandingRadius({ lat, lng, limit: 10, requirePositiveWalletBalance: false });
  console.log(`[Test 1] (Balance -50, reqPositive=false) -> Includes target? ${res1.drivers.some(d => d._id === String(driver._id))}`);

  const res2 = await findDriversInExpandingRadius({ lat, lng, limit: 10, requirePositiveWalletBalance: true });
  console.log(`[Test 2] (Balance -50, reqPositive=true) -> Includes target? ${res2.drivers.some(d => d._id === String(driver._id))}`);

  await Driver.updateOne({ _id: driver._id }, { $set: { 'wallet.balance': 100 } });
  
  const res3 = await findDriversInExpandingRadius({ lat, lng, limit: 10, requirePositiveWalletBalance: true });
  console.log(`[Test 3] (Balance 100, reqPositive=true) -> Includes target? ${res3.drivers.some(d => d._id === String(driver._id))}`);

  await Driver.updateOne({ _id: driver._id }, { $set: { 'wallet.balance': originalBalance } });
  console.log('Restored driver balance.');
  
  process.exit(0);
}

run().catch(console.error);
