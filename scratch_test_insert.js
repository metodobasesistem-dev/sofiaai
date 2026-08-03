import { supabase } from './src/backend/lib/supabaseClient.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testInsert() {
  console.log('--- TESTANDO INSERÇÃO NO BANCO DE DADOS ---');
  
  // Buscar a campanha criada hoje
  const { data: campaign } = await supabase
    .from('lead_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
    
  if (!campaign) {
    console.error('Nenhuma campanha encontrada para vincular o lead.');
    return;
  }
  
  console.log(`Campanha encontrada: ID: ${campaign.id}, Nome: ${campaign.name}`);

  const sampleLead = {
    name: 'Psicólogo Teste da Silva',
    phone: '32984704143',
    address: 'Rua Teste, 123, Muriaé',
    rating: 5,
    user_rating_count: 10,
    website: 'http://teste.com',
    review_summary: 'Análise de teste da IA.',
    personalized_message: null, // nosso ajuste
    instagram: 'http://instagram.com/teste',
    email: 'teste@teste.com',
    pain_score: 2,
    opportunity_score: 1,
    place_id: 'place_test_' + Date.now(),
    niche: 'Psicologo',
    city: 'Muriaé',
    status: 'novo',
    campaign_id: campaign.id
  };

  const { data, error } = await supabase
    .from('leads_radar')
    .upsert(sampleLead, { onConflict: 'place_id' })
    .select();

  if (error) {
    console.error('❌ ERRO NO UPSERT:', error);
  } else {
    console.log('✅ UPSERT REALIZADO COM SUCESSO:', data);
    
    // Deletar o registro de teste
    const { error: delErr } = await supabase.from('leads_radar').delete().eq('place_id', sampleLead.place_id);
    if (!delErr) console.log('Lead de teste removido.');
  }
}

testInsert().then(() => process.exit());
