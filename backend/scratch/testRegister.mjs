import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../src/models/user.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME });
    console.log("Connected.");

    const testUser = new User({
      name: 'Test Registration User',
      email: 'testreg@example.com',
      phone_no: '9999999999',
      password: 'password123',
      role: 'user',
    });

    console.log("Saving test user...");
    await testUser.save();
    console.log("✅ User registered successfully without bankDetails validation error!");

    // Clean up
    await User.deleteOne({ _id: testUser._id });
    console.log("Cleaned up test user.");
  } catch (error) {
    console.error("❌ Test registration failed:", error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
