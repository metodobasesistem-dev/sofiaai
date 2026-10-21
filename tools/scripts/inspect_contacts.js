import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectContacts() {
  console.log("=== CONTACTS WITH PHONE 553288996173 ===");
  const { data: contacts, error: err } = await supabase
    .from('contacts')
    .select('*')
    .eq('telefone', '553288996173');

  if (err) {
    console.error("Error fetching contacts:", err);
  } else {
    console.log(JSON.stringify(contacts, null, 2));
  }
}

inspectContacts();
