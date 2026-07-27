import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), 'backend/.env') });

async function testConnections() {
  console.log('Testing MongoDB connection...');
  console.log('URI:', process.env.MONGO_URI);
  console.log('DB NAME:', process.env.DB_NAME);
  
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.DB_NAME,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ MongoDB Connected successfully:', conn.connection.host);
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ MongoDB Connection failed:', err);
  }
}

testConnections();
