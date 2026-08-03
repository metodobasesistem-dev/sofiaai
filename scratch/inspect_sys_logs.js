import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectLogs() {
  const { data, error } = await supabase
    .from('sys_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
    
  console.log('Error:', error);
  if (data) {
    console.log('Found logs:', data.length);
    for (const log of data) {
      console.log(`ID: ${log.id} | Msg: ${log.message} | Created: ${log.created_at}`);
      if (log.payload) {
        console.log('Payload:', JSON.stringify(log.payload, null, 2).slice(0, 500));
      }
    }
  }
}

inspectLogs();
