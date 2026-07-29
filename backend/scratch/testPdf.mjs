import mongoose from 'mongoose';
import '../src/models/driverModels/driver.model.js';
import '../src/models/carType.model.js';
import '../src/models/carBrand.model.js';
import '../src/models/carModel.model.js';
import '../src/models/fuelType.model.js';
import '../src/models/user.model.js';
import { Driver } from '../src/models/driverModels/driver.model.js';

async function test() {
  await mongoose.connect('mongodb://priyank4u777_db_user:3mKBE6nkdLZtCXOu@ac-sstehvf-shard-00-00.7atu2ui.mongodb.net:27017,ac-sstehvf-shard-00-01.7atu2ui.mongodb.net:27017,ac-sstehvf-shard-00-02.7atu2ui.mongodb.net:27017/?ssl=true&replicaSet=atlas-bvid17-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0', { dbName: 'spareDriver' });
  try {
    const driver = await Driver.findById('6a687aa9545734784f499c74').lean();
    console.log('Driver object:', JSON.stringify(driver, null, 2));
  } catch (err) {
    console.error('Error fetching driver:', err);
  }
  process.exit(0);
}

test();
