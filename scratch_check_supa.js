const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://ydbranyhnrjoanxnisez.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkYnJhbnlobnJqb2FueG5pc2V6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MjMxMSwiZXhwIjoyMDkxNTM4MzExfQ.h9fbI3PfBGCeS21fgN-AFp-HWCrjf-SspOx-x5gnW5w'
);

async function check() {
  const { data: users, error: err } = await supabase.from('users').select('*').eq('email', 'pedroribeiromota82@gmail.com');
  console.log('User:', users);
  
  if (users && users.length > 0) {
    const userId = users[0].id;
    console.log('UserId:', userId);
    const { data: connections, error: err2 } = await supabase.from('whatsapp_connections').select('*').eq('user_id', userId);
    console.log('Connections:', connections);
  }
}

check();
