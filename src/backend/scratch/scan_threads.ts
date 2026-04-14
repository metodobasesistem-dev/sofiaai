import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function scanThreads() {
  console.log('--- SCANNING RECENT THREADS ---');
  const { data: threads, error } = await supabase
    .from('threads')
    .select('id, user_id, contact_name, msg_count, agent_name') // Assuming agent_name might exist
    .order('updated_at', { ascending: false })
    .limit(5);
  
  if (error) {
    console.error('Failed to scan threads:', error.message);
    // Try again without agent_name if it failed
    const { data: threads2 } = await supabase
      .from('threads')
      .select('id, user_id, contact_name, msg_count')
      .order('updated_at', { ascending: false })
      .limit(5);
    threads2?.forEach(t => console.log(`- Thread: ${t.id} | UserID: ${t.user_id} | Name: ${t.contact_name}`));
    return;
  }

  threads.forEach(t => {
    console.log(`- Thread: ${t.id} | UserID: ${t.user_id} | Name: ${t.contact_name} | Agent: ${t.agent_name || 'N/A'}`);
  });
}

scanThreads();
