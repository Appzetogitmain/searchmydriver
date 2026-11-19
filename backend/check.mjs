import 'dotenv/config';
import mongoose from 'mongoose'; mongoose.connect(process.env.MONGO_URI, { dbName: 'spareDriver' }).then(async () => { const docs = await mongoose.connection.db.collection('servicepricings').find({}).toArray(); console.log(JSON.stringify(docs)); process.exit(0); });
