import { supabase } from './src/backend/lib/supabaseClient.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function debugFilter() {
  const { data: settings } = await supabase.from('global_settings').select('apify_api_token').single();
  const apifyToken = settings?.apify_api_token;
  if (!apifyToken) return console.error('Sem token');

  const query = 'Psicologo em Muriaé';
  console.log(`Buscando no Apify: "${query}"`);

  try {
    const apifyResponse = await axios.post(
      `https://api.apify.com/v2/acts/nwua9Gu5YrADL7ZDj/run-sync-get-dataset-items?token=${apifyToken}`,
      { searchStringsArray: [query], maxCrawledPlacesPerSearch: 10, language: 'pt-BR', countryCode: 'br', scrapeContacts: true },
      { headers: { 'Content-Type': 'application/json' }, timeout: 120000 }
    );
    const rawPlaces = apifyResponse.data || [];
    console.log(`\nAnalisando ${rawPlaces.length} locais encontrados:`);
    
    for (let i = 0; i < rawPlaces.length; i++) {
      const place = rawPlaces[i];
      const rating = place.totalScore || 0;
      const phone = place.phoneUnformatted || place.phone || '';
      const ratingCount = place.reviewsCount || 0;
      
      const digitsOnly = phone.replace(/\D/g, '');
      const normalized = digitsOnly.startsWith('55') && digitsOnly.length > 11 ? digitsOnly.slice(2) : digitsOnly;
      
      const isMobile = normalized.length === 11 && normalized[2] === '9';
      
      console.log(`\n[${i+1}] Nome: ${place.title}`);
      console.log(`   - Rating: ${rating} (esperado >= 3)`);
      console.log(`   - Reviews: ${ratingCount} (esperado >= 1)`);
      console.log(`   - Telefone bruto: "${phone}"`);
      console.log(`   - Digitos extraídos: "${digitsOnly}"`);
      console.log(`   - Normalizado: "${normalized}"`);
      console.log(`   - É celular válido? ${isMobile ? 'SIM ✅' : 'NÃO ❌'}`);
      
      // Checar motivos de descarte
      const reasons = [];
      if (rating < 3) reasons.push('Rating < 3');
      if (!phone) reasons.push('Sem telefone');
      if (ratingCount < 1) reasons.push('Reviews < 1');
      if (phone && !isMobile) reasons.push('Não é celular (11 dígitos começando com 9)');
      
      if (reasons.length > 0) {
        console.log(`   - ❌ DESCARTADO por: ${reasons.join(', ')}`);
      } else {
        console.log(`   - PROCURA APROVADA! 🎉`);
      }
    }
  } catch (err) {
    console.error('Erro:', err.message);
  }
}

debugFilter().then(() => process.exit());
