import mongoose from "mongoose";
 
export const connectDB = async () => {
   
   try {
     if(!process.env.MONGO_URI || !process.env.DB_NAME) {
       throw new Error("MONGO_URI and DB_NAME are required in .env file");
    }
    const conn = await mongoose.connect(process.env.MONGO_URI,{
        dbName: process.env.DB_NAME
    })
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Migration: Stamp driverId on existing drivers that do not have one
    try {
      const { Driver } = await import('../models/driverModels/driver.model.js');
      const { generateDriverId } = await import('../utils/orderNumber.util.js');
      const driversWithoutId = await Driver.find({ $or: [{ driverId: { $exists: false } }, { driverId: '' }] });
      if (driversWithoutId.length > 0) {
        console.log(`[migration] Found ${driversWithoutId.length} drivers without driverId. Stamping...`);
        for (const driver of driversWithoutId) {
          driver.driverId = generateDriverId();
          await driver.save();
        }
        console.log(`[migration] Successfully stamped driverId on ${driversWithoutId.length} drivers.`);
      }
    } catch (migErr) {
      console.error("[migration] Failed to run driverId migration:", migErr);
    }

    // Migration: Drop legacy vehicleNumber_1 unique index from cars collection if present
    try {
      const carsCollection = conn.connection.collection('cars');
      const indexes = await carsCollection.indexes();
      const hasVehicleNumberIndex = indexes.some((idx) => idx.name === 'vehicleNumber_1');
      if (hasVehicleNumberIndex) {
        console.log('[migration] Dropping legacy vehicleNumber_1 index from cars collection...');
        await carsCollection.dropIndex('vehicleNumber_1');
        console.log('[migration] Successfully dropped vehicleNumber_1 index.');
      }
    } catch (idxErr) {
      console.error('[migration] Failed to drop vehicleNumber_1 index:', idxErr.message);
    }
   }catch(err){
     console.error("❌ MongoDB connection error:", err);
     // 3. Exit process with failure (1) so the server doesn't stay 
    // hanging in a broken state
    process.exit(1);
   }
}
