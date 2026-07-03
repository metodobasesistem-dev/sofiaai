import { Router, Response } from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/authMiddleware.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit per file
});

const SYSTEM_PROMPT = `Você é um especialista sênior em Otimização de Conversão (CRO), Growth Marketing e Tráfego Pago.
Sua missão é auditar a presença digital de um novo cliente com base nas informações enviadas e nos prints fornecidos (bio de Instagram, landing page, anúncios ativos, etc.).

Você deve avaliar os seguintes 5 critérios fundamentais com um Semáforo de Conversão (VERDE para ótimo/sem alterações críticas, AMARELO para oportunidades de melhoria importantes, VERMELHO para falhas graves que prejudicam as vendas):
1. Clareza da Oferta: A proposta de valor é clara logo de início?
2. Velocidade Percebida: O carregamento visual e usabilidade parecem rápidos e dinâmicos?
3. Facilidade de Contato via WhatsApp: O link está evidente e funciona sem fricções?
4. Quebra de Objeções: Há prova social, depoimentos, garantias e respostas para as principais barreiras de compra?
5. Conversão Geral: O funil digital está estruturado de forma ideal para receber tráfego pago (Facebook Ads / Google Ads)?

Você DEVE retornar a resposta ESTRITAMENTE em formato JSON (JSON válido), contendo exatamente o seguinte formato (sem caracteres especiais ou blocos markdown de formatação):

{
  "scenario_current": {
    "clarity_of_offer": { "status": "VERDE" | "AMARELO" | "VERMELHO", "justification": "justificativa detalhada em português" },
    "perceived_speed": { "status": "VERDE" | "AMARELO" | "VERMELHO", "justification": "justificativa detalhada em português" },
    "whatsapp_contact_ease": { "status": "VERDE" | "AMARELO" | "VERMELHO", "justification": "justificativa detalhada em português" },
    "objections_handling": { "status": "VERDE" | "AMARELO" | "VERMELHO", "justification": "justificativa detalhada em português" },
    "overall_conversion": { "status": "VERDE" | "AMARELO" | "VERMELHO", "justification": "justificativa detalhada em português" }
  },
  "action_plan": {
    "short_term": [
      { "task": "Ação imediata", "impact": "Alto" | "Médio" | "Baixo", "difficulty": "Alta" | "Média" | "Baixa" }
    ],
    "medium_term": [
      { "task": "Ação estrutural", "impact": "Alto" | "Médio" | "Baixo", "difficulty": "Alta" | "Média" | "Baixa" }
    ]
  },
  "execution_guide": {
    "content_scripts": [
      { "channel": "Instagram Reels" | "Instagram Stories" | "WhatsApp Copy" | "Landing Page Header", "objective": "Objetivo principal da copy", "script": "Copy/roteiro sugerido para a equipe usar" }
    ],
    "strategic_directions": [
      "Diretriz estratégica 1",
      "Diretriz estratégica 2"
    ]
  }
}
`;

