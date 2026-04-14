import { db } from './src/backend/lib/firebaseAdmin.js';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function diagnose() {
  console.log('--- DIAGNÓSTICO DE IDs ---');
  
  // 1. Usuarios
  const users = await db.collection('users').get();
  console.log('Usuários no sistema:', users.docs.map(d => d.id));

  // 2. Threads
  const threads = await db.collection('threads').get();
  console.log('Threads no Firestore (IDs):');
  threads.docs.forEach(d => console.log(`  - ${d.id} (Contact: ${d.data().contactName})`));

  // 3. Redis
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD
  });
  const keys = await redis.keys('*');
  console.log('Chaves no Redis:', keys);
  await redis.quit();
}

diagnose().catch(console.error);
