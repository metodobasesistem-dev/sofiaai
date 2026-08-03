import { supabase } from './src/backend/lib/supabaseClient.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
  const { data: settings } = await supabase.from('global_settings').select('apify_api_token').single();
  const token = settings?.apify_api_token;
  if (!token) {
    console.error('Nenhum Apify token encontrado em global_settings');
    return;
  }
  console.log('Apify Token encontrado:', token.substring(0, 10) + '...');

  const actorId = 'nwua9Gu5YrADL7ZDj';
  try {
    const response = await axios.get(
      `https://api.apify.com/v2/acts/${actorId}/runs`,
      {
        params: { token, limit: 5 },
        timeout: 10000
      }
    );
    
    console.log('\n--- ÚLTIMAS 5 EXECUÇÕES DO GOOGLE MAPS SCRAPER NO APIFY ---');
    const runs = response.data?.data?.items || [];
    if (runs.length === 0) {
      console.log('Nenhuma execução encontrada.');
    }
    for (const run of runs) {
      console.log(`ID: ${run.id}`);
      console.log(`Status: ${run.status}`);
      console.log(`Criado em: ${run.startedAt}`);
      console.log(`Finalizado em: ${run.finishedAt || 'Ainda rodando'}`);
      console.log(`Custo: $${run.usageUsd}`);
      
      // Buscar inputs da execução para ver a query pesquisada
      try {
        const inputRes = await axios.get(`https://api.apify.com/v2/key-value-stores/${run.defaultKeyValueStoreId}/records/INPUT?token=${token}`);
        console.log('Input Query:', inputRes.data?.searchStringsArray);
      } catch (err) {
        console.log('Input Query: Não foi possível carregar');
      }
      console.log('--------------------------------------------------');
    }
  } catch (err) {
    console.error('Erro ao consultar Apify API:', err.message);
  }
}

check().then(() => process.exit());
