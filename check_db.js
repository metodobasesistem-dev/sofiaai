import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function lookInDb() {
  const { data, error } = await supabase.from('messages').select('*').limit(5).order('created_at', { ascending: false });
  console.log('Messages from DB:', data);
  const { data: logs } = await supabase.from('sys_logs').select('*').limit(5).order('created_at', { ascending: false });
  console.log('SysLogs DB:', logs);
}

lookInDb();
