import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  const { data: profile } = await supabase.from('profiles').select('id').limit(1).single();
  const testUserId = profile.id;
  const threadId = `${testUserId}_5511999999999`;

  const messageData = {
     id: 'TEST_MSSG_1',
     user_id: testUserId,
     thread_id: threadId,
     text: 'Mensagem de Teste Diagnostic',
     direction: 'inbound',
     timestamp: Date.now(),
     created_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from('messages').upsert(messageData);
  
  if (error) {
    console.error('INSERT ERROR MESSAGES:', JSON.stringify(error, null, 2));
  } else {
    console.log('INSERT SUCCESS MESSAGES:', data);
  }
}

testInsert();
