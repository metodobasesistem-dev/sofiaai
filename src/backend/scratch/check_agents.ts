import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load envs
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAgents() {
  console.log('--- DB AGENT CHECK ---');
  const { data, error } = await supabase.from('agents').select('id, nome, status_ativo, voice_mode, voice_id');
  
  if (error) {
    console.error('Error fetching agents:', error);
    return;
  }

  console.log(`Found ${data.length} agents:`);
  data.forEach(a => {
    console.log(`- Agent: ${a.nome} (ID: ${a.id})`);
    console.log(`  Active: ${a.status_ativo}`);
    console.log(`  Voice Mode: ${a.voice_mode}`);
    console.log(`  Voice ID: ${a.voice_id}`);
  });
}

checkAgents();
