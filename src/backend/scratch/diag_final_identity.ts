import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function diag() {
  console.log('--- FINAL IDENTITY DIAGNOSTIC ---');
  
  // 1. Check Profiles
  const { data: profiles } = await supabase.from('profiles').select('id, email, full_name');
  console.log('PROFILES FOUND:', JSON.stringify(profiles, null, 2));

  // 2. Check Agents
  const { data: agents } = await supabase.from('agents').select('id, user_id, nome');
  console.log('AGENTS FOUND:', JSON.stringify(agents, null, 2));

  // 3. Check WhatsApp service configuration
  console.log('RELEVANT ENV VARS:', {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY
  });
}

diag();
