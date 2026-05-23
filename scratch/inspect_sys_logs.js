import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectLogs() {
  console.log("=== RECENT SYS_LOGS (Last 2 days) ===");
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: logs, error: err } = await supabase
    .from('sys_logs')
    .select('*')
    .gte('created_at', twoDaysAgo)
    .order('created_at', { ascending: false });

  if (err) {
    console.error("Error fetching logs:", err);
  } else {
    console.log(`Total logs in last 2 days: ${logs.length}`);
    console.log(JSON.stringify(logs, null, 2));
  }
}

inspectLogs();
