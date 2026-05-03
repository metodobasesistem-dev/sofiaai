import { leoInstagramService } from './src/backend/services/leoInstagramService.ts';
import { supabase } from './src/backend/lib/supabaseClient.ts';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function simulateComment() {
  console.log('--- Iniciando Simulação de Comentário Leo ---');
  
  // 1. Buscar uma empresa conectada para o teste
  const { data: config } = await supabase
    .from('leo_config')
    .select('company_id, instagram_account_id, instagram_username')
    .not('instagram_account_id', 'is', null)
    .limit(1)
    .single();

  if (!config) {
    console.error('❌ Erro: Nenhuma empresa com Instagram conectado encontrada no banco.');
    return;
  }

  console.log(`✅ Usando conta: @${config.instagram_username} (ID: ${config.instagram_account_id})`);

  // 2. Simular payload da Meta
  const payload = {
    object: 'instagram',
    entry: [
      {
        id: config.instagram_account_id,
        time: Date.now(),
        changes: [
          {
            value: {
              from: { id: 'TEST_USER_ID', username: 'tester_wppai' },
              media: { id: 'TEST_MEDIA_ID', media_product_type: 'FEED' },
              id: 'TEST_COMMENT_ID',
              text: 'Quero saber mais'
            },
            field: 'comments'
          }
        ]
      }
    ]
  };

  console.log('🚀 Disparando processWebhookEvent...');
  try {
    await leoInstagramService.processWebhookEvent(payload);
    console.log('✅ Processamento concluído.');
  } catch (err) {
    console.error('❌ Erro durante o processamento:', err);
  }
}

simulateComment().then(() => process.exit());
