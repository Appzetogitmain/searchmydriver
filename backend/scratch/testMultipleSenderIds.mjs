import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const candidates = [
  'SMSHUB',
  'SMDPLP',
  'SMDPLR',
  'SMDRIV',
  'SMDPLT',
  'SMDPLI',
  'SMDPLD',
  'SMDPLM'
];

async function test(sid) {
  const phone = '8305357624';
  const otp = '999999';
  const template = process.env.SMS_INDIA_HUB_TEMPLATE_TEXT || 'Welcome to the ${Search My Driver} powered by SMSINDIAHUB. Your OTP for registration is ${otp}';
  const message = template
    .replace(/\${otp}/g, otp)
    .replace(/\${Search My Driver}/g, 'Search My Driver');

  const apiUrl = process.env.SMS_INDIA_HUB_URL || 'http://cloud.smsindiahub.in/vendorsms/pushsms.aspx';
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
    console.log(`Sender ID [${sid}]:`, responseText);
  } catch (error) {
    console.error(`Error with ${sid}:`, error);
  }
}

async function run() {
  for (const sid of candidates) {
    await test(sid);
  }
}

run();
