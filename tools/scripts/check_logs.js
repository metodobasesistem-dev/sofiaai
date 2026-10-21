import { supabase } from './src/backend/lib/supabaseClient.ts';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
  const { data } = await supabase
    .from('leo_instagram_interacoes')
    .select('*, lead:leo_leads(nome)')
    .order('created_at', { ascending: false })
    .limit(10);
  
  console.log('--- ÚLTIMAS INTERAÇÕES NO BANCO ---');
  console.log(JSON.stringify(data, null, 2));
}

check().then(() => process.exit());
