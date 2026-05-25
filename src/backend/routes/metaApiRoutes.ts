import { Router, Response } from 'express';
import axios from 'axios';
import { supabase } from '../lib/supabaseClient.js';
import { MetaProvider } from '../providers/MetaProvider.js';
import { parseProviderError } from '../providers/providerErrors.js';
import { whatsappService } from '../services/whatsappService.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { logProviderAudit, maskedMetaPayload } from '../lib/providerAudit.js';

const router = Router();
const META_BASE = 'https://graph.facebook.com/v22.0';

/**
 * Meta Cloud API admin/UX endpoints.
 *
 * Mounted at:  /api/v2/whatsapp/meta
 *
 *   POST /test-connection   — validate credentials WITHOUT persisting
 *   POST /save-credentials  — validate + persist (switches provider to meta_official)
 *   POST /disconnect        — revert tenant to evolution + clear Meta creds
 *   GET  /status            — current Meta provider status for the authed user
 */

interface MetaCredsBody {
  access_token: string;
  phone_id: string;
  waba_id?: string;
  /** Optional per-tenant Meta App Secret. If omitted, falls back to WHATSAPP_APP_SECRET env. */
  app_secret?: string;
}

/**
 * Probes Graph API with the given credentials. Returns the phone-number record
 * (verified_name, display_phone_number, quality_rating) on success.
 */
async function probeMetaCredentials(creds: MetaCredsBody): Promise<{
  ok: boolean;
  data?: any;
  error?: ReturnType<typeof parseProviderError>;
}> {
  try {
    const { data } = await axios.get(`${META_BASE}/${creds.phone_id}`, {
      params: { fields: 'verified_name,display_phone_number,quality_rating,code_verification_status' },
      headers: { Authorization: `Bearer ${creds.access_token}` },
      timeout: 15000,
    });
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: parseProviderError(err) };
  }
}

router.post('/test-connection', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const { access_token, phone_id, waba_id } = (req.body || {}) as MetaCredsBody;
  if (!access_token || !phone_id) {
    return res.status(400).json({ success: false, error: 'access_token and phone_id are required' });
  }

  const probe = await probeMetaCredentials({ access_token, phone_id, waba_id });
  if (!probe.ok) {
    return res.status(400).json({
      success: false,
      error: probe.error?.message || 'Validation failed',
      errorInfo: probe.error,
    });
  }

  return res.json({
    success: true,
    phone: {
      phone_id,
      display_phone_number: probe.data.display_phone_number,
      verified_name: probe.data.verified_name,
      quality_rating: probe.data.quality_rating,
      verification_status: probe.data.code_verification_status,
    },
  });
});

router.post('/save-credentials', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { access_token, phone_id, waba_id, app_secret } = (req.body || {}) as MetaCredsBody;
  if (!access_token || !phone_id) {
    return res.status(400).json({ success: false, error: 'access_token and phone_id are required' });
  }

  // Validate before persisting — avoids storing broken credentials
  const probe = await probeMetaCredentials({ access_token, phone_id, waba_id });
  if (!probe.ok) {
    return res.status(400).json({
      success: false,
      error: probe.error?.message || 'Validation failed',
      errorInfo: probe.error,
    });
  }

  // Ensure no other tenant already claimed this phone_id
  const { data: clash } = await supabase
    .from('profiles')
    .select('id')
    .eq('meta_phone_id', phone_id)
    .neq('id', userId)
    .maybeSingle();
  if (clash) {
    return res.status(409).json({
      success: false,
      error: `phone_id ${phone_id} is already configured for another tenant`,
    });
  }

  const updatePayload: Record<string, any> = {
    whatsapp_provider: 'meta_official',
    meta_access_token: access_token,
    meta_phone_id: phone_id,
    meta_waba_id: waba_id || null,
    meta_last_error: null,
    meta_last_error_at: null,
    updated_at: new Date().toISOString(),
  };
  // Only overwrite app_secret when explicitly supplied — keeps existing
  // per-tenant secret intact if the admin re-saves other fields.
  if (typeof app_secret === 'string' && app_secret.trim()) {
    updatePayload.meta_app_secret = app_secret.trim();
  }

  const { error: updateErr } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', userId);

  if (updateErr) {
    return res.status(500).json({ success: false, error: `Failed to persist: ${updateErr.message}` });
  }

  // Invalidate the credential cache so the next outbound message uses fresh values
  MetaProvider.invalidateCredentialCache(userId);

  logProviderAudit({
    targetUserId: userId,
    performedBy: userId, // self-service: tenant configurou o próprio
    action: 'meta_credentials_saved',
    details: maskedMetaPayload({ access_token, phone_id, waba_id, app_secret }),
  });

  return res.json({
    success: true,
    provider: 'meta_official',
    phone: {
      phone_id,
      display_phone_number: probe.data.display_phone_number,
      verified_name: probe.data.verified_name,
      quality_rating: probe.data.quality_rating,
    },
  });
});

