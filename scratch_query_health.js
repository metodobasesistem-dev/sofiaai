import { supabase } from './src/backend/lib/supabaseClient.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function queryHealthAndCampaigns() {
  console.log('--- BUSCANDO SYS_HEALTH ---');
  const { data: health, error: errH } = await supabase.from('sys_health').select('*');
  if (errH) console.error('Erro sys_health:', errH.message);
  else console.log(JSON.stringify(health, null, 2));

  console.log('\n--- BUSCANDO ÚLTIMAS CAMPANHAS ---');
  const { data: campaigns, error: errC } = await supabase.from('lead_campaigns').select('*').order('created_at', { ascending: false }).limit(5);
  if (errC) console.error('Erro lead_campaigns:', errC.message);
  else console.log(JSON.stringify(campaigns, null, 2));

  console.log('\n--- BUSCANDO ÚLTIMOS LEADS DO RADAR ---');
  const { data: leads, error: errL } = await supabase.from('leads_radar').select('id, name, phone, campaign_id, created_at').order('created_at', { ascending: false }).limit(5);
  if (errL) console.error('Erro leads_radar:', errL.message);
  else console.log(JSON.stringify(leads, null, 2));
}

queryHealthAndCampaigns().then(() => process.exit());
