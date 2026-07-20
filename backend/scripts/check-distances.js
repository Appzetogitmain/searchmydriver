import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { Driver } from '../src/models/driverModels/driver.model.js';

async function checkDocs() {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME });
    const driver = await Driver.findOne();
    if (!driver) {
      console.log('No driver found');
      return;
    }
    
    // Inject dummy doc if empty
    if (driver.documents.length === 0) {
      console.log('Injecting dummy document...');
      driver.documents.push({
        type: 'driving_license',
        fileUrl: 'https://via.placeholder.com/400x250.png?text=Driving+License',
        uploadedAt: new Date(),
        verificationStatus: 'verified'
      });
      await driver.save();
      console.log('Dummy document saved!');
    }
    console.log(`Driver ID: ${driver._id}, Phone: ${driver.phone}`);
    console.log('Documents length:', driver.documents?.length);
    console.log('Documents:', JSON.stringify(driver.documents, null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
  }
}
checkDocs();
