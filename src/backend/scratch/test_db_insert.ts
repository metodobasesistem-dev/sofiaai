import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load envs
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  const userId = 'WUmNt8pzzKPOxxhcozxPfy63onL2';
  console.log(`--- TESTING INSERT WITH ID: ${userId} ---`);
  
  const { error } = await supabase.from('messages').insert({
    thread_id: 'test_thread',
    user_id: userId,
    text: 'Test message',
    direction: 'outbound'
  });

  if (error) {
    console.error('INSERT FAILED!', error.message);
  } else {
    console.log('INSERT SUCCESS! (Wait, so the column is NOT a UUID?)');
  }
}

testInsert();