router.post('/disconnect', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({
      whatsapp_provider: 'evolution',
      meta_access_token: null,
      meta_phone_id: null,
      meta_waba_id: null,
      meta_app_secret: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateErr) {
    return res.status(500).json({ success: false, error: `Failed to disconnect: ${updateErr.message}` });
  }

  MetaProvider.invalidateCredentialCache(userId);
  logProviderAudit({
    targetUserId: userId,
    performedBy: userId,
    action: 'meta_disconnected',
    details: { reverted_to: 'evolution' },
  });
  return res.json({ success: true, provider: 'evolution' });
});

router.get('/status', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('whatsapp_provider, meta_phone_id, meta_waba_id, meta_access_token')
    .eq('id', userId)
    .maybeSingle();

  if (error) return res.status(500).json({ success: false, error: error.message });
  if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

  const configured = !!(profile.meta_access_token && profile.meta_phone_id);
  if (!configured || profile.whatsapp_provider !== 'meta_official') {
    return res.json({
      success: true,
      provider: profile.whatsapp_provider || 'evolution',
      meta: { configured, phone_id: profile.meta_phone_id || null, waba_id: profile.meta_waba_id || null },
    });
  }

  // Live probe — verifies token still works
  const probe = await probeMetaCredentials({
    access_token: profile.meta_access_token,
    phone_id: profile.meta_phone_id,
    waba_id: profile.meta_waba_id || undefined,
  });

  return res.json({
    success: true,
    provider: 'meta_official',
    meta: {
      configured: true,
      phone_id: profile.meta_phone_id,
      waba_id: profile.meta_waba_id,
      live_ok: probe.ok,
      display_phone_number: probe.data?.display_phone_number,
      verified_name: probe.data?.verified_name,
      quality_rating: probe.data?.quality_rating,
      error: probe.ok ? undefined : probe.error?.message,
    },
  });
});

/**
 * GET /templates — lists message templates from the tenant's WABA.
 * Query: ?status=APPROVED (optional filter), ?limit=100
 */
router.get('/templates', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const status = (req.query.status as string) || undefined;
  const limit = Math.min(parseInt((req.query.limit as string) || '100', 10) || 100, 250);

  const { data: profile } = await supabase
    .from('profiles')
    .select('whatsapp_provider, meta_waba_id')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.whatsapp_provider !== 'meta_official') {
    return res.status(400).json({ success: false, error: 'Tenant is not on meta_official provider' });
  }
  if (!profile.meta_waba_id) {
    return res.status(400).json({ success: false, error: 'meta_waba_id is not configured for this tenant' });
  }

  try {
    const provider = new MetaProvider(userId);
    const templates = await provider.listTemplates(userId, { status, limit });

    // Merge com template_status_cache local (atualizado por webhook em tempo real).
    // Quando o cache tiver entrada mais recente, ela sobrescreve o status da Graph
    // API — webhook geralmente chega antes do refresh da listagem.
    const { data: cached } = await supabase
      .from('template_status_cache')
      .select('template_name, language_code, status, reason, last_event, last_event_at')
      .eq('user_id', userId);

    const cacheMap = new Map<string, any>();
    (cached || []).forEach(c => cacheMap.set(`${c.template_name}__${c.language_code}`, c));

    const enriched = templates.map((t: any) => {
      const c = cacheMap.get(`${t.name}__${t.language}`);
      if (!c) return t;
      return {
        ...t,
        // Cache vence quando tem evento mais recente que a Graph API refletiria
        status: c.status || t.status,
        cache_last_event: c.last_event,
        cache_last_event_at: c.last_event_at,
        cache_reason: c.reason,
      };
    });

    return res.json({ success: true, templates: enriched, count: enriched.length });
  } catch (err: any) {
    const info = parseProviderError(err);
    return res.status(400).json({ success: false, error: info.message, errorInfo: info });
  }
});

