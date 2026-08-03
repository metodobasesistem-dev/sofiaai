import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function listRPCs() {
  console.log('Buscando RPCs no Supabase:', url);
  try {
    const res = await axios.get(`${url}/rest/v1/`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    });
    
    console.log('\n--- RPCS DISPONÍVEIS ---');
    const paths = Object.keys(res.data?.paths || {});
    const rpcs = paths.filter(p => p.startsWith('/rpc/'));
    console.log(rpcs);
  } catch (err) {
    console.error('Erro ao buscar RPCs:', err.message);
  }
}

listRPCs().then(() => process.exit());
