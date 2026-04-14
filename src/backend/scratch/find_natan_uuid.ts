import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function diag() {
  const { data: profs } = await supabase.from('profiles').select('*').ilike('email', '%iamnatan%');
  console.log('NATAN PROFILES:', JSON.stringify(profs, null, 2));
}

diag();
