import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';

// Load envs
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

async function runDiagnostic() {
  console.log('=== GLOBAL SYSTEM DIAGNOSTIC ===\n');

  // 1. SUPABASE
  console.log('--- Checking Supabase ---');
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials missing in .env');
  } else {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
      if (error) throw error;
      console.log('✅ Supabase Connection: OK');
      console.log(`📊 Profiles count: ${data === null ? 0 : 'available'}`);
    } catch (err: any) {
      console.error(`❌ Supabase Error: ${err.message}`);
    }
  }

  // 2. REDIS
  console.log('\n--- Checking Redis ---');
  if (!process.env.REDIS_HOST) {
    console.error('❌ Redis host missing in .env');
  } else {
    try {
      const redis = new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        connectTimeout: 5000
      });
      const ping = await redis.ping();
      console.log(`✅ Redis Connection: ${ping}`);
      await redis.quit();
    } catch (err: any) {
      console.error(`❌ Redis Error: ${err.message}`);
    }
  }

  // 3. OPENAI
  console.log('\n--- Checking OpenAI ---');
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OpenAI API Key missing');
  } else {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      await openai.models.list();
      console.log('✅ OpenAI Connection: OK');
    } catch (err: any) {
      console.error(`❌ OpenAI Error: ${err.message}`);
    }
  }

  console.log('\n=== DIAGNOSTIC COMPLETE ===');
  process.exit(0);
}

runDiagnostic();
