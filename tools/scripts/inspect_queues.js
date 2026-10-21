import Queue from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

async function inspectQueues() {
  console.log("Connecting to Redis...");
  const connection = new Redis(redisConfig);
  
  const queues = ['whatsapp-messages', 'whatsapp-followups', 'profile-picture-sync'];
  
  for (const qName of queues) {
    console.log(`\n=== QUEUE: ${qName} ===`);
    try {
      const q = new Queue.Queue(qName, { connection });
      const counts = await q.getJobCounts(
        'waiting', 'active', 'delayed', 'failed', 'completed', 'paused', 'prioritized'
      );
      console.log("Counts:", counts);
      
      const jobs = await q.getJobs(['waiting', 'active', 'delayed', 'failed']);
      console.log(`Jobs detail (total: ${jobs.length}):`);
      for (const job of jobs.slice(0, 10)) {
        console.log(`- ID: ${job.id}, Name: ${job.name}, State: ${await job.getState()}, Attempts: ${job.attemptsMade}, Delay: ${job.delay}ms`);
        console.log(`  Data: ${JSON.stringify(job.data)}`);
        if (job.failedReason) {
          console.log(`  Failed Reason: ${job.failedReason}`);
        }
      }
    } catch (err) {
      console.error(`Error inspecting queue ${qName}:`, err);
    }
  }
  
  connection.disconnect();
}

inspectQueues();
