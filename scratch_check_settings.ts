import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Fix for UTF-16 .env.local if needed
if (fs.existsSync('.env.local')) {
  const content = fs.readFileSync('.env.local', 'utf8');
  if (content.includes('\0')) {
    fs.writeFileSync('.env.local', content.replace(/\0/g, ''), 'utf8');
  }
}
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log('Checking global_settings columns...');
  const { data, error } = await supabase.from('global_settings').select('*').limit(1);
  if (error) {
    console.error('Error fetching global_settings:', error);
  } else {
    console.log('Columns found:', Object.keys(data[0] || {}));
  }
}

check();
