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

const SYSTEM_PROMPT = `Você é um Especialista Sênior em Posicionamento Digital, Conversão (CRO) e Copywriting. Sua missão é analisar a estrutura digital de um negócio e gerar um Relatório de Auditoria e Onboarding de alto valor.

Você receberá dados de um cliente (nicho, produto principal, objeções) e imagens (prints do site, Instagram). Você deve analisar como está a imagem digital desse cliente hoje e o que ele precisa fazer em termos de estrutura e conteúdo para se tornar uma autoridade e converter mais.

REGRAS E RESTRIÇÕES CRÍTICAS:
- PROIBIDO criar roteiros de vídeo que comecem com apresentações genéricas (ex: "Olá, meu nome é…", "Venha conferir", "Você sabia que…").
- OBRIGATÓRIO usar ganchos (hooks) fortes nos primeiros 3 segundos dos roteiros, focando na dor ou no desejo do cliente final.
- NÃO crie estratégias complexas de orçamento de tráfego pago. Apenas explique a importância estratégica de anunciar, destacando de forma simples a importância do Meta Ads (distribuição, atração e desejo) e Google Ads (capturar demanda de pesquisa).
- Retorne a resposta ESTRITAMENTE em formato JSON (JSON válido), contendo exatamente o seguinte formato (sem caracteres especiais ou blocos markdown de formatação):

{
  "scenario_current": {
    "first_impression": { "status": "VERDE" | "AMARELO" | "VERMELHO", "justification": "justificativa detalhada em português" },
    "contact_friction": { "status": "VERDE" | "AMARELO" | "VERMELHO", "justification": "justificativa detalhada em português" },
    "objections_handling": { "status": "VERDE" | "AMARELO" | "VERMELHO", "justification": "justificativa detalhada em português" }
  },
  "action_plan": {
    "short_term": [
      { "task": "Ajuste rápido", "impact": "Alto" | "Médio" | "Baixo", "difficulty": "Alta" | "Média" | "Baixa" }
    ],
    "medium_term": [
      { "task": "Ação estrutural", "impact": "Alto" | "Médio" | "Baixo", "difficulty": "Alta" | "Média" | "Baixa" }
    ]
  },
  "content_strategy": {
    "authority": "estratégia detalhada para o pilar de autoridade",
    "connection": "estratégia detalhada para o pilar de conexão",
    "objections": "estratégia detalhada para o pilar de quebra de objeções"
  },
  "next_steps_traffic": "parágrafo persuasivo detalhando a importância do tráfego pago (Meta Ads e Google Ads) sem entrar em orçamentos complexos",
  "execution_guide": {
    "content_scripts": [
      { "title": "Título do vídeo", "hook": "Gancho forte nos primeiros 3 segundos focado na dor ou desejo", "body": "Desenvolvimento rápido", "cta": "Chamada para ação para o WhatsApp" }
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
  const { clientName, niche, mainProduct, mainObjections, instagramLink, websiteLink, gmbLink, additionalInfo } = req.body;
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
        additional_info: additionalInfo || null,
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
${additionalInfo ? `Informações Adicionais (Instruções Extras): ${additionalInfo}` : ''}

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
            execution_guide: {
              content_scripts: parsedResult.execution_guide?.content_scripts || [],
              content_strategy: parsedResult.content_strategy || null,
              next_steps_traffic: parsedResult.next_steps_traffic || null
            },
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
  const { clientName, niche, mainProduct, mainObjections, instagramLink, websiteLink, gmbLink, additionalInfo, scenario_current, action_plan, execution_guide } = req.body;

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
        additional_info: additionalInfo,
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
