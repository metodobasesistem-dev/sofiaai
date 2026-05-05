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
const redisUsername = process.env.REDIS_USERNAME || 'default';

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
      username: redisUsername,
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 50, 2000)
    });
    
    // Suprimir erros de conexão para não travar o processo principal
    redis.on('error', (err: any) => {
      // Apenas logamos no console do servidor, sem disparar alertas externos aqui
      if (process.env.NODE_ENV === 'development') {
        console.error('[Redis] Error:', err.message);
      }
    });

    return redis;
  } catch (e) {
    console.warn('[RedisService] ioredis module not found or connection failed. Using Firestore fallback.');
    return null;
  }
}

export const redisService = {
  async getClient() {
    return await getRedisClient();
  },

  async set(key: string, value: any, ttlSeconds?: number) {
    const client = await getRedisClient();
    if (!client) return;
    const val = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await client.set(key, val, 'EX', ttlSeconds);
    } else {
      await client.set(key, val);
    }
  },

  async get(key: string) {
    const client = await getRedisClient();
    if (!client) return null;
    const data = await client.get(key);
    try {
      return data ? JSON.parse(data) : null;
    } catch {
      return data;
    }
  },

  async del(key: string) {
    const client = await getRedisClient();
    if (!client) return;
    await client.del(key);
  },

  /**
   * Idempotência: Verifica se uma mensagem já foi processada recentemente
   */
  async markAsProcessed(messageId: string, ttl = 3600): Promise<boolean> {
    const client = await getRedisClient();
    if (!client) return true; // Se o Redis falhar, processamos para não perder a msg
    const key = `processed:${messageId}`;
    const result = await client.set(key, '1', 'NX', 'EX', ttl);
    return result === 'OK';
  },

  /**
   * Fila de Agendamento (Delayed Queue)
   */
  async addToQueue(queueName: string, id: string, delaySeconds: number) {
    const client = await getRedisClient();
    if (!client) return;
    const processAt = Date.now() + (delaySeconds * 1000);
    await client.zadd(queueName, processAt, id);
  },

  async getDueJobs(queueName: string): Promise<string[]> {
    const client = await getRedisClient();
    if (!client) return [];
    const now = Date.now();
    // Pega IDs cujo tempo de processamento já passou
    const jobs = await client.zrangebyscore(queueName, 0, now);
    return jobs;
  },

  async removeFromQueue(queueName: string, id: string) {
    const client = await getRedisClient();
    if (!client) return;
    await client.zrem(queueName, id);
  },

  async pushMessage(threadId: string, role: 'user' | 'assistant', content: string) {
    const client = await getRedisClient();
    if (!client) return;

    const key = `messages:${threadId}`;
    const message = JSON.stringify({ role, content, timestamp: Date.now() });
    
    try {
      await client.rpush(key, message);
      await client.ltrim(key, -50, -1);
      await client.expire(key, 60 * 60 * 24 * 7);
    } catch (error) {}
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
    } catch (error) {}
  },

  /**
   * Metrics for monitoring
   */
  async getQueueMetrics(queueNames: string[]) {
    const client = await getRedisClient();
    if (!client) return {};
    
    const metrics: Record<string, number> = {};
    for (const name of queueNames) {
      try {
        metrics[name] = await client.zcard(name);
      } catch (e) {
        metrics[name] = 0;
      }
    }
    return metrics;
  },

  async getRedisInfo() {
    const client = await getRedisClient();
    if (!client) return { status: 'disconnected' };
    try {
      const info = await client.info('memory');
      const usedMemory = info.match(/used_memory_human:(.*)/)?.[1] || 'unknown';
      return { status: 'connected', usedMemory };
    } catch (e) {
      return { status: 'error', message: (e as any).message };
    }
  },

  /**
   * Buffer para Agrupamento de Mensagens (Debounce)
   */
  async pushToBuffer(userId: string, from: string, content: string) {
    const client = await getRedisClient();
    if (!client) return;
    const key = `buffer:${userId}:${from}`;
    try {
      await client.rpush(key, content);
      await client.expire(key, 3600); // 1 hora de vida no máximo
    } catch (error) {}
  },

  async getAndClearBuffer(userId: string, from: string): Promise<string[]> {
    const client = await getRedisClient();
    if (!client) return [];
    const key = `buffer:${userId}:${from}`;
    try {
      const messages = await client.lrange(key, 0, -1);
      await client.del(key);
      return messages;
    } catch (error) {
      return [];
    }
  }
};