/**
 * GET /templates/metrics — aggregated send stats from template_send_log.
 * Query: ?days=30 (default)
 */
router.get('/templates/metrics', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const days = Math.min(parseInt((req.query.days as string) || '30', 10) || 30, 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from('template_send_log')
    .select('template_name, status, warnings, created_at')
    .eq('user_id', userId)
    .gte('created_at', since);

  if (error) return res.status(500).json({ success: false, error: error.message });

  const agg: Record<string, { total: number; sent: number; failed: number; blocked: number; with_warnings: number; last_sent: string }> = {};
  for (const row of data || []) {
    const k = row.template_name;
    if (!agg[k]) agg[k] = { total: 0, sent: 0, failed: 0, blocked: 0, with_warnings: 0, last_sent: '' };
    agg[k].total++;
    if (row.status === 'sent') agg[k].sent++;
    else if (row.status === 'failed') agg[k].failed++;
    else if (row.status === 'blocked_local') agg[k].blocked++;
    if (Array.isArray(row.warnings) && row.warnings.length > 0) agg[k].with_warnings++;
    if (!agg[k].last_sent || row.created_at > agg[k].last_sent) agg[k].last_sent = row.created_at;
  }

  const metrics = Object.entries(agg)
    .map(([template_name, s]) => ({ template_name, ...s }))
    .sort((a, b) => b.total - a.total);

  return res.json({ success: true, metrics, period_days: days });
});

/**
 * POST /templates/generate — AI-powered template text generator.
 * Costs are absorbed by the platform (uses global OPENAI_API_KEY, no userId billing).
 * Body: { template_name, category, language, description }
 * Returns: { success, body_text, var_count, example_values, warnings }
 */
