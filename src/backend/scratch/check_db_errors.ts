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

async function checkSchema() {
  console.log('--- DB SCHEMA CHECK ---');
  
  // Checking contacts table
  const { data: contacts, error: e1 } = await supabase.from('contacts').select('*').limit(1);
  console.log('Contacts access:', e1 ? 'Failed' : 'Success');
  
  // Checking messages table
  const { data: messages, error: e2 } = await supabase.from('messages').select('*').limit(1);
  console.log('Messages access:', e2 ? 'Failed' : 'Success');

  if (e1) console.log('Contacts Error:', e1.message);
  if (e2) console.log('Messages Error:', e2.message);
}

checkSchema();
