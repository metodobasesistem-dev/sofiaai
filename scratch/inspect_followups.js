import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  const targetUserId = "d7af87c6-a56b-4163-8dc2-a9ef61e8ac42";
  
  console.log(`=== THREADS FOR USER ${targetUserId} ===`);
  const { data: threads, error: threadErr } = await supabase
    .from('threads')
    .select('*')
    .eq('user_id', targetUserId);
    
  if (threadErr) {
    console.error("Error fetching threads:", threadErr);
  } else {
    console.log(`Found ${threads.length} threads.`);
    console.log(JSON.stringify(threads, null, 2));
    
    for (const thread of threads) {
      console.log(`\n=== MESSAGES FOR THREAD ${thread.id} ===`);
      const { data: msgs, error: msgErr } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', thread.id)
        .order('timestamp', { ascending: false })
        .limit(10);
      if (msgErr) {
        console.error("Error fetching messages:", msgErr);
      } else {
        console.log(JSON.stringify(msgs, null, 2));
      }
    }
  }
}

inspect();
