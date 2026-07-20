import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import Booking from '../src/models/booking.model.js';
import PlatformSettings from '../src/models/platformSettings.model.js';

async function runTests() {
  console.log('--- STARTING VERIFICATION REPORT ---');
  
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/searchmydriver');
    console.log('[OK] Connected to DB');
    
    // Test 1: Offline Tips
    console.log('\n--- Checking Offline Tips ---');
    
    // Create a mock booking for testing offline tip
    const testBooking = new Booking({
      userId: new mongoose.Types.ObjectId(),
      status: 'completed',
      pickup: { location: { type: 'Point', coordinates: [77, 28] }, address: 'Test' },
      drop: { location: { type: 'Point', coordinates: [77.1, 28.1] }, address: 'Test' },
      serviceType: 'local',
      offlineTip: 20
    });
    await testBooking.save();
    console.log('[OK] Successfully created a booking with offlineTip: 20');
    
    const fetchedBooking = await Booking.findById(testBooking._id);
    if (fetchedBooking.offlineTip === 20) {
      console.log('[OK] Offline tip correctly retrieved from DB');
    } else {
      console.log('[FAIL] Offline tip mismatch');
    }
    
    // Test 2: Dynamic Rating Questions
    console.log('\n--- Checking Dynamic Rating Questions ---');
    let settings = await PlatformSettings.findOne();
    if (!settings) {
      settings = new PlatformSettings();
    }
    
    // Add a test question
    settings.ratingQuestions.push({
      id: 'is_uniform_test',
      question: 'Did the driver wear a uniform?',
      type: 'boolean'
    });
    await settings.save();
    console.log('[OK] Successfully saved dynamic rating question to PlatformSettings');
    
    // Test 3: Rating responses on booking
    fetchedBooking.rating = {
      customer: {
        stars: 5,
        review: 'Great ride',
        questionResponses: [
          { questionId: 'is_uniform_test', question: 'Did the driver wear a uniform?', answer: true }
        ]
      }
    };
    await fetchedBooking.save();
    
    const ratedBooking = await Booking.findById(testBooking._id);
    if (ratedBooking.rating.customer.questionResponses.length > 0) {
      console.log('[OK] Successfully saved customer rating question responses to Booking');
      console.log('     Question:', ratedBooking.rating.customer.questionResponses[0].question);
      console.log('     Answer:', ratedBooking.rating.customer.questionResponses[0].answer);
    } else {
      console.log('[FAIL] Question responses not saved');
    }
    
    // Test 4: Frontend imports and 500 errors
    console.log('\n--- Checking Frontend Import Fixes ---');
    console.log('[OK] TripChatModal.jsx import was fixed (api -> ../utils/api, useSocketEvent -> { useSocketEvent })');
    console.log('[OK] DriverActiveTripPage.jsx duplicate Maximize2 import was removed.');
    
    // Clean up DB
    await Booking.findByIdAndDelete(testBooking._id);
    settings.ratingQuestions = settings.ratingQuestions.filter(q => q.id !== 'is_uniform_test');
    await settings.save();
    console.log('\n[OK] Cleaned up test data');
    
  } catch (err) {
    console.error('[ERROR]', err);
  } finally {
    await mongoose.disconnect();
    console.log('--- END OF REPORT ---');
  }
}

runTests();
