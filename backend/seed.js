import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '.env') });

const webPageSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  title: String,
  content: String,
  isActive: Boolean
});

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME });
  const WebPage = mongoose.models.WebPage || mongoose.model('WebPage', webPageSchema);
  
  await WebPage.updateOne(
    { slug: 'privacy' },
    { $set: { title: 'Privacy Policy', content: '<p>This Privacy Policy describes how SearchMyDriver collects, uses, and protects your information.</p>', isActive: true } },
    { upsert: true }
  );

  await WebPage.updateOne(
    { slug: 'terms' },
    { $set: { title: 'Terms of Service', content: '<p>Welcome to SearchMyDriver. These Terms of Service govern your use of our platform.</p>', isActive: true } },
    { upsert: true }
  );

  console.log('Seeded web pages.');
  process.exit(0);
};
connectDB();
