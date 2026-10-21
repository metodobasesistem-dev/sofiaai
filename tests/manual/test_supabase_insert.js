import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  console.log('Testing Supabase Insert to threads table...');
  const testId = 'TEST_' + Date.now();
  
  // Get an existing user
  const { data: profile } = await supabase.from('profiles').select('id').limit(1).single();
  
  if (!profile) {
      console.log('No profiles found');
      return;
  }
  
  const testUserId = profile.id;
  const threadId = `${testUserId}_5511999999999`;

  const threadData = {
    id: threadId,
    user_id: testUserId,
    last_message: 'Mensagem de Teste Diagnostic',
    last_message_time: new Date().toISOString(),
    status: 'ia', 
    contact_name: 'Cliente',
    remote_jid: '5511999999999@c.us',
    display_phone: '5511999999999',
    agent_name: 'Sofia'
  };

  const { data, error } = await supabase.from('threads').upsert(threadData);
  
  if (error) {
    console.error('INSERT ERROR THREADS:', JSON.stringify(error, null, 2));
  } else {
    console.log('INSERT SUCCESS THREADS:', data);
  }
}

testInsert();
