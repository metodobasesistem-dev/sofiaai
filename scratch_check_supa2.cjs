const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ydbranyhnrjoanxnisez.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkYnJhbnlobnJqb2FueG5pc2V6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MjMxMSwiZXhwIjoyMDkxNTM4MzExfQ.h9fbI3PfBGCeS21fgN-AFp-HWCrjf-SspOx-x5gnW5w');

async function check() {
  const { data: users } = await supabase.from('users').select('*').limit(10);
  console.log('users:', users);
  
  const { data: wp_connections } = await supabase.from('whatsapp_connections').select('*').limit(10);
  console.log('whatsapp_connections:', wp_connections);

  const { data: threads } = await supabase.from('threads').select('*').limit(1);
  console.log('threads:', threads);
}

check();
