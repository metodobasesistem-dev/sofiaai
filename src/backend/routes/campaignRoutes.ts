/**
 * Campaign Routes — Backend send loop so campaigns survive browser closure.
 * Uses the same in-memory job tracker pattern as radarRoutes.ts (autopilotJobs).
 */
import { Router, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { whatsappService } from '../services/whatsappService.js';
import { EvolutionApiService } from '../services/evolutionApiService.js';

const router = Router();
router.use(requireAuth as any);

// ─── In-memory campaign job tracker (keyed by campaignId) ──────────────────
interface CampaignJob {
  campaignId: string;
  total: number;
  sent: number;
  errors: number;
  currentContact: string | null;
  jobStatus: 'running' | 'done' | 'cancelled' | 'failed';
  cancelRequested: boolean;
  nextSendAt: number | null; // timestamp ms
}
const campaignJobs = new Map<string, CampaignJob>();

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Normalize a phone number to E.164 digits (with Brazilian +55 prefix). */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : '55' + digits;
}

/**
 * Resolve the value of a template variable field against a contact object.
 * Supports the contact field IDs used in the campaign wizard.
 * Campos `sender_*` referem-se ao perfil do remetente (usuário logado).
 */
function getContactFieldValue(contact: any, field: string, sender?: { nome_completo?: string | null; name?: string | null; full_name?: string | null } | null): string {
  switch (field) {
    case 'full_name':
      return contact.nome || contact.name || contact.contact_name || '';
    case 'first_name': {
      const full = contact.nome || contact.name || contact.contact_name || '';
      return full.trim().split(/\s+/)[0] || full;
    }
    case 'phone':
      return contact.telefone || contact.phone || '';
    case 'email':
      return contact.email || '';
    case 'status_funil':
      return contact.status_funil || '';
    case 'sender_full_name':
      return sender?.nome_completo || sender?.full_name || sender?.name || '';
    case 'sender_first_name': {
      const full = sender?.nome_completo || sender?.full_name || sender?.name || '';
      return full.trim().split(/\s+/)[0] || full;
    }
    default:
      return contact[field] || '';
  }
}

// ─── Background campaign runner ────────────────────────────────────────────

