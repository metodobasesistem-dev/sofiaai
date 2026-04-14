import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function diagnose() {
  console.log('--- DIAGNOSIS: Data Loading Issue ---');

  // 1. Get all profiles to see who is in the system
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, role');
  console.log('Profiles in system:');
  console.table(profiles);

  const testUserId = profiles?.[0]?.id;
  if (!testUserId) {
    console.log('No profiles found!');
    return;
  }

  // 2. Check Threads
  const { count: threadsCount } = await supabase.from('threads').select('*', { count: 'exact', head: true });
  console.log(`Total threads in DB: ${threadsCount}`);
  
  const { count: userThreadsCount } = await supabase.from('threads').select('*', { count: 'exact', head: true }).eq('user_id', testUserId);
  console.log(`Threads for user ${testUserId}: ${userThreadsCount}`);

  // 3. Check Contacts
  const { count: contactsCount } = await supabase.from('contacts').select('*', { count: 'exact', head: true });
  console.log(`Total contacts in DB: ${contactsCount}`);

  const { count: userContactsCount } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('user_id', testUserId);
  console.log(`Contacts for user ${testUserId}: ${userContactsCount}`);

  // 4. Check Sample Thread
  const { data: sampleThread } = await supabase.from('threads').select('*').limit(1);
  console.log('Sample thread data:', JSON.stringify(sampleThread, null, 2));

  // 5. Check if RLS is enabled on these tables
  console.log('\n--- Checking Table Policies (Mental) ---');
  console.log('If user threads count is 0 but total threads is > 0, then we have a user_id mismatch.');
}

diagnose();
