/**
 * Radar de Leads Routes — disponível para todos os usuários autenticados.
 * Separado do adminApiRoutes para não exigir role 'admin'.
 */
import { Router, Response } from 'express';
import axios from 'axios';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { generateAIResponse } from '../services/aiService.js';
import { MetaProvider } from '../providers/MetaProvider.js';
import { WhatsAppProviderFactory } from '../providers/WhatsAppProviderFactory.js';
import { whatsappService } from '../services/whatsappService.js';
import { EvolutionApiService } from '../services/evolutionApiService.js';
import { runInstagramLeadScan } from '../services/instagramLeadSearch.js';

const router = Router();
router.use(requireAuth as any);

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Encurta o nome de um estabelecimento para uso em variáveis de template WhatsApp.
 * Pega só a primeira parte antes de "|", "–" ou "-", e limita a 40 caracteres.
 * Ex: "Estúdio Alpha | Consultoria e Projetos em Muriaé" → "Estúdio Alpha"
 */
function shortenEstablishmentName(name: string): string {
  if (!name) return name;
  const short = name.split(/\s*[|–-]\s*/)[0].trim();
  return short.length > 40 ? short.substring(0, 40).trimEnd() : short;
}

/**
 * Busca o primeiro nome do remetente com fallback em cascata:
 * 1. profiles.nome_completo  (salvo nas Configurações → Conta)
 * 2. profiles.name           (nome legado)
 * 3. auth.users.raw_user_meta_data->>'full_name'  (Google OAuth)
 * 4. auth.users.raw_user_meta_data->>'name'       (outros provedores OAuth)
 * 5. 'Consultor'             (último recurso)
 *
 * Os passos 3-4 garantem que mesmo sem a migration de nome_completo rodada,
 * o nome real do usuário é usado.
 */
async function fetchSenderFirstName(userId: string): Promise<string> {
  // Tenta profiles primeiro (colunas podem não existir se migration pendente)
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, nome_completo')
    .eq('id', userId)
    .maybeSingle();

  const profileName = (profile as any)?.nome_completo || (profile as any)?.name;
  if (profileName) {
    return profileName.trim().split(/\s+/)[0] || profileName;
  }

  // Fallback: metadados do auth (Google OAuth / outros provedores)
  // Só acessível com service_role — seguro no backend.
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const meta = authUser?.user?.user_metadata;
    const oauthName = meta?.full_name || meta?.name || null;
    if (oauthName) {
      return oauthName.trim().split(/\s+/)[0] || oauthName;
    }
  } catch (_) {
    // admin.getUserById pode não estar disponível em todos os planos — ignora
  }

  return 'Consultor';
}

// ─── In-memory autopilot job tracker (per userId) ─────────────────────────
interface AutopilotJob {
  total: number;
  sent: number;
  errors: number;
  currentLead: string | null;
  log: Array<{ name: string; phone: string; status: 'sent' | 'error'; time: string }>;
  jobStatus: 'running' | 'done' | 'cancelled';
  cancelRequested: boolean;
  nextSendAt: number | null;
}
const autopilotJobs = new Map<string, AutopilotJob>();

// ─── Campaigns ─────────────────────────────────────────────────────────────

