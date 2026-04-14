
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

async function clear() {
  try {
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    });
    
    const keys = await redis.keys('messages:*');
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`Deleted ${keys.length} keys`);
    } else {
      console.log('No keys to delete');
    }
    process.exit(0);
  } catch (e) {
    console.error('Redis Error:', e.message);
    process.exit(1);
  }
}

clear();
