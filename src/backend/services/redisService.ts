import dotenv from 'dotenv';
import path from 'path';

import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379');
const redisPassword = process.env.REDIS_PASSWORD;

console.log(`[RedisService] Init with ${redisHost}:${redisPort}...`);

let redis: any = null;

// Initialize Redis with a safety wrapper
async function getRedisClient() {
  if (redis) return redis;
  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 50, 2000)
    });
    
    redis.on('error', (err: any) => console.warn('[RedisService] Redis Warning:', err.message));
    return redis;
  } catch (e) {
    console.warn('[RedisService] ioredis module not found or connection failed. Using Firestore fallback.');
    return null;
  }
}

export const redisService = {
  async pushMessage(threadId: string, role: 'user' | 'assistant', content: string) {
    const client = await getRedisClient();
    if (!client) return;

    const key = `messages:${threadId}`;
    const message = JSON.stringify({ role, content, timestamp: Date.now() });
    
    try {
      await client.rpush(key, message);
      await client.ltrim(key, -50, -1);
      await client.expire(key, 60 * 60 * 24 * 7);
    } catch (error) {
      // Silently fail, Firestore fallback handles the rest
    }
  },

  async getHistory(threadId: string, limit: number = 40) {
    const client = await getRedisClient();
    if (!client) return [];

    const key = `messages:${threadId}`;
    try {
      const messages = await client.lrange(key, -limit, -1);
      return messages.map((m: any) => JSON.parse(m));
    } catch (error) {
      return [];
    }
  },

  async clearHistory(threadId: string) {
    const client = await getRedisClient();
    if (!client) return;
    const key = `messages:${threadId}`;
    try {
      await client.del(key);
    } catch (error) {
      console.error(`[RedisService] Error clearing history:`, error);
    }
  }
};