router.get('/campaigns', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('lead_campaigns')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/campaigns/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, status } = req.body;
    const payload: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) payload.name = name;
    if (status !== undefined) payload.status = status;
    const { error } = await supabase.from('lead_campaigns').update(payload)
      .eq('id', req.params.id).eq('user_id', req.userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/campaigns/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await supabase.from('leads_radar').delete().eq('campaign_id', req.params.id);
    const { error } = await supabase.from('lead_campaigns').delete()
      .eq('id', req.params.id).eq('user_id', req.userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Leads ─────────────────────────────────────────────────────────────────

router.get('/leads', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaign_id } = req.query as any;
    
    // Obter IDs de campanhas pertencentes a este usuário para filtrar/validar
    const { data: userCampaigns, error: campErr } = await supabase
      .from('lead_campaigns')
      .select('id')
      .eq('user_id', req.userId);
      
    if (campErr) throw campErr;
    const campaignIds = (userCampaigns || []).map(c => c.id);

    if (campaignIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    let query = supabase.from('leads_radar').select('*');
    if (campaign_id) {
      if (!campaignIds.includes(campaign_id)) {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }
      query = query.eq('campaign_id', campaign_id);
    } else {
      query = query.in('campaign_id', campaignIds);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function runLeadScanBackground(params: {
  niche: string; city: string; zip?: string; limit: number; context: string; apifyToken: string; campaignId: string; source?: 'google' | 'instagram';
}) {
  const { niche, city, zip, limit, context, apifyToken, campaignId, source = 'google' } = params;

  if (source === 'instagram') {
    await runInstagramLeadScan({ niche, city, limit, context, apifyToken, campaignId });
  } else {
    // ─────────────────────────────────────────────────────────────────────────
    // GOOGLE MAPS FLOW
    // ─────────────────────────────────────────────────────────────────────────
    const query = `${niche} em ${city} ${zip || ''}`.trim();
    console.log(`[LeadRadar][BG] Iniciando busca Apify: "${query}" com meta de ${limit} leads.`);

    let rawPlaces: any[] = [];
    try {
      const apifyResponse = await axios.post(
        `https://api.apify.com/v2/acts/nwua9Gu5YrADL7ZDj/run-sync-get-dataset-items?token=${apifyToken}`,
        { searchStringsArray: [query], maxCrawledPlacesPerSearch: limit * 2, language: 'pt-BR', countryCode: 'br', scrapeContacts: true },
        { headers: { 'Content-Type': 'application/json' }, timeout: 300000 }
      );
      rawPlaces = apifyResponse.data || [];
    } catch (apifyErr: any) {
      console.warn('[LeadRadar][BG] Erro Apify Google:', apifyErr.response?.data || apifyErr.message);
      return;
    }

    console.log(`[LeadRadar][BG] ${rawPlaces.length} locais brutos recebidos.`);
    const leadsProcessados = [];

    for (const place of rawPlaces) {
      if (leadsProcessados.length >= limit) break;
      const rating = place.totalScore || 0;
      const phone = place.phoneUnformatted || place.phone || '';
      const ratingCount = place.reviewsCount || 0;
      if (rating < 3 || !phone || ratingCount < 1) continue;
      const digitsOnly = phone.replace(/\D/g, '');
      const normalized = digitsOnly.startsWith('55') && digitsOnly.length > 11 ? digitsOnly.slice(2) : digitsOnly;
      if (normalized.length !== 11 || normalized[2] !== '9') continue;

      let pain_score = 0, opportunity_score = 0;
      const website = place.website || '';
      const instagram = place.instagrams?.[0] || null;
      const email = place.emails?.[0] || null;
      if (!website || website.includes('ifood') || website.includes('rappi')) pain_score += 2;
      if (ratingCount < 50) pain_score += 1;
      if (rating < 4.3 && ratingCount > 20) pain_score += 1;
      if (!instagram) pain_score += 1;
      if (rating > 4.5 && ratingCount < 150) opportunity_score += 2;
      if (place.price && place.price.length > 2) opportunity_score += 1;

      let reviewSummary = 'Sem resumo', personalizedMessage = null;
      try {
        const aiContextStr = context ? `\nContexto: ${context}` : '';
        const aiPrompt = `Você é um Estratégico Especialista em Vendas. Sua missão é analisar este negócio local e identificar possíveis pontos de dor ou oportunidades de melhoria.\n\nDados do Negócio:\nNome: ${place.title}\nEspecialidade: ${place.categoryName}\nAvaliação: ${rating} (${ratingCount} depoimentos)\nSite: ${website || 'Não possui'}\nInstagram: ${instagram || 'Não possui'}\nScore de Dor: ${pain_score}/5\nScore de Oportunidade: ${opportunity_score}/5${aiContextStr}\n\nRetorne estritamente JSON:\n{"observacao_ia":"..."}`;
        const aiRes = await generateAIResponse(aiPrompt, [{ role: 'user', content: 'Gere a análise.' }]);
        const aiJson = JSON.parse(aiRes.text.replace(/```json/g, '').replace(/```/g, '').trim());
        reviewSummary = aiJson.observacao_ia || reviewSummary;
      } catch { /* IA falhou — segue sem mensagem */ }

      const { data: savedLead, error: upsertErr } = await supabase
        .from('leads_radar')
        .upsert({
          name: place.title || 'Sem nome', phone: normalized, address: place.address,
          rating, user_rating_count: ratingCount, website, review_summary: reviewSummary,
          personalized_message: personalizedMessage, instagram, email,
          pain_score, opportunity_score,
          place_id: place.placeId || place.id || Date.now().toString(),
          niche, city, status: 'novo',
          campaign_id: campaignId || null
        }, { onConflict: 'place_id' })
        .select().single();

      if (!upsertErr) leadsProcessados.push(savedLead);
    }
    console.log(`[LeadRadar][BG] ✅ ${leadsProcessados.length} leads salvos.`);
  }
}

router.post('/leads/scan', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { niche, city, zip, limit = 10, context = '', source = 'google' } = req.body;
    if (!niche || !city) return res.status(400).json({ success: false, error: 'Nicho e Cidade são obrigatórios' });

    const { data: settings } = await supabase.from('global_settings').select('apify_api_token').single();
    const apifyToken = settings?.apify_api_token;
    if (!apifyToken) return res.status(400).json({ success: false, error: 'Apify API Token não configurado' });

    const now = new Date();
    const sourceSuffix = source === 'instagram' ? ' (Instagram)' : '';
    const campaignName = `${niche} • ${city}${sourceSuffix} • ${now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
    const { data: campaign, error: campErr } = await supabase
      .from('lead_campaigns')
      .insert({ name: campaignName, niche, city, context, user_id: req.userId })
      .select()
      .single();
    if (campErr) throw campErr;

    res.json({ success: true, scanning: true, campaign_id: campaign.id, campaign_name: campaign.name, message: 'Busca iniciada.' });

    runLeadScanBackground({ niche, city, zip, limit, context, apifyToken, campaignId: campaign.id, source })
      .catch(err => console.error('[LeadRadar] Erro background scan:', err.message));
  } catch (err: any) {
    console.error('[LeadRadar] Erro geral:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/leads/autopilot/progress', (req: AuthenticatedRequest, res: Response) => {
  const job = autopilotJobs.get(req.userId!);
  if (!job) return res.json({ active: false });
  res.json({ active: true, ...job });
});

/** Busca o texto do corpo (BODY) de um template Meta para armazenar mensagem legível no chat. */
async function fetchTemplateBodyText(userId: string, templateName: string): Promise<string | undefined> {
  try {
    const provider = new MetaProvider(userId);
    const templates = await provider.listTemplates(userId, { limit: 200 });
    const tpl = templates?.find((t: any) => t.name === templateName);
    const bodyComp = tpl?.components?.find((c: any) => c.type === 'BODY');
    return bodyComp?.text || undefined;
  } catch {
    return undefined; // best-effort — fallback para "[Template: nome]"
  }
}

router.delete('/leads/autopilot', (req: AuthenticatedRequest, res: Response) => {
  const job = autopilotJobs.get(req.userId!);
  if (!job || job.jobStatus !== 'running') return res.json({ success: false, message: 'Nenhum job ativo.' });
  job.cancelRequested = true;
  res.json({ success: true, message: 'Cancelamento solicitado.' });
});

router.post('/leads/autopilot', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { leadIds, limit = 40, minDelay = 60, maxDelay = 180, templateName, injectVariable } = req.body;
    if (!leadIds || leadIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum lead selecionado.' });
    }

    const provider = await WhatsAppProviderFactory.getProvider(userId);
    if (!provider) return res.status(400).json({ success: false, error: 'Nenhuma conexão de WhatsApp ativa encontrada.' });

    const instanceName = `wppai_${userId.substring(0, 8)}`;
    const statusInfo = await provider.getStatus(instanceName);
    if (statusInfo.status !== 'connected') {
      return res.status(400).json({ success: false, error: 'O WhatsApp não está conectado.' });
    }

    // Obter IDs de campanhas pertencentes a este usuário para filtrar disparos automáticos
    const { data: userCampaigns, error: campErr } = await supabase
      .from('lead_campaigns')
      .select('id')
      .eq('user_id', userId);
      
    if (campErr) throw campErr;
    const campaignIds = (userCampaigns || []).map(c => c.id);

    if (campaignIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhuma campanha ativa encontrada.' });
    }

    const { data: leads, error } = await supabase
      .from('leads_radar')
      .select('*')
      .in('id', leadIds)
      .in('campaign_id', campaignIds)
      .not('phone', 'is', null);

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum dos leads selecionados possui telefone válido para envio.' });
    }

    const job: AutopilotJob = {
      total: leads.length, sent: 0, errors: 0,
      currentLead: null, log: [],
      jobStatus: 'running', cancelRequested: false, nextSendAt: null,
    };
    autopilotJobs.set(userId, job);

    const runAutopilot = async () => {
      // Obter dados do perfil do remetente uma única vez antes de iniciar o loop de disparos
      // Usa só o primeiro nome — fica mais natural no template WhatsApp
      const senderName = await fetchSenderFirstName(userId!);

      // Busca o corpo do template uma vez antes do loop (para armazenar texto legível no chat)
      const templateBodyText = templateName ? await fetchTemplateBodyText(userId!, templateName) : undefined;

      for (let i = 0; i < leads.length; i++) {
        if (job.cancelRequested) { job.jobStatus = 'cancelled'; return; }
        const lead = leads[i];
        job.currentLead = lead.name || lead.phone;
        try {
          if (templateName && provider.sendTemplate) {
            const components = [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: lead.contact_name || shortenEstablishmentName(lead.name || 'Cliente') },
                  { type: 'text', text: senderName }
                ]
              }
            ];
            const result = await whatsappService.sendTemplate(userId, lead.phone, templateName, 'pt_BR', components, templateBodyText);
            if (!result.success) throw new Error(result.error);
          } else {
            if (!lead.personalized_message) throw new Error('Sem mensagem personalizada para enviar');
            const result = await whatsappService.sendMessage(userId, lead.phone, lead.personalized_message);
            if (!result.success) throw new Error(result.error);
          }
          await supabase.from('leads_radar').update({ status: 'contatado', updated_at: new Date().toISOString() }).eq('id', lead.id);
          job.sent++;
          job.log.unshift({ name: lead.name || '—', phone: lead.phone, status: 'sent', time: new Date().toLocaleTimeString('pt-BR') });
        } catch (sendErr: any) {
          await supabase.from('leads_radar').update({ status: 'erro', updated_at: new Date().toISOString() }).eq('id', lead.id);
          job.errors++;
          job.log.unshift({ name: lead.name || '—', phone: lead.phone, status: 'error', time: new Date().toLocaleTimeString('pt-BR') });
        }
        if (i < leads.length - 1 && !job.cancelRequested) {
          const delaySeconds = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          job.nextSendAt = Date.now() + delaySeconds * 1000;
          await new Promise(r => setTimeout(r, delaySeconds * 1000));
          job.nextSendAt = null;
        }
      }
      job.jobStatus = 'done';
      job.currentLead = null;
      setTimeout(() => autopilotJobs.delete(userId), 60_000);
    };

    runAutopilot().catch(err => { job.jobStatus = 'done'; console.error('[LeadRadar] Erro fatal:', err); });
    res.json({ success: true, count: leads.length, message: `Piloto Automático iniciado para ${leads.length} leads.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/leads/test-send', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { phone, templateName, templateLanguage = 'pt_BR', leadName, templateBodyText } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Telefone é obrigatório' });
    if (!templateName) return res.status(400).json({ success: false, error: 'Template é obrigatório' });

    const provider = await WhatsAppProviderFactory.getProvider(userId);
    if (!provider) return res.status(400).json({ success: false, error: 'Nenhuma conexão de WhatsApp ativa encontrada.' });

    const instanceName = `wppai_${userId.substring(0, 8)}`;
    const statusInfo = await provider.getStatus(instanceName);
    if (statusInfo.status !== 'connected') {
      return res.status(400).json({ success: false, error: 'O WhatsApp não está conectado.' });
    }

    const digits = phone.replace(/\D/g, '');
    const jid = (digits.startsWith('55') ? digits : `55${digits}`) + '@s.whatsapp.net';

    const senderName = await fetchSenderFirstName(userId!);

    if (provider.sendTemplate) {
      const components = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: shortenEstablishmentName(leadName || 'Estabelecimento Teste') },
            { type: 'text', text: senderName }
          ]
        }
      ];
      // templateBodyText vem do frontend (que já tem o template carregado); fallback para busca na Meta
      const resolvedBodyText = templateBodyText || await fetchTemplateBodyText(userId!, templateName);
      const result = await whatsappService.sendTemplate(userId, digits, templateName, templateLanguage, components, resolvedBodyText);
      if (result.success) {
        res.json({ success: true, message: `Mensagem de teste enviada com sucesso para ${digits}` });
      } else {
        res.status(400).json({ success: false, error: result.error || 'Erro ao enviar template de teste.' });
      }
    } else {
      res.status(400).json({ success: false, error: 'Seu provedor de WhatsApp não suporta envio de templates.' });
    }
  } catch (err: any) {
    console.error('[LeadRadar] Erro ao enviar mensagem de teste:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/leads/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, notes } = req.body;

    // Validar propriedade do lead
    const { data: lead } = await supabase.from('leads_radar').select('campaign_id').eq('id', req.params.id).maybeSingle();
    if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    
    if (lead.campaign_id) {
      const { data: campaign } = await supabase.from('lead_campaigns').select('user_id').eq('id', lead.campaign_id).maybeSingle();
      if (!campaign || campaign.user_id !== req.userId) {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }
    } else {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const updateFields: Record<string, any> = { updated_at: new Date().toISOString() };
    if (status !== undefined) updateFields.status = status;
    if (notes !== undefined) updateFields.notes = notes;
    if (req.body.contact_name !== undefined) updateFields.contact_name = req.body.contact_name;
    const { data, error } = await supabase.from('leads_radar').update(updateFields).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/leads/:id/send', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { templateName, templateLanguage = 'pt_BR', customMessage } = req.body;

    const { data: lead, error: leadErr } = await supabase.from('leads_radar').select('*').eq('id', req.params.id).single();
    if (leadErr || !lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    if (!lead.phone) return res.status(400).json({ success: false, error: 'Lead sem telefone' });

    // Validar propriedade do lead
    if (lead.campaign_id) {
      const { data: campaign } = await supabase.from('lead_campaigns').select('user_id').eq('id', lead.campaign_id).maybeSingle();
      if (!campaign || campaign.user_id !== userId) {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }
    } else {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const provider = await WhatsAppProviderFactory.getProvider(userId);
    if (!provider) return res.status(400).json({ success: false, error: 'Nenhuma conexão WhatsApp ativa' });

    const instanceName = `wppai_${userId.substring(0, 8)}`;
    const statusInfo = await provider.getStatus(instanceName);
    if (statusInfo.status !== 'connected') return res.status(400).json({ success: false, error: 'WhatsApp não está conectado' });

    const digits = lead.phone.replace(/\D/g, '');
    const jid = (digits.startsWith('55') ? digits : `55${digits}`) + '@s.whatsapp.net';

    if (templateName && provider.sendTemplate) {
      const senderName = await fetchSenderFirstName(userId!);

      let parameters = [];
      if (req.body.templateParams && Array.isArray(req.body.templateParams)) {
        parameters = req.body.templateParams.map((val: string) => ({ type: 'text', text: val }));
      } else {
        parameters = [
          { type: 'text', text: lead.contact_name || shortenEstablishmentName(lead.name || 'Cliente') },
          { type: 'text', text: senderName }
        ];
      }

      const components = [
        {
          type: 'body',
          parameters: parameters
        }
      ];
      const bodyText = await fetchTemplateBodyText(userId!, templateName);
      const result = await whatsappService.sendTemplate(userId, lead.phone, templateName, templateLanguage, components, bodyText);
      if (!result.success) throw new Error(result.error);
    } else {
      const msg = customMessage || lead.personalized_message;
      if (!msg) return res.status(400).json({ success: false, error: 'Sem mensagem para enviar' });
      const result = await whatsappService.sendMessage(userId, lead.phone, msg);
      if (!result.success) throw new Error(result.error);
    }

    await supabase.from('leads_radar').update({ status: 'contatado', updated_at: new Date().toISOString() }).eq('id', lead.id);
    res.json({ success: true, message: `Mensagem enviada para ${lead.phone}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/leads/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validar propriedade do lead
    const { data: lead } = await supabase.from('leads_radar').select('campaign_id').eq('id', req.params.id).maybeSingle();
    if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    
    if (lead.campaign_id) {
      const { data: campaign } = await supabase.from('lead_campaigns').select('user_id').eq('id', lead.campaign_id).maybeSingle();
      if (!campaign || campaign.user_id !== req.userId) {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }
    } else {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const { error } = await supabase.from('leads_radar').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/leads/:id/validate-phone', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { data: lead } = await supabase.from('leads_radar').select('*').eq('id', req.params.id).single();
    if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    if (!lead.phone) return res.status(400).json({ success: false, error: 'Lead sem telefone' });

    // Validar propriedade do lead
    if (lead.campaign_id) {
      const { data: campaign } = await supabase.from('lead_campaigns').select('user_id').eq('id', lead.campaign_id).maybeSingle();
      if (!campaign || campaign.user_id !== userId) {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }
    } else {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const provider = await WhatsAppProviderFactory.getProvider(userId);
    if (!provider) return res.status(400).json({ success: false, error: 'Nenhuma conexão WhatsApp ativa' });

    const instanceName = `wppai_${userId.substring(0, 8)}`;
    const statusInfo = await provider.getStatus(instanceName);
    if (statusInfo.status !== 'connected') {
      return res.status(400).json({ success: false, error: 'WhatsApp não está conectado' });
    }

    const cleanNumber = lead.phone.replace(/\D/g, '');
    const isEvolution = provider.constructor.name.includes('Evolution');

    let exists = true;
    if (isEvolution) {
      exists = await EvolutionApiService.whatsappExists(instanceName, cleanNumber);
    }

    // Persistir o resultado no banco de dados
    const { error: updateErr } = await supabase
      .from('leads_radar')
      .update({ whatsapp_exists: exists, updated_at: new Date().toISOString() })
      .eq('id', lead.id);

    if (updateErr) throw updateErr;

    if (exists) {
      res.json({ success: true, exists: true, message: 'Número de WhatsApp ativo!' });
    } else {
      res.json({ success: true, exists: false, message: 'Número NÃO possui WhatsApp ativo!' });
    }
  } catch (err: any) {
    console.error('[LeadRadar] Erro ao validar telefone:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/leads/bulk-status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ids, status } = req.body as { ids: string[]; status: string };
    if (!ids?.length || !status) return res.status(400).json({ success: false, error: 'ids e status são obrigatórios' });
    const validStatuses = ['novo', 'qualificado', 'contatado', 'descartado'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Status inválido' });

    // Validar propriedade de todos os leads
    const { data: userCampaigns } = await supabase.from('lead_campaigns').select('id').eq('user_id', req.userId);
    const campaignIds = (userCampaigns || []).map(c => c.id);

    const { data: leads } = await supabase.from('leads_radar').select('id, campaign_id').in('id', ids);
    const hasUnauthorizedLead = (leads || []).some(lead => !lead.campaign_id || !campaignIds.includes(lead.campaign_id));
    if (hasUnauthorizedLead) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const { error } = await supabase.from('leads_radar').update({ status, updated_at: new Date().toISOString() }).in('id', ids);
    if (error) throw error;
    res.json({ success: true, updated: ids.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/leads/bulk-delete', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!ids?.length) return res.status(400).json({ success: false, error: 'ids é obrigatório' });

    // Validar propriedade de todos os leads
    const { data: userCampaigns } = await supabase.from('lead_campaigns').select('id').eq('user_id', req.userId);
    const campaignIds = (userCampaigns || []).map(c => c.id);

    const { data: leads } = await supabase.from('leads_radar').select('id, campaign_id').in('id', ids);
    const hasUnauthorizedLead = (leads || []).some(lead => !lead.campaign_id || !campaignIds.includes(lead.campaign_id));
    if (hasUnauthorizedLead) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const { error } = await supabase.from('leads_radar').delete().in('id', ids);
    if (error) throw error;
    res.json({ success: true, deleted: ids.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
