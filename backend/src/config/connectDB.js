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
   }catch(err){
     console.error("❌ MongoDB connection error:", err);
     // 3. Exit process with failure (1) so the server doesn't stay 
    // hanging in a broken state
    process.exit(1);
   }
}
