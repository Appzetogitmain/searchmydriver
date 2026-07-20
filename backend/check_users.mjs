import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from './src/models/user.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find({ role: 'user' });
  console.log(`Total users: ${users.length}`);
  let countWithId = 0;
  for (const u of users) {
    if (u.userId) countWithId++;
  }
  console.log(`Users with userId: ${countWithId}`);
  if (countWithId < users.length) {
    console.log("Sample user without userId:", users.find(u => !u.userId).name);
  }
  await mongoose.disconnect();
}
check();
