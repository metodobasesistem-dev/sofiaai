import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function scanAgents() {
  console.log('--- SCANNING ALL AGENTS ---');
  const { data: agents, error } = await supabase.from('agents').select('id, user_id, nome, status_ativo');
  
  if (error) {
    console.error('Failed to scan agents:', error.message);
    return;
  }

  agents.forEach(a => {
    console.log(`- Agent: ${a.nome} | UserID: ${a.user_id} | Active: ${a.status_ativo}`);
  });
}

scanAgents();
