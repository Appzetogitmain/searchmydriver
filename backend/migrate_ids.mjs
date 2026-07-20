import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from './src/models/user.model.js';
import { Driver } from './src/models/driverModels/driver.model.js';
import { generateUserId, generateDriverId } from './src/utils/orderNumber.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.DB_NAME
    });
    console.log('Connected to MongoDB');

    const users = await User.find({ userId: { $exists: false } });
    console.log(`Found ${users.length} users without userId`);
    
    let updatedUsers = 0;
    for (const user of users) {
      let unique = false;
      let newId;
      while (!unique) {
        newId = generateUserId();
        const existing = await User.findOne({ userId: newId });
        if (!existing) unique = true;
      }
      user.userId = newId;
      await user.save({ validateBeforeSave: false });
      updatedUsers++;
    }
    console.log(`Updated ${updatedUsers} users with new userId`);

    // Drivers: Since they already have a long driverId, we might want to update them to the short one.
    // Assuming we want to update ALL drivers to the new short format:
    const drivers = await Driver.find({ driverId: { $regex: /^DRV-/ } }); // match old format
    console.log(`Found ${drivers.length} drivers with old DRV- format`);
    
    let updatedDrivers = 0;
    for (const driver of drivers) {
      let unique = false;
      let newId;
      while (!unique) {
        newId = generateDriverId();
        const existing = await Driver.findOne({ driverId: newId });
        if (!existing) unique = true;
      }
      driver.driverId = newId;
      await driver.save({ validateBeforeSave: false });
      updatedDrivers++;
    }
    console.log(`Updated ${updatedDrivers} drivers with new driverId`);

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
