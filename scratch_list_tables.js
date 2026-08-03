import { supabase } from './src/backend/lib/supabaseClient.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function listTables() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log('Buscando OpenAPI spec em:', url);
  try {
    const res = await axios.get(`${url}/rest/v1/`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    });
    
    console.log('\n--- TABELAS EXPOSTAS NO SUPABASE ---');
    const paths = Object.keys(res.data?.paths || {});
    const tables = [...new Set(paths.map(p => p.split('/')[1]).filter(Boolean))];
    console.log(tables.sort());
  } catch (err) {
    console.error('Erro ao buscar tabelas:', err.message);
  }
}

listTables().then(() => process.exit());
