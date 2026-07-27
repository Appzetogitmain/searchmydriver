import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import User from '../src/models/user.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME });
    console.log("Connected.");

    const email = 'admin@gmail.com';
    const password = '123456';

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Find any user with role 'admin' or email 'admin@gmail.com'
    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      admin = await User.findOne({ email });
    }

    if (admin) {
      console.log(`Updating existing admin: ${admin.email}`);
      admin.email = email;
      admin.password = hashedPassword;
      admin.role = 'admin';
      if (!admin.name) admin.name = 'Super Admin';
      if (!admin.bankDetails || !admin.bankDetails.bankName) {
        admin.bankDetails = {
          bankName: 'Dummy Bank',
          ifscCode: 'DUMM0123456',
          accountNumber: '1234567890',
          accountHolderName: 'Super Admin'
        };
      }
      await admin.save();
      console.log("Admin updated successfully.");
    } else {
      console.log("No existing admin found. Creating new admin...");
      admin = new User({
        name: 'Super Admin',
        email,
        phone_no: '0000000000',
        password: hashedPassword,
        role: 'admin',
        bankDetails: {
          bankName: 'Dummy Bank',
          ifscCode: 'DUMM0123456',
          accountNumber: '1234567890',
          accountHolderName: 'Super Admin'
        }
      });
      await admin.save();
      console.log("New admin created successfully.");
    }
  } catch (error) {
    console.error("Error setting admin credentials:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

run();
