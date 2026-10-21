import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function runQueries() {
  console.log("=== DB QUERY VIA SUPABASE CLIENT ===");

  const { count: threadsCount, error: tErr } = await supabase.from('threads').select('*', { count: 'exact', head: true });
  console.log("Threads count:", threadsCount, tErr || "");

  const { count: messagesCount, error: mErr } = await supabase.from('messages').select('*', { count: 'exact', head: true });
  console.log("Messages count:", messagesCount, mErr || "");

  const { count: contactsCount, error: cErr } = await supabase.from('contacts').select('*', { count: 'exact', head: true });
  console.log("Contacts count:", contactsCount, cErr || "");

  const { count: profilesCount, error: pErr } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  console.log("Profiles count:", profilesCount, pErr || "");

  console.log("\n--- Recent Threads (last 5) ---");
  const { data: recentThreads } = await supabase.from('threads').select('*').order('updated_at', { ascending: false }).limit(5);
  console.log(JSON.stringify(recentThreads, null, 2));

  console.log("\n--- Recent Messages (last 5) ---");
  const { data: recentMessages } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(5);
  console.log(JSON.stringify(recentMessages, null, 2));
}

runQueries();
