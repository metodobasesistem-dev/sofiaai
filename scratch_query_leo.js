import { supabase } from './src/backend/lib/supabaseClient.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function queryLeo() {
  console.log('--- BUSCANDO LEO_CAMPANHAS ---');
  const { data: campaigns, error: errC } = await supabase.from('leo_campanhas').select('*');
  if (errC) console.error('Erro leo_campanhas:', errC.message);
  else console.log(JSON.stringify(campaigns, null, 2));

  console.log('\n--- BUSCANDO LEO_LEADS ---');
  const { data: leads, error: errL } = await supabase.from('leo_leads').select('*').limit(5);
  if (errL) console.error('Erro leo_leads:', errL.message);
  else console.log(JSON.stringify(leads, null, 2));
}

queryLeo().then(() => process.exit());
