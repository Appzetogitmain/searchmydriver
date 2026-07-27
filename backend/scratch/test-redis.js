import dotenv from 'dotenv';
import { resolve } from 'path';
import Redis from 'ioredis';

dotenv.config({ path: resolve(process.cwd(), 'backend/.env') });

async function testRedis() {
  console.log('Testing Redis connection...');
  console.log('URL:', process.env.REDIS_URL);
  
  if (!process.env.REDIS_URL) {
    console.warn('Redis not configured');
    return;
  }
  
  try {
    const client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 5000,
    });
    
    client.on('error', (err) => {
      console.warn('Redis client error:', err.message);
    });
    
    await client.ping();
    console.log('✅ Redis Connected successfully!');
    await client.quit();
  } catch (err) {
    console.error('❌ Redis Connection failed:', err);
  }
}

testRedis();