async function runCampaign(campaignId: string, userId: string): Promise<void> {
  const job = campaignJobs.get(campaignId);
  if (!job) return;

  try {
    // a. Load campaign from DB
    const { data: campaign, error: campErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('tenant_id', userId)
      .maybeSingle();

    if (campErr || !campaign) {
      job.jobStatus = 'failed';
      console.error(`[Campaigns] Campaign ${campaignId} not found or DB error:`, campErr?.message);
      return;
    }

    // b. Build contact list based on target_type
    let contacts: any[] = [];

    if (campaign.target_type === 'labels') {
      const { data: threads } = await supabase
        .from('threads')
        .select('id, remote_jid, contact_name, labels')
        .eq('user_id', userId);

      if (threads && threads.length > 0) {
        const targetLabel = (campaign.selected_labels || '').trim().toLowerCase();
        const matching = threads.filter((t: any) =>
          t.labels && Array.isArray(t.labels) &&
          t.labels.some((l: any) => String(l).trim().toLowerCase() === targetLabel)
        );
        contacts = matching.map((t: any) => ({
          id: t.id,
          telefone: (t.remote_jid || '').split('@')[0],
          nome: t.contact_name || 'Lead',
          contact_name: t.contact_name || 'Lead'
        }));
      }
    } else if (campaign.target_type === 'funnel') {
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId)
        .eq('status_funil', campaign.selected_funnel_status);
      contacts = data || [];
    } else if (campaign.target_type === 'manual') {
      const numbers = (campaign.manual_list || '').split('\n').map((n: string) => n.trim()).filter(Boolean);
      contacts = numbers.map((n: string) => ({
        id: 'manual-' + n,
        telefone: n.replace(/\D/g, ''),
        nome: 'Lead Manual'
      }));
    } else if (campaign.target_type === 'upload') {
      const uploaded: any[] = campaign.uploaded_contacts || [];
      contacts = uploaded.map((c: any) => ({
        id: 'upload-' + (c.telefone || c.number || ''),
        telefone: (c.telefone || c.number || '').replace(/\D/g, ''),
        nome: c.nome || c.name || 'Lead Planilha'
      }));
    } else {
      // 'all' — every contact for this user
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId);
      contacts = data || [];
    }

    if (contacts.length === 0) {
      console.warn(`[Campaigns] No contacts for campaign ${campaignId}`);
      await supabase
        .from('campaigns')
        .update({ status: 'completed', sent_count: 0, error_count: 0 })
        .eq('id', campaignId);
      job.jobStatus = 'done';
      return;
    }

    job.total = contacts.length;
    // Sync total to DB
    await supabase
      .from('campaigns')
      .update({ total_contacts: contacts.length })
      .eq('id', campaignId);

    // c. Load template body (for non-meta_official providers) and sender profile
    let templateBody = '';
    const { data: profile } = await supabase
      .from('profiles')
      .select('whatsapp_provider, nome_completo, full_name, name')
      .eq('id', userId)
      .maybeSingle();
    const isMetaOfficial = (profile as any)?.whatsapp_provider === 'meta_official';
    const sender = {
      nome_completo: (profile as any)?.nome_completo,
      full_name: (profile as any)?.full_name,
      name: (profile as any)?.name,
    };

    if (campaign.message_type === 'custom' || campaign.custom_text) {
      templateBody = campaign.custom_text || '';
    } else if (!isMetaOfficial && campaign.template_id) {
      const { data: tplData } = await supabase
        .from('message_templates')
        .select('body')
        .eq('id', campaign.template_id)
        .maybeSingle();
      templateBody = (tplData as any)?.body || '';
    }

    // e. Send loop
    for (let i = 0; i < contacts.length; i++) {
      if (job.cancelRequested) {
        job.jobStatus = 'cancelled';
        await supabase.from('campaigns').update({ status: 'cancelled' }).eq('id', campaignId);
        return;
      }

      const contact = contacts[i];
      job.currentContact = contact.nome || contact.name || contact.telefone || null;

      // Anti-ban delay — skip for the first message
      if (i > 0 && !job.cancelRequested) {
        const delaySeconds = Math.floor(Math.random() * (180 - 60 + 1)) + 60;
        job.nextSendAt = Date.now() + delaySeconds * 1000;
        await new Promise(r => setTimeout(r, delaySeconds * 1000));
        job.nextSendAt = null;
      }

      if (job.cancelRequested) {
        job.jobStatus = 'cancelled';
        await supabase.from('campaigns').update({ status: 'cancelled' }).eq('id', campaignId);
        return;
      }

      // Build mapped variable values (sorted by var1, var2, ...)
      const variables: Record<string, string> = campaign.variables || {};
      const mappedVars = Object.entries(variables)
        .sort((a, b) => {
          const aNum = parseInt(a[0].replace('var', ''), 10);
          const bNum = parseInt(b[0].replace('var', ''), 10);
          return aNum - bNum;
        })
        .map(([, field]) => getContactFieldValue(contact, field as string, sender));

      const rawPhone = contact.telefone || contact.phone || '';
      const phone = normalizePhone(rawPhone);

      let sendSuccess = false;
      let sendError = '';

      try {
        if (isMetaOfficial && campaign.message_type !== 'custom') {
          const result = await whatsappService.sendTemplate(
            userId,
            phone,
            campaign.template_name,
            'pt_BR',
            [{ type: 'body', parameters: mappedVars.map(v => ({ type: 'text', text: v })) }],
            undefined
          );
          if (!result.success) throw new Error(result.error || 'Erro ao enviar template');
          sendSuccess = true;
        } else {
          if (!templateBody) throw new Error('Corpo da mensagem vazio.');
          let finalMessage = templateBody;

          // Substitui variáveis {nome}, {telefone} se existirem no texto customizado
          const contactName = contact.nome || contact.name || 'Cliente';
          finalMessage = finalMessage
            .replace(/\{nome\}/gi, contactName)
            .replace(/\{telefone\}/gi, phone);

          // Substitui {{1}}, {{2}}, etc.
          mappedVars.forEach((val, idx) => {
            finalMessage = finalMessage.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g'), String(val));
          });
          const result = await whatsappService.sendMessage(userId, phone, finalMessage);
          if (!result.success) throw new Error(result.error || 'Erro ao enviar mensagem');
          sendSuccess = true;
        }
      } catch (sendErr: any) {
        sendSuccess = false;
        sendError = sendErr.message || 'Erro desconhecido';
        console.error(`[Campaigns] Error sending to ${phone}:`, sendError);
      }

      if (sendSuccess) {
        job.sent++;
      } else {
        job.errors++;
      }

      // Insert log entry
      await supabase.from('campaign_logs').insert({
        campaign_id: campaignId,
        contact_id: contact.id,
        status: sendSuccess ? 'sent' : 'error',
        error_message: sendSuccess ? null : sendError
      });

      // Update DB progress every 5 sends
      const processed = job.sent + job.errors;
      if (processed % 5 === 0 || processed === contacts.length) {
        await supabase
          .from('campaigns')
          .update({ sent_count: job.sent, error_count: job.errors })
          .eq('id', campaignId);
      }
    }

    // f. Finalize
    await supabase
      .from('campaigns')
      .update({ status: 'completed', sent_count: job.sent, error_count: job.errors })
      .eq('id', campaignId);

    job.jobStatus = 'done';
    job.currentContact = null;
    console.log(`[Campaigns] Campaign ${campaignId} completed. Sent: ${job.sent}, Errors: ${job.errors}`);
  } catch (err: any) {
    console.error(`[Campaigns] Fatal error in campaign ${campaignId}:`, err.message);
    job.jobStatus = 'failed';
    try {
      await supabase
        .from('campaigns')
        .update({ status: 'failed' })
        .eq('id', campaignId);
    } catch (_) {}
  } finally {
    // g. Clean up job from memory after 60s
    setTimeout(() => campaignJobs.delete(campaignId), 60_000);
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────

/** GET / — list campaigns for the authenticated user */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('tenant_id', req.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /test-send — send a real test message with resolved template variables */
router.post('/test-send', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { phone, templateName, templateLanguage = 'pt_BR', isMetaTemplate, senderName, variables = {}, contact = {} } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Telefone é obrigatório' });
    if (!templateName) return res.status(400).json({ success: false, error: 'Template é obrigatório' });

    const digits = phone.replace(/\D/g, '');

    // Carrega perfil do remetente (pra resolver vars sender_*)
    const { data: profile } = await supabase
      .from('profiles')
      .select('whatsapp_provider, nome_completo, full_name, name')
      .eq('id', userId)
      .maybeSingle();
    // isMetaTemplate from request body takes precedence; fallback to profile provider check
    const isMetaOfficial = isMetaTemplate === true || (profile as any)?.whatsapp_provider === 'meta_official';
    // senderName from frontend (already normalized via getUserProfile) takes precedence
    const sender = {
      nome_completo: senderName || (profile as any)?.nome_completo,
      full_name: (profile as any)?.full_name,
      name: (profile as any)?.name,
    };

    // Resolve as variáveis mapeadas no contato de teste (ou no perfil pro caso sender_*)
    const mappedVars = Object.entries(variables as Record<string, string>)
      .sort((a, b) => {
        const aNum = parseInt(a[0].replace('var', ''), 10);
        const bNum = parseInt(b[0].replace('var', ''), 10);
        return aNum - bNum;
      })
      .map(([, field]) => getContactFieldValue(contact, field as string, sender));

    // Validação antecipada: variável sender_* vazia = perfil sem nome preenchido
    const emptySenderIdx = Object.entries(variables as Record<string, string>)
      .sort((a, b) => parseInt(a[0].replace('var', ''), 10) - parseInt(b[0].replace('var', ''), 10))
      .findIndex(([, field]) => (field === 'sender_full_name' || field === 'sender_first_name') && !getContactFieldValue(contact, field, sender).trim());
    if (emptySenderIdx !== -1) {
      return res.status(400).json({
        success: false,
        error: `Variável {{${emptySenderIdx + 1}}} usa "Meu Nome (Remetente)" mas seu perfil não tem nome preenchido. Vá em Configurações → Conta e preencha o campo "Nome Completo".`,
      });
    }

    let resolvedBodyText = '';

    if (!isMetaOfficial && req.body.templateId) {
      const { data: tplData } = await supabase
        .from('message_templates')
        .select('body')
        .eq('id', req.body.templateId)
        .maybeSingle();
      resolvedBodyText = (tplData as any)?.body || '';
    }

    if (isMetaOfficial) {
      const components = [{
        type: 'body',
        parameters: mappedVars.map(v => ({ type: 'text', text: v }))
      }];
      const result = await whatsappService.sendTemplate(userId, digits, templateName, templateLanguage, components, undefined);
      if (result.success) {
        res.json({ success: true, message: `Mensagem de teste enviada com sucesso para ${digits}` });
      } else {
        res.status(400).json({ success: false, error: result.error || 'Erro ao enviar template de teste.' });
      }
    } else {
      if (!resolvedBodyText) throw new Error('Corpo do template não encontrado.');
      let finalMessage = resolvedBodyText;
      mappedVars.forEach((val, idx) => {
        finalMessage = finalMessage.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g'), String(val));
      });
      const result = await whatsappService.sendMessage(userId, digits, finalMessage);
      if (result.success) {
        res.json({ success: true, message: `Mensagem de teste enviada com sucesso para ${digits}` });
      } else {
        res.status(400).json({ success: false, error: result.error || 'Erro ao enviar mensagem de teste.' });
      }
    }
  } catch (err: any) {
    console.error('[Campaigns] Erro ao enviar mensagem de teste:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST / — create a new campaign */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payload = { ...req.body, tenant_id: req.userId };
    const { data, error } = await supabase
      .from('campaigns')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** PATCH /:id — update a campaign (ownership verified) */
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: existing } = await supabase
      .from('campaigns')
      .select('tenant_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!existing || existing.tenant_id !== req.userId) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    const { data, error } = await supabase
      .from('campaigns')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** DELETE /:id — delete a campaign (ownership verified) */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: existing } = await supabase
      .from('campaigns')
      .select('tenant_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!existing || existing.tenant_id !== req.userId) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    // Delete logs first to avoid FK constraint errors
    await supabase.from('campaign_logs').delete().eq('campaign_id', req.params.id);
    const { error } = await supabase.from('campaigns').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /:id/start — kick off a backend send job */
router.post('/:id/start', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const campaignId = req.params.id;
    const userId = req.userId!;

    // Verify ownership
    const { data: campaign, error: campErr } = await supabase
      .from('campaigns')
      .select('tenant_id, status')
      .eq('id', campaignId)
      .maybeSingle();

    if (campErr || !campaign) {
      return res.status(404).json({ success: false, error: 'Campanha não encontrada' });
    }
    if (campaign.tenant_id !== userId) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    if (campaign.status === 'sending') {
      return res.status(409).json({ success: false, error: 'Campanha já está sendo enviada' });
    }
    if (campaignJobs.has(campaignId)) {
      return res.status(409).json({ success: false, error: 'Job já está em execução' });
    }

    // Create job entry
    const job: CampaignJob = {
      campaignId,
      total: 0,
      sent: 0,
      errors: 0,
      currentContact: null,
      jobStatus: 'running',
      cancelRequested: false,
      nextSendAt: null
    };
    campaignJobs.set(campaignId, job);

    // Mark campaign as sending in DB
    await supabase
      .from('campaigns')
      .update({ status: 'sending' })
      .eq('id', campaignId);

    // Return immediately — job runs in background
    res.json({ success: true, message: 'Campanha iniciada no servidor.' });

    // Fire and forget
    runCampaign(campaignId, userId).catch(err => {
      console.error(`[Campaigns] Unhandled error in runCampaign(${campaignId}):`, err.message);
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /:id/status — return job status from memory or DB fallback */
router.get('/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const campaignId = req.params.id;
    const userId = req.userId!;

    const job = campaignJobs.get(campaignId);
    if (job) {
      return res.json({ success: true, data: job });
    }

    // Fallback to DB if job is not in memory
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('id, status, sent_count, error_count, total_contacts')
      .eq('id', campaignId)
      .eq('tenant_id', userId)
      .maybeSingle();

    if (error || !campaign) {
      return res.status(404).json({ success: false, error: 'Campanha não encontrada' });
    }

    // Map DB status to the jobStatus shape the frontend expects
    const jobStatusMap: Record<string, CampaignJob['jobStatus']> = {
      completed: 'done',
      cancelled: 'cancelled',
      failed: 'failed',
      sending: 'running',
      pending: 'done'
    };

    const syntheticJob: CampaignJob = {
      campaignId: campaign.id,
      total: campaign.total_contacts || 0,
      sent: campaign.sent_count || 0,
      errors: campaign.error_count || 0,
      currentContact: null,
      jobStatus: jobStatusMap[campaign.status] || 'done',
      cancelRequested: false,
      nextSendAt: null
    };

    res.json({ success: true, data: syntheticJob });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /:id/cancel — request job cancellation */
router.post('/:id/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const campaignId = req.params.id;
    const userId = req.userId!;

    // Verify ownership first
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('tenant_id')
      .eq('id', campaignId)
      .maybeSingle();

    if (!campaign || campaign.tenant_id !== userId) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const job = campaignJobs.get(campaignId);
    if (!job || job.jobStatus !== 'running') {
      return res.json({ success: false, message: 'Nenhum job ativo para cancelar.' });
    }

/** POST /validate-numbers — Valida uma lista de números na Evolution API */
router.post('/validate-numbers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { numbers } = req.body;
    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ success: false, error: 'Lista de números é obrigatória' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('whatsapp_instance_id')
      .eq('id', userId)
      .maybeSingle();

    const instanceName = profile?.whatsapp_instance_id || `wppai_${userId.slice(0, 8)}`;

    const results = await Promise.all(
      numbers.map(async (num: string) => {
        const cleanNumber = String(num).replace(/\D/g, '');
        if (!cleanNumber || cleanNumber.length < 8) {
          return { number: num, cleanNumber, exists: false, valid: false };
        }
        const exists = await EvolutionApiService.whatsappExists(instanceName, cleanNumber);
        return { number: num, cleanNumber, exists, valid: exists };
      })
    );

    const validCount = results.filter(r => r.exists).length;
    const invalidCount = results.filter(r => !r.exists).length;

    res.json({
      success: true,
      validCount,
      invalidCount,
      results
    });
  } catch (err: any) {
    console.error('[Campaigns] Error validating numbers:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
