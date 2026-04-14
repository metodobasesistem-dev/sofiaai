import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function debugRedis() {
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD
  });

  console.log('--- DEBUG REDIS ---');
  const keys = await redis.keys('messages:*');
  console.log('Chaves encontradas:', keys);

  for (const key of keys) {
    const messages = await redis.lrange(key, 0, -1);
    console.log(`\nKey: ${key} (${messages.length} mensagens)`);
    messages.forEach((m, i) => {
      const data = JSON.parse(m);
      console.log(`  ${i}: [${data.role}] ${data.content.substring(0, 50)}...`);
    });
  }
  
  await redis.quit();
}

debugRedis().catch(console.error);