// Helper function to handle image uploads to Supabase storage
async function uploadToSupabaseStorage(userId: string, buffer: Buffer, filename: string): Promise<string | null> {
  try {
    const ext = filename.split('.').pop()?.toLowerCase() || 'png';
    const storagePath = `diagnostics/${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    
    let contentType = 'image/png';
    if (['jpg', 'jpeg'].includes(ext)) contentType = 'image/jpeg';
    else if (ext === 'webp') contentType = 'image/webp';
    else if (ext === 'gif') contentType = 'image/gif';

    const { data, error } = await supabase.storage
      .from('chat-audios') // Reusing the configured public bucket
      .upload(storagePath, buffer, {
        contentType,
        upsert: true
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('chat-audios')
      .getPublicUrl(storagePath);

    return publicUrl;
  } catch (err) {
    console.error('[DiagnosticsRoutes] Error uploading screenshot to storage:', err);
    return null;
  }
}

// 1. GET / - List all diagnostics
router.get('/', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('diagnostics')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      // Friendly warning if table does not exist
      if (error.code === '42P01') {
        res.status(400).json({
          error: 'A tabela de diagnósticos não existe. Por favor, execute a migração SQL localizada em supabase/migrations/20260703130000_create_diagnostics.sql no painel do Supabase.',
          code: 'MIGRATION_PENDING'
        });
        return;
      }
      throw error;
    }

    res.json({ success: true, data });
  } catch (err: any) {
    console.error('[DiagnosticsRoutes] List Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. GET /:id - Get specific diagnostic details
router.get('/:id', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('diagnostics')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ success: false, error: 'Diagnóstico não encontrado.' });
      return;
    }

    res.json({ success: true, data });
  } catch (err: any) {
    console.error('[DiagnosticsRoutes] Fetch Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. POST / - Create a new diagnostic using OpenAI Vision
router.post('/', requireAuth as any, requireAdmin as any, upload.array('screenshots', 5), async (req: AuthenticatedRequest, res: Response) => {
  const { clientName, niche, mainProduct, mainObjections, instagramLink, websiteLink, gmbLink } = req.body;
  const files = req.files as Express.Multer.File[] || [];
  const userId = req.userId!;

  if (!clientName || !niche) {
    res.status(400).json({ success: false, error: 'Nome do cliente e nicho de mercado são obrigatórios.' });
    return;
  }

  try {
    // 1. Criar registro inicial com status 'processing'
    const { data: initialRecord, error: initError } = await supabase
      .from('diagnostics')
      .insert({
        company_id: userId,
        client_name: clientName,
        niche,
        main_product: mainProduct || null,
        main_objections: mainObjections || null,
        instagram_link: instagramLink || null,
        website_link: websiteLink || null,
        gmb_link: gmbLink || null,
        status: 'processing'
      })
      .select()
      .single();

    if (initError) {
      if (initError.code === '42P01') {
        res.status(400).json({
          error: 'A tabela de diagnósticos não existe. Por favor, execute a migração SQL localizada em supabase/migrations/20260703130000_create_diagnostics.sql no painel do Supabase.',
          code: 'MIGRATION_PENDING'
        });
        return;
      }
      throw initError;
    }

    const recordId = initialRecord.id;

    // Execute the AI generation asynchronously so the request doesn't timeout
    // (Vision + OpenAI calls can take 10-25 seconds)
    // We respond to the client with the processing record immediately.
    res.json({ success: true, message: 'Diagnóstico iniciado.', data: initialRecord });

    // Background Execution
    (async () => {
      try {
        const screenshotUrls: string[] = [];
        
        // Upload images to Supabase Storage
        for (const file of files) {
          const url = await uploadToSupabaseStorage(userId, file.buffer, file.originalname);
          if (url) screenshotUrls.push(url);
        }

        // Get OpenAI configuration from settings or environment
        const { data: globalSettings } = await supabase
          .from('global_settings')
          .select('openai_api_key, default_ai_model')
          .limit(1)
          .maybeSingle();

        const apiKey = globalSettings?.openai_api_key || process.env.OPENAI_API_KEY;
        const modelName = globalSettings?.default_ai_model || 'gpt-4o';

        if (!apiKey) {
          throw new Error('Chave de API do OpenAI não configurada no sistema.');
        }

        const openai = new OpenAI({ apiKey });

        const promptText = `Aqui estão os dados do cliente para análise:
Nome do Cliente: ${clientName}
Nicho de Mercado: ${niche}
Produto/Serviço Principal: ${mainProduct || 'Não informado'}
Objeções Frequentes dos Clientes: ${mainObjections || 'Não informado'}
Instagram: ${instagramLink || 'Não informado'}
Site/Landing Page: ${websiteLink || 'Não informado'}
Google Meu Negócio: ${gmbLink || 'Não informado'}

Analise as imagens anexadas (prints de telas da estrutura digital deste cliente) com foco em conversão de Growth.
Gere o relatório estruturado em JSON conforme as regras do sistema.`;

        const userContent: any[] = [{ type: 'text', text: promptText }];
        
        // Append image URLs for Vision
        for (const url of screenshotUrls) {
          userContent.push({
            type: 'image_url',
            image_url: { url }
          });
        }

        console.log(`[DiagnosticsRoutes] Disparando OpenAI GPT Vision para o diagnóstico ${recordId}...`);
        
        const completion = await openai.chat.completions.create({
          model: modelName,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7
        });

        const rawResult = completion.choices[0].message.content || '{}';
        const parsedResult = JSON.parse(rawResult);

        // Atualizar registro com o relatório gerado
        await supabase
          .from('diagnostics')
          .update({
            screenshot_urls: screenshotUrls,
            scenario_current: parsedResult.scenario_current || null,
            action_plan: parsedResult.action_plan || null,
            execution_guide: parsedResult.execution_guide || null,
            status: 'completed'
          })
          .eq('id', recordId);

        console.log(`[DiagnosticsRoutes] Diagnóstico ${recordId} gerado com sucesso!`);
      } catch (err: any) {
        console.error(`[DiagnosticsRoutes] Background Processing Error for diagnostic ${recordId}:`, err);
        await supabase
          .from('diagnostics')
          .update({
            status: 'failed',
            error_message: err.message || 'Erro desconhecido ao processar com OpenAI Vision.'
          })
          .eq('id', recordId);
      }
    })();

  } catch (err: any) {
    console.error('[DiagnosticsRoutes] Create Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. PUT /:id - Update diagnostic details (Editable Report)
router.put('/:id', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { clientName, niche, mainProduct, mainObjections, instagramLink, websiteLink, gmbLink, scenario_current, action_plan, execution_guide } = req.body;

  try {
    const { data, error } = await supabase
      .from('diagnostics')
      .update({
        client_name: clientName,
        niche,
        main_product: mainProduct,
        main_objections: mainObjections,
        instagram_link: instagramLink,
        website_link: websiteLink,
        gmb_link: gmbLink,
        scenario_current,
        action_plan,
        execution_guide,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, message: 'Relatório atualizado com sucesso.', data });
  } catch (err: any) {
    console.error('[DiagnosticsRoutes] Update Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. DELETE /:id - Delete a diagnostic
router.delete('/:id', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('diagnostics')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Diagnóstico excluído com sucesso.' });
  } catch (err: any) {
    console.error('[DiagnosticsRoutes] Delete Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
