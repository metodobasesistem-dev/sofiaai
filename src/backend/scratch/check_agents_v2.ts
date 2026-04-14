import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load envs
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // USE SERVICE ROLE
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAgents() {
  console.log('--- DB AGENT CHECK (SERVICE ROLE) ---');
  const { data, error } = await supabase.from('agents').select('id, user_id, nome, status_ativo, voice_mode, voice_id');
  
  if (error) {
    console.error('Error fetching agents:', error);
    return;
  }

  console.log(`Found ${data?.length || 0} agents total in DB:`);
  data?.forEach(a => {
    console.log(`- Agent: ${a.nome} (User: ${a.user_id})`);
    console.log(`  Active: ${a.status_ativo}`);
    console.log(`  Voice Mode: ${a.voice_mode}`);
    console.log(`  Voice ID: ${a.voice_id}`);
  });
}

checkAgents();
