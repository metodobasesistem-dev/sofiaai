import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function resetThreads() {
  console.log('--- FORCING ALL THREADS TO IA MODE ---');
  const { data, error } = await supabase
    .from('threads')
    .update({ status: 'ia' })
    .neq('status', 'ia'); // Update everyone who is not already 'ia'

  if (error) {
    console.error('FAILED to reset threads:', error.message);
  } else {
    console.log('SUCCESS: All conversations are now back in IA mode!');
  }
}

resetThreads();
