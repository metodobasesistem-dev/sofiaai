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
  console.log('--- SCANNING RECENT THREADS V2 ---');
  const { data: threads, error } = await supabase
    .from('threads')
    .select('id, user_id, contact_name')
    .order('updated_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error('Failed to scan threads:', error.message);
    return;
  }

  threads.forEach(t => {
    console.log(`- Thread: ${t.id} | UserID: ${t.user_id} | Contact: ${t.contact_name}`);
  });
}

scanThreads();
