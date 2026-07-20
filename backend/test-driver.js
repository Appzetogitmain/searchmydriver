import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME });
    const car = await mongoose.connection.db.collection('cars').findOne({_id: new mongoose.Types.ObjectId('6a5b10fcdc0722ab1ded4af6')});
    console.log('Car:', JSON.stringify(car, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
