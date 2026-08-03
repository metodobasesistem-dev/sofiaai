import { supabase } from './src/backend/lib/supabaseClient.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testScan() {
  console.log('--- CARREGANDO CONFIGURAÇÕES ---');
  const { data: settings } = await supabase.from('global_settings').select('apify_api_token').single();
  const apifyToken = settings?.apify_api_token;
  if (!apifyToken) {
    console.error('Apify API Token não configurado em global_settings');
    return;
  }
  console.log('Apify Token carregado.');

  const niche = 'Psicologo';
  const city = 'Muriaé';
  const query = `${niche} em ${city}`.trim();
  const limit = 5;

  console.log(`\n--- CHAMANDO APIFY COM QUERY: "${query}" ---`);
  try {
    const apifyResponse = await axios.post(
      `https://api.apify.com/v2/acts/nwua9Gu5YrADL7ZDj/run-sync-get-dataset-items?token=${apifyToken}`,
      { searchStringsArray: [query], maxCrawledPlacesPerSearch: limit * 2, language: 'pt-BR', countryCode: 'br', scrapeContacts: true },
      { headers: { 'Content-Type': 'application/json' }, timeout: 120000 }
    );
    const rawPlaces = apifyResponse.data || [];
    console.log(`Apify respondeu com sucesso! ${rawPlaces.length} locais encontrados.`);
    if (rawPlaces.length > 0) {
      console.log('Amostra do primeiro local:', JSON.stringify(rawPlaces[0].title || rawPlaces[0].name));
    }
  } catch (err) {
    console.error('❌ ERRO NA CHAMADA AO APIFY:');
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data));
    } else {
      console.error('Mensagem:', err.message);
    }
  }
}

testScan().then(() => process.exit());
