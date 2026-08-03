import { supabase } from './src/backend/lib/supabaseClient.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkProfiles() {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) console.error('Erro profiles:', error.message);
  else console.log(JSON.stringify(data, null, 2));
}

checkProfiles().then(() => process.exit());
