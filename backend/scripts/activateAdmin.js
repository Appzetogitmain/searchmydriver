import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.DB_NAME,
  });
  console.log(`Connected to MongoDB database: ${process.env.DB_NAME}`);

  // Find all staff accounts in spareDriver
  const staff = await mongoose.connection
    .collection('users')
    .find({ role: { $in: ['admin', 'sub_admin', 'team_member'] } })
    .project({ email: 1, phone_no: 1, role: 1, isActive: 1 })
    .toArray();

  console.log(`Found ${staff.length} staff account(s):`);
  console.table(staff);

  // Activate all of them!
  const updateResult = await mongoose.connection.collection('users').updateMany(
    { role: { $in: ['admin', 'sub_admin', 'team_member'] } },
    { $set: { isActive: true } }
  );

  console.log(`\nUpdated ${updateResult.modifiedCount} staff account(s) to isActive: true.`);

  const updatedStaff = await mongoose.connection
    .collection('users')
    .find({ role: { $in: ['admin', 'sub_admin', 'team_member'] } })
    .project({ email: 1, phone_no: 1, role: 1, isActive: 1 })
    .toArray();

  console.log('\nUpdated staff status:');
  console.table(updatedStaff);

  await mongoose.disconnect();
}

run().catch(console.error);
