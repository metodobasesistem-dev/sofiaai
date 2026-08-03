import { supabase } from './src/backend/lib/supabaseClient.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
  console.log('--- BUSCANDO ÚLTIMAS CAMPANHAS DO RADAR ---');
  const { data: campaigns, error: campErr } = await supabase
    .from('lead_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (campErr) {
    console.error('Erro ao buscar campanhas:', campErr);
  } else {
    console.log(JSON.stringify(campaigns, null, 2));
  }

  console.log('\n--- BUSCANDO ÚLTIMOS LEADS DO RADAR ---');
  const { data: leads, error: leadErr } = await supabase
    .from('leads_radar')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (leadErr) {
    console.error('Erro ao buscar leads:', leadErr);
  } else {
    console.log(leads.map(l => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      status: l.status,
      campaign_id: l.campaign_id,
      created_at: l.created_at
    })));
  }
}

check().then(() => process.exit());
