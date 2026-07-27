import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function test(message, sid) {
  const phone = '8305357624';
  const apiUrl = 'https://cloud.smsindiahub.in/vendorsms/pushsms.aspx';
  const url = new URL(apiUrl);
  
  url.searchParams.append('APIKey', process.env.SMS_INDIA_HUB_API_KEY || '');
  url.searchParams.append('msisdn', `91${phone}`);
  url.searchParams.append('sid', sid);
  url.searchParams.append('msg', message);
  url.searchParams.append('fl', '0');
  url.searchParams.append('gwid', process.env.SMS_INDIA_HUB_GWID || '2');
  
  if (process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID) {
    url.searchParams.append('dlttempid', process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID.trim());
  }

  try {
    const response = await fetch(url.toString(), { method: 'GET' });
    const responseText = await response.text();
    console.log(`Response for HTTPS:`, responseText);
  } catch (error) {
    console.error(`Error:`, error);
  }
}

async function run() {
  await test('Welcome to the Search My Driver powered by Appzeto.Your OTP for registration is 999999.BGADEC', 'BGADEC');
}

run();
