import { supabase } from './src/backend/lib/supabaseClient.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkColumns() {
  console.log('--- COLUNAS DE THREADS ---');
  const { data: threads, error: errT } = await supabase.from('threads').select('*').limit(1);
  if (errT) console.error('Erro threads:', errT.message);
  else console.log(Object.keys(threads[0] || {}));

  console.log('\n--- COLUNAS DE LEADS_RADAR ---');
  const { data: leads, error: errL } = await supabase.from('leads_radar').select('*').limit(1);
  if (errL) console.error('Erro leads_radar:', errL.message);
  else console.log(Object.keys(leads[0] || {}));

  console.log('\n--- COLUNAS DE APPOINTMENTS ---');
  const { data: appts, error: errA } = await supabase.from('appointments').select('*').limit(1);
  if (errA) console.error('Erro appointments:', errA.message);
  else console.log(Object.keys(appts[0] || {}));
}

checkColumns().then(() => process.exit());