router.post('/templates/generate', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const { template_name, category, language, description } = req.body || {};
  if (!template_name || !category || !description) {
    return res.status(400).json({ success: false, error: 'template_name, category e description são obrigatórios' });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return res.status(503).json({ success: false, error: 'OPENAI_API_KEY não configurada na plataforma' });
  }

  const langLabel: Record<string, string> = {
    pt_BR: 'Português (Brasil)', en_US: 'English (US)', es: 'Español',
  };
  const lang = langLabel[language] || language || 'Português (Brasil)';
  const systemPrompt = `Você é um especialista em templates de WhatsApp Business da Meta.
Regras obrigatórias que você DEVE seguir:
- Escreva APENAS o texto do corpo (BODY) do template — sem header, footer ou botões.
- Use {{1}}, {{2}}, etc. para variáveis dinâmicas (ex: nome do cliente, número do pedido).
- Máximo 1024 caracteres.
- Proibido: URLs encurtadas (bit.ly, tinyurl), promessas financeiras ("ganhe R$", "renda extra"), texto todo em maiúsculas, conteúdo adulto.
- A mensagem deve ser natural, profissional e direta.
- Idioma: ${lang}.
- Categoria: ${category} (UTILITY = transacional/confirmação, MARKETING = promoções, AUTHENTICATION = códigos).
- Responda APENAS com um JSON no formato exato:
{
  "body_text": "texto do template com {{1}} e {{2}} se necessário",
  "var_count": 2,
  "example_values": ["valor exemplo 1", "valor exemplo 2"],
  "notes": "breve explicação do que cada variável representa"
}`;

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: openaiKey });
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Crie um template para: ${description}\nNome do template: ${template_name}` },
      ],
      max_tokens: 600,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ success: false, error: 'IA retornou JSON inválido' });
    }

    const body_text: string = parsed.body_text || '';
    const var_count: number = parsed.var_count ?? (body_text.match(/\{\{\d+\}\}/g)?.length || 0);
    const example_values: string[] = parsed.example_values || Array(var_count).fill('exemplo');
    const notes: string = parsed.notes || '';

    // Basic client-side-mirrored warnings
    const warnings: string[] = [];
    if (body_text.length > 1024) warnings.push(`Texto muito longo (${body_text.length} / 1024 chars)`);
    if (/(bit\.ly|tinyurl)/i.test(body_text)) warnings.push('URL encurtada detectada');
    if (/(ganhe r\$|renda extra)/i.test(body_text)) warnings.push('Linguagem financeira suspeita');

    return res.json({ success: true, body_text, var_count, example_values, notes, warnings });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Erro na geração por IA' });
  }
});

/**
 * POST /templates/submit — submits a template to Meta Graph API for review.
 * Body: { template_name, category, language, body_text, example_values, header_text?, footer_text? }
 * Returns: { success, meta_id, status }
 */
router.post('/templates/submit', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { template_name, category, language, body_text, example_values, header_text, header_image_url, footer_text, buttons } = req.body || {};

  if (!template_name || !category || !body_text) {
    return res.status(400).json({ success: false, error: 'template_name, category e body_text são obrigatórios' });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('meta_access_token, meta_waba_id, whatsapp_provider')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.whatsapp_provider !== 'meta_official') {
    return res.status(400).json({ success: false, error: 'Tenant não usa meta_official' });
  }
  if (!profile?.meta_waba_id || !profile?.meta_access_token) {
    return res.status(400).json({ success: false, error: 'WABA ID ou access token não configurados' });
  }

  // Build components
  const components: any[] = [];

  if (header_image_url?.trim()) {
    components.push({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_url: [header_image_url.trim()] },
    });
  } else if (header_text?.trim()) {
    components.push({ type: 'HEADER', format: 'TEXT', text: header_text.trim() });
  }

  const bodyComponent: any = { type: 'BODY', text: body_text };
  const varCount = (body_text.match(/\{\{\d+\}\}/g) || []).length;
  if (varCount > 0 && Array.isArray(example_values) && example_values.length >= varCount) {
    bodyComponent.example = { body_text: [example_values.slice(0, varCount)] };
  }
  components.push(bodyComponent);

  if (footer_text?.trim()) {
    components.push({ type: 'FOOTER', text: footer_text.trim() });
  }

  if (Array.isArray(buttons) && buttons.length > 0) {
    components.push({ type: 'BUTTONS', buttons });
  }

  const metaPayload = { name: template_name, language: language || 'pt_BR', category, components };
  console.log('[TemplateSubmit] Payload →', JSON.stringify(metaPayload, null, 2));

  try {
    const { data } = await axios.post(
      `${META_BASE}/${profile.meta_waba_id}/message_templates`,
      metaPayload,
      { headers: { Authorization: `Bearer ${profile.meta_access_token}` }, timeout: 20000 }
    );
    return res.json({ success: true, meta_id: data.id, status: data.status || 'PENDING' });
  } catch (err: any) {
    const rawMeta = err?.response?.data;
    console.error('[TemplateSubmit] Meta error →', JSON.stringify(rawMeta, null, 2));
    const { parseProviderError: _parseErr } = await import('../providers/providerErrors.js');
    const info = parseProviderError(err);
    return res.status(400).json({ success: false, error: info.message, errorInfo: info });
  }
});

/**
 * POST /send-template — sends an approved template message.
 * Body: { to, template_name, language_code?, components? }
 */
router.post('/send-template', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { to, template_name, language_code, components } = req.body || {};

  if (!to || !template_name) {
    return res.status(400).json({ success: false, error: 'to and template_name are required' });
  }

  const result = await whatsappService.sendTemplate(
    userId,
    to,
    template_name,
    language_code || 'pt_BR',
    Array.isArray(components) ? components : undefined
  );

  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

export default router;
