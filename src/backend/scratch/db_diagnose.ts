import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function diagnose() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Service role to bypass RLS
  const supabase = createClient(url, key);

  console.log('--- DATABASE DIAGNOSIS ---');

  // 1. Check Profiles table RLS
  const { data: policies, error: polError } = await supabase.rpc('get_policies'); // If custom rpc exists
  // Alternative: query pg_policies
  const { data: rawPolicies, error: rawPolError } = await supabase.from('pg_policies').select('*').limit(10);
  
  if (rawPolError) {
    // Try to check if RLS is enabled on agents
    const { data: tables, error: tableError } = await supabase.rpc('check_rls_status');
    console.log('RLS Status Check:', tableError || tables);
  }

  // 2. Check Triggers on agents table
  console.log('Checking triggers on agents...');
  // This usually requires a direct SQL query
  
  console.log('--- END DIAGNOSIS ---');
}

diagnose();
