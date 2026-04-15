import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkSchema() {
  console.log('--- Checking quick_replies schema ---');
  const { data, error } = await supabase.rpc('get_table_schema', { table_name: 'quick_replies' });
  
  if (error) {
    // If RPC doesn't exist, try a simple select
    const { data: cols, error: err2 } = await supabase.from('quick_replies').select('*').limit(1);
    if (err2) {
       console.error('Error:', err2.message);
    } else {
       console.log('Columns found:', Object.keys(cols[0] || {}));
    }
  } else {
    console.log('Schema:', data);
  }
}

checkSchema();
