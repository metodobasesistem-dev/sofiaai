import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function runCounts() {
  const { count: threadsCount } = await supabase.from('threads').select('*', { count: 'exact', head: true });
  const { count: messagesCount } = await supabase.from('messages').select('*', { count: 'exact', head: true });
  const { count: contactsCount } = await supabase.from('contacts').select('*', { count: 'exact', head: true });
  const { count: profilesCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  
  console.log(`Threads: ${threadsCount}`);
  console.log(`Messages: ${messagesCount}`);
  console.log(`Contacts: ${contactsCount}`);
  console.log(`Profiles: ${profilesCount}`);
}

runCounts();
