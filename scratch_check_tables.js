import { supabase } from './src/backend/lib/supabaseClient.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
  const tables = ['profiles', 'agents', 'messages', 'threads', 'contacts', 'leads_radar', 'lead_campaigns', 'campaigns'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`Tabela ${t}: ❌ Erro: ${error.message}`);
    } else {
      console.log(`Tabela ${t}: ✅ Sucesso (${data.length} registros)`);
    }
  }
}
check().then(() => process.exit());
