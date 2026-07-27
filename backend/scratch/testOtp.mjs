import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendSmsOtp } from '../src/utils/otpService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const phone = '8305357624'; // Phone number from screenshot
  const otp = '999999';
  console.log('Sending test OTP to:', phone);
  try {
    const res = await sendSmsOtp(phone, otp);
    console.log('Result:', res);
  } catch (error) {
    console.error('Error sending OTP:', error);
  }
}

run();
