const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://ydbranyhnrjoanxnisez.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkYnJhbnlobnJqb2FueG5pc2V6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MjMxMSwiZXhwIjoyMDkxNTM4MzExfQ.h9fbI3PfBGCeS21fgN-AFp-HWCrjf-SspOx-x5gnW5w',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function check() {
  const userId = 'e7ca25cf-5c65-4f3f-aed9-192f6fe28a80';

  // Check connections
  const { data: whatsapp_connections, error: err } = await supabase.from('whatsapp_connections').select('*').eq('user_id', userId);
  console.log('Whatsapp connections:', whatsapp_connections);
  
  const { data: evolution_instances, error: err2 } = await supabase.from('evolution_instances').select('*').eq('user_id', userId);
  console.log('Evolution instances:', evolution_instances);

  // General connections table?
  const { data: connections, error: err3 } = await supabase.from('connections').select('*').eq('user_id', userId);
  console.log('Connections table:', connections);
}

check();
