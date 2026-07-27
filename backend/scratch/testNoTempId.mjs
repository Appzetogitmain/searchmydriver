import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function test(message, sid, dlttempid) {
  const phone = '8305357624';
  const apiUrl = process.env.SMS_INDIA_HUB_URL || 'http://cloud.smsindiahub.in/vendorsms/pushsms.aspx';
  const url = new URL(apiUrl);
  
  url.searchParams.append('APIKey', process.env.SMS_INDIA_HUB_API_KEY || '');
  url.searchParams.append('msisdn', `91${phone}`);
  url.searchParams.append('sid', sid);
  url.searchParams.append('msg', message);
  url.searchParams.append('fl', '0');
  url.searchParams.append('gwid', process.env.SMS_INDIA_HUB_GWID || '2');
  
  if (dlttempid) {
    url.searchParams.append('dlttempid', dlttempid.trim());
  }

  try {
    const response = await fetch(url.toString(), { method: 'GET' });
    const responseText = await response.text();
    console.log(`Response (SID: ${sid}, TempID: ${dlttempid || 'none'}):`, responseText);
  } catch (error) {
    console.error(`Error:`, error);
  }
}

async function run() {
  const msg = 'Welcome to the Search My Driver powered by Appzeto.Your OTP for registration is 999999.';
  await test(msg, 'BGADEC', null);
}

run();
