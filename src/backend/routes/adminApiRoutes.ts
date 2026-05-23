/**
 * Admin API Routes — Global platform management.
 *
 * Strictly restricted to users with 'admin' role.
 * Uses service role key to access all tenant data.
 */
import { Router, Response } from 'express';
import axios from 'axios';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { MetaProvider } from '../providers/MetaProvider.js';
import { parseProviderError } from '../providers/providerErrors.js';
import { logProviderAudit, maskedMetaPayload } from '../lib/providerAudit.js';
import { generateAIResponse } from '../services/aiService.js';
import { WhatsAppProviderFactory } from '../providers/WhatsAppProviderFactory.js';

const router = Router();

// ─── GET /api/v2/admin/settings/public ───────────────────────────────────
// Public endpoint for signup rules and maintenance status
router.get('/settings/public', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('global_settings')
      .select('trial_days, maintenance_mode, allow_signups')
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    
    // Default values if not set
    const settings = data || {
      trial_days: 10,
      maintenance_mode: false,
      allow_signups: true
    };

    res.json({ success: true, data: settings });
  } catch (err: any) {
    console.error('[AdminAPI] Public Settings Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// All subsequent routes require authentication AND admin role
router.use(requireAuth as any);
router.use(requireAdmin as any);

// ─── GET /api/v2/admin/stats ──────────────────────────────────────────────
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [profilesRes, agentsRes, messagesRes] = await Promise.all([
      supabase.from('profiles').select('id, whatsapp_status', { count: 'exact' }),
      supabase.from('agents').select('id', { count: 'exact', head: true }),
      supabase.from('messages').select('id', { count: 'exact', head: true })
    ]);

    const stats = {
      totalUsers: profilesRes.count || 0,
      activeSessions: profilesRes.data?.filter(p => p.whatsapp_status === 'connected').length || 0,
      totalMessages: messagesRes.count || 0,
      totalAgents: agentsRes.count || 0
    };

    res.json({ success: true, data: stats });
  } catch (err: any) {
    console.error('[AdminAPI] Stats Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/admin/sync-instances ───────────────────────────────────
router.post('/sync-instances', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const { whatsappService } = await import('../services/whatsappService.js');
    await whatsappService.runMaintenanceSync();
    res.json({ success: true, message: 'Sincronização concluída.' });
  } catch (err: any) {
    console.error('[AdminAPI] Sync error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v2/admin/users ──────────────────────────────────────────────
router.get('/users', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // 1. Todos os auth.users via Admin API (service role)
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (authError) throw authError;
    const authUsers = authData?.users || [];

    // 2. Todos os profiles existentes
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('*');
    if (profileError) throw profileError;
    const profileMap = new Map((profileRows || []).map((p: any) => [p.id, p]));

    // 3. Para cada auth.user sem profile, cria um profile mínimo automaticamente
    const missingIds = authUsers.filter(u => !profileMap.has(u.id)).map(u => u.id);
    if (missingIds.length > 0) {
      const inserts = authUsers
        .filter(u => missingIds.includes(u.id))
        .map(u => ({
          id: u.id,
          email: u.email,
          name: u.user_metadata?.full_name || u.email?.split('@')[0] || 'Sem nome',
          plano: 'Trial',
          role: 'client',
          whatsapp_status: 'disconnected',
        }));
      const { data: created } = await supabase.from('profiles').insert(inserts).select();
      (created || []).forEach((p: any) => profileMap.set(p.id, p));
      console.log(`[AdminAPI] Criados ${inserts.length} perfis ausentes.`);
    }

    // 4. Monta resposta cruzando auth.users + profiles
    const merged = authUsers.map(u => {
      const profile = profileMap.get(u.id) || {};
      const { meta_access_token, meta_app_secret, whatsapp_qr, ...safe } = profile as any;
      return {
        ...safe,
        id: u.id,
        email: u.email || (profile as any).email,
        name: (profile as any).name || u.user_metadata?.full_name || u.email?.split('@')[0] || 'Sem nome',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        meta_access_token_set: !!meta_access_token,
        meta_app_secret_set: !!meta_app_secret,
      };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({ success: true, data: merged });
  } catch (err: any) {
    console.error('[AdminAPI] Users Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/v2/admin/users/:id ────────────────────────────────────────
// SEC-06: Whitelist de campos para permitir alterações de plano e cargo por administradores
const ADMIN_USER_PATCH_ALLOWED_FIELDS = [
  'name', 'plano', 'role', 'trial_ends_at', 'is_active',
  'feature_flags', 'sofia_active', 'whatsapp_status',
  'whatsapp_provider', // admin can switch a tenant between evolution/uazapi/meta_official
];

router.patch('/users/:id', async (req: AuthenticatedRequest, res: Response) => {
  const targetUserId = req.params.id;
  try {
    // Filtrar apenas campos permitidos
    const payload = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => ADMIN_USER_PATCH_ALLOWED_FIELDS.includes(k))
    );

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update.' });
    }

    // Capture previous provider so we can audit transitions
    let previousProvider: string | null = null;
    if ('whatsapp_provider' in payload) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('whatsapp_provider')
        .eq('id', targetUserId)
        .maybeSingle();
      previousProvider = existing?.whatsapp_provider || null;
    }

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', targetUserId);

    if (error) throw error;

    const { invalidateCache, cacheKey } = await import('../lib/redisCache.js');
    await invalidateCache(cacheKey.profile(targetUserId));

    if ('whatsapp_provider' in payload && payload.whatsapp_provider !== previousProvider) {
      logProviderAudit({
        targetUserId,
        performedBy: req.userId,
        action: 'provider_changed',
        details: { from: previousProvider, to: payload.whatsapp_provider },
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[AdminAPI] User Update Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/admin/users/:id/meta-credentials ────────────────────────
// Admin sets Meta Cloud API credentials for a tenant. Validates via Graph API
// before persisting and switches whatsapp_provider to 'meta_official'.
const META_BASE = 'https://graph.facebook.com/v19.0';
router.post('/users/:id/meta-credentials', async (req: AuthenticatedRequest, res: Response) => {
  const targetUserId = req.params.id;
  const { access_token, phone_id, waba_id, app_secret } = req.body || {};

  if (!access_token || !phone_id) {
    return res.status(400).json({ success: false, error: 'access_token and phone_id are required' });
  }

  try {
    // Validate against Graph API before storing
    let probeData: any;
    try {
      const { data } = await axios.get(`${META_BASE}/${phone_id}`, {
        params: { fields: 'verified_name,display_phone_number,quality_rating,code_verification_status' },
        headers: { Authorization: `Bearer ${access_token}` },
        timeout: 15000,
      });
      probeData = data;
    } catch (err: any) {
      const info = parseProviderError(err);
      return res.status(400).json({ success: false, error: info.message, errorInfo: info });
    }

    // Anti-collision: no other tenant can claim the same phone_id
    const { data: clash } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('meta_phone_id', phone_id)
      .neq('id', targetUserId)
      .maybeSingle();
    if (clash) {
      return res.status(409).json({
        success: false,
        error: `phone_id ${phone_id} já está vinculado a outro inquilino (${clash.email})`,
      });
    }

    const updatePayload: Record<string, any> = {
      whatsapp_provider: 'meta_official',
      meta_access_token: access_token,
      meta_phone_id: phone_id,
      meta_waba_id: waba_id || null,
      meta_last_error: null,
      meta_last_error_at: null,
      whatsapp_status: 'connected',
      updated_at: new Date().toISOString(),
    };
    if (typeof app_secret === 'string' && app_secret.trim()) {
      updatePayload.meta_app_secret = app_secret.trim();
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', targetUserId);

    if (updateErr) throw updateErr;

    MetaProvider.invalidateCredentialCache(targetUserId);

    logProviderAudit({
      targetUserId,
      performedBy: req.userId,
      action: 'meta_credentials_saved',
      details: maskedMetaPayload({ access_token, phone_id, waba_id, app_secret }),
    });

    return res.json({
      success: true,
      provider: 'meta_official',
      phone: {
        phone_id,
        display_phone_number: probeData.display_phone_number,
        verified_name: probeData.verified_name,
        quality_rating: probeData.quality_rating,
        verification_status: probeData.code_verification_status,
      },
    });
  } catch (err: any) {
    console.error('[AdminAPI] meta-credentials error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/admin/users/:id/meta-disconnect ─────────────────────────
router.post('/users/:id/meta-disconnect', async (req: AuthenticatedRequest, res: Response) => {
  const targetUserId = req.params.id;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        whatsapp_provider: 'evolution',
        meta_access_token: null,
        meta_phone_id: null,
        meta_waba_id: null,
        meta_app_secret: null,
        whatsapp_status: 'disconnected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetUserId);

    if (error) throw error;
    MetaProvider.invalidateCredentialCache(targetUserId);
    logProviderAudit({
      targetUserId,
      performedBy: req.userId,
      action: 'meta_disconnected',
      details: { reverted_to: 'evolution' },
    });
    return res.json({ success: true, provider: 'evolution' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/admin/users/:id/reset-whatsapp ──────────────────────────
router.post('/users/:id/reset-whatsapp', async (req: AuthenticatedRequest, res: Response) => {
  const targetUserId = req.params.id;
  try {
    const { whatsappService } = await import('../services/whatsappService.js');
    await whatsappService.logout(targetUserId).catch(() => {});
    
    const { error } = await supabase
      .from('profiles')
      .update({
        whatsapp_status: 'disconnected',
        whatsapp_instance_id: null,
        whatsapp_qr: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetUserId);

    if (error) throw error;

    const { invalidateCache, cacheKey } = await import('../lib/redisCache.js');
    await invalidateCache(cacheKey.profile(targetUserId)).catch(() => {});

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v2/admin/users/:id/diagnostic ───────────────────────────────
// One-shot health snapshot of a tenant's WhatsApp setup. Used by the
// AdminPanel "Diagnóstico" button — pulls profile state, live Meta probe,
// recent errors, message counts and provider audit history in one round trip.
router.get('/users/:id/diagnostic', async (req: AuthenticatedRequest, res: Response) => {
  const targetUserId = req.params.id;
  const META_BASE = 'https://graph.facebook.com/v19.0';
  try {
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id, email, whatsapp_provider, whatsapp_status, whatsapp_instance_id, meta_phone_id, meta_waba_id, meta_access_token, meta_app_secret, meta_last_error, meta_last_error_at, updated_at')
      .eq('id', targetUserId)
      .maybeSingle();
    if (pErr || !profile) {
      return res.status(404).json({ success: false, error: pErr?.message || 'Profile not found' });
    }

    const isMeta = profile.whatsapp_provider === 'meta_official';

    // Run independent probes in parallel
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [messagesAgg, failedAgg, auditRows, livePhone, templatesCount] = await Promise.all([
      supabase.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', targetUserId)
        .gte('created_at', since24h),
      supabase.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', targetUserId)
        .in('status', ['failed', 'failed_24h_window']),
      supabase.from('provider_audit_log')
        .select('action, performed_at, details, performed_by')
        .eq('target_user_id', targetUserId)
        .order('performed_at', { ascending: false })
        .limit(10),
      // Live Meta phone probe
      isMeta && profile.meta_access_token && profile.meta_phone_id
        ? axios.get(`${META_BASE}/${profile.meta_phone_id}`, {
            params: { fields: 'verified_name,display_phone_number,quality_rating,code_verification_status,name_status' },
            headers: { Authorization: `Bearer ${profile.meta_access_token}` },
            timeout: 10000,
          }).then(r => ({ ok: true as const, data: r.data })).catch(e => ({ ok: false as const, error: parseProviderError(e) }))
        : Promise.resolve(null),
      // Templates count (only if WABA configured)
      isMeta && profile.meta_access_token && profile.meta_waba_id
        ? axios.get(`${META_BASE}/${profile.meta_waba_id}/message_templates`, {
            params: { limit: 1, fields: 'name', summary: 'total_count' },
            headers: { Authorization: `Bearer ${profile.meta_access_token}` },
            timeout: 10000,
          }).then(r => ({ approved: r.data?.data?.length || 0, total: r.data?.summary?.total_count })).catch(() => null)
        : Promise.resolve(null),
    ]);

    return res.json({
      success: true,
      diagnostic: {
        profile: {
          id: profile.id,
          email: profile.email,
          provider: profile.whatsapp_provider || 'evolution',
          status: profile.whatsapp_status,
          updated_at: profile.updated_at,
        },
        meta: isMeta ? {
          phone_id: profile.meta_phone_id,
          waba_id: profile.meta_waba_id,
          access_token_set: !!profile.meta_access_token,
          app_secret_set: !!profile.meta_app_secret,
          last_error: profile.meta_last_error,
          last_error_at: profile.meta_last_error_at,
          live: livePhone?.ok ? {
            display_phone_number: (livePhone as any).data.display_phone_number,
            verified_name: (livePhone as any).data.verified_name,
            quality_rating: (livePhone as any).data.quality_rating,
            verification_status: (livePhone as any).data.code_verification_status,
            name_status: (livePhone as any).data.name_status,
          } : null,
          live_error: livePhone && !livePhone.ok ? (livePhone as any).error?.message : null,
          templates: templatesCount,
        } : null,
        evolution: !isMeta ? {
          instance_id: profile.whatsapp_instance_id,
        } : null,
        messages_24h: messagesAgg.count || 0,
        failed_messages_total: failedAgg.count || 0,
        audit: auditRows.data || [],
      },
    });
  } catch (err: any) {
    console.error('[AdminAPI] Diagnostic error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v2/admin/users/:id/activity ─────────────────────────────────
router.get('/users/:id/activity', async (req: AuthenticatedRequest, res: Response) => {
  const targetUserId = req.params.id;
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', targetUserId)
      .order('timestamp', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v2/admin/settings ──────────────────────────────────────────
router.get('/settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase.from('global_settings').select('*').limit(1).maybeSingle();
    if (error) throw error;
    res.json({ success: true, data: data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/v2/admin/settings ────────────────────────────────────────
router.patch('/settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payload = { ...req.body };
    
    // Tratar campos UUID vazios como null para evitar erro de sintaxe no banco
    if (payload.admin_notification_user_id === '') {
      payload.admin_notification_user_id = null;
    }
    
    const { data: existing } = await supabase.from('global_settings').select('id').limit(1).maybeSingle();
    let result;
    if (existing) {
      result = await supabase.from('global_settings').update(payload).eq('id', existing.id);
    } else {
      result = await supabase.from('global_settings').insert(payload);
    }
    if (result.error) throw result.error;
    res.json({ success: true });
  } catch (err: any) {
    console.error('[AdminAPI] Settings Update Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/admin/meta/register ────────────────────────────────────
// Mirrors the n8n "Registrar Número de Whatsapp" node.
// Activates the phone number on the Meta Cloud API with a security PIN.
router.post('/meta/register', async (req: AuthenticatedRequest, res: Response) => {
  const { access_token, phone_id, pin } = req.body;

  if (!access_token || !phone_id) {
    return res.status(400).json({ success: false, error: 'access_token and phone_id are required' });
  }

  try {
    const response = await axios.post(
      `${META_BASE}/${phone_id}/register`,
      {
        messaging_product: 'whatsapp',
        pin: pin || '123456'
      },
      {
        headers: { Authorization: `Bearer ${access_token}` },
        timeout: 15000
      }
    );

    res.json({ success: true, data: response.data });
  } catch (err: any) {
    const info = parseProviderError(err);
    console.error('[AdminAPI] Meta Register Error:', info.message);
    res.status(err.response?.status || 500).json({ success: false, error: info.message, errorInfo: info });
  }
});

// ─── POST /api/v2/admin/meta/subscribe ───────────────────────────────────
// Mirrors the n8n "Inscreve no App" node.
// Connects the WABA/BM to the platform's app to receive webhook events.
router.post('/meta/subscribe', async (req: AuthenticatedRequest, res: Response) => {
  const { access_token, waba_id } = req.body;

  if (!access_token || !waba_id) {
    return res.status(400).json({ success: false, error: 'access_token and waba_id are required' });
  }

  try {
    const response = await axios.post(
      `${META_BASE}/${waba_id}/subscribed_apps`,
      {
        subscribed_fields: 'messages,message_status,messaging_postbacks,message_echoes'
      },
      {
        headers: { Authorization: `Bearer ${access_token}` },
        timeout: 15000
      }
    );

    res.json({ success: true, data: response.data });
  } catch (err: any) {
    const info = parseProviderError(err);
    console.error('[AdminAPI] Meta Subscribe Error:', info.message);
    res.status(err.response?.status || 500).json({ success: false, error: info.message, errorInfo: info });
  }
});

// ─── GET /api/v2/admin/finance/stats ─────────────────────────────────────
router.get('/finance/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: totalData, error: totalErr } = await supabase
      .from('messages')
      .select('user_id, cost_brl, tokens_prompt, tokens_completion');
    
    if (totalErr) throw totalErr;
    
    const totalCost = (totalData || []).reduce((acc, curr) => acc + (Number(curr.cost_brl) || 0), 0);
    const totalTokens = (totalData || []).reduce((acc, curr) => acc + (curr.tokens_prompt || 0) + (curr.tokens_completion || 0), 0);
    const userCostsMap = (totalData || []).reduce((acc: any, curr: any) => {
      acc[curr.user_id] = (acc[curr.user_id] || 0) + (Number(curr.cost_brl) || 0);
      return acc;
    }, {});

    res.json({ 
      success: true, 
      data: {
        totalCostBrl: totalCost,
        totalTokens: totalTokens,
        userCosts: userCostsMap
      } 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v2/admin/activity ──────────────────────────────────────────
router.get('/activity', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('messages')
      .select('created_at, direction')
      .gt('created_at', yesterday);

    if (error) throw error;

    const hourlyData: Record<string, { hour: string, ia: number, human: number }> = {};
    for (let i = 0; i < 24; i++) {
      const d = new Date(Date.now() - i * 60 * 60 * 1000);
      const h = d.getHours() + ':00';
      hourlyData[h] = { hour: h, ia: 0, human: 0 };
    }

    (data || []).forEach(m => {
      const h = new Date(m.created_at).getHours() + ':00';
      if (hourlyData[h]) {
        if (m.direction === 'outbound') hourlyData[h].ia++;
        else hourlyData[h].human++;
      }
    });

    res.json({ success: true, data: Object.values(hourlyData).reverse() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v2/admin/dashboard/growth ─────────────────────────────────────
router.get('/dashboard/growth', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [leads, appts] = await Promise.all([
      supabase.from('contacts').select('created_at').gt('created_at', sevenDaysAgo),
      supabase.from('appointments').select('created_at').gt('created_at', sevenDaysAgo)
    ]);

    const dailyData: Record<string, any> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      dailyData[d] = { date: d, leads: 0, agendamentos: 0 };
    }

    (leads.data || []).forEach(l => {
      const d = l.created_at.split('T')[0];
      if (dailyData[d]) dailyData[d].leads++;
    });

    (appts.data || []).forEach(a => {
      const d = a.created_at.split('T')[0];
      if (dailyData[d]) dailyData[d].agendamentos++;
    });

    res.json({ success: true, data: Object.values(dailyData).reverse() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── LEAD RADAR (CAPTAÇÃO) ──────────────────────────────────────────────────

// GET /api/v2/admin/leads - Listar leads capturados
router.get('/leads', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('leads_radar')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Função interna de varredura — executada em background após resposta ao cliente
async function runLeadScanBackground(params: {
  niche: string; city: string; zip?: string; limit: number; context: string; apifyToken: string;
}) {
  const { niche, city, zip, limit, context, apifyToken } = params;
  const query = `${niche} em ${city} ${zip || ''}`.trim();
  console.log(`[LeadRadar][BG] Iniciando busca Apify: "${query}" com meta de ${limit} leads.`);

  let rawPlaces: any[] = [];
  try {
    const apifyResponse = await axios.post(
      `https://api.apify.com/v2/acts/nwua9Gu5YrADL7ZDj/run-sync-get-dataset-items?token=${apifyToken}`,
      { searchStringsArray: [query], maxCrawledPlacesPerSearch: limit * 2, language: 'pt-BR', countryCode: 'br', scrapeContacts: true },
      { headers: { 'Content-Type': 'application/json' }, timeout: 300000 } // 5 min
    );
    rawPlaces = apifyResponse.data || [];
  } catch (apifyErr: any) {
    console.warn('[LeadRadar][BG] Erro Apify:', apifyErr.response?.data || apifyErr.message);
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

    let reviewSummary = 'Sem resumo', personalizedMessage = '';
    try {
      const aiContextStr = context ? `\nContexto: ${context}` : '';
      const aiPrompt = `Você é um Estratégico Especialista em Vendas. Sua missão é analisar este negócio local e criar uma mensagem de abordagem para WhatsApp implacável.\n\nDados do Negócio:\nNome: ${place.title}\nEspecialidade: ${place.categoryName}\nAvaliação: ${rating} (${ratingCount} depoimentos)\nSite: ${website || 'Não possui'}\nInstagram: ${instagram || 'Não possui'}\nScore de Dor: ${pain_score}/5\nScore de Oportunidade: ${opportunity_score}/5${aiContextStr}\n\nRetorne estritamente JSON:\n{"observacao_ia":"...","mensagem_personalizada":"..."}`;
      const aiRes = await generateAIResponse(aiPrompt, [{ role: 'user', content: 'Gere a análise.' }]);
      const aiJson = JSON.parse(aiRes.text.replace(/```json/g, '').replace(/```/g, '').trim());
      reviewSummary = aiJson.observacao_ia || reviewSummary;
      personalizedMessage = aiJson.mensagem_personalizada || '';
    } catch { /* IA falhou — segue sem mensagem */ }

    const { data: savedLead, error: upsertErr } = await supabase
      .from('leads_radar')
      .upsert({
        name: place.title || 'Sem nome', phone: normalized, address: place.address,
        rating, user_rating_count: ratingCount, website, review_summary: reviewSummary,
        personalized_message: personalizedMessage, instagram, email,
        pain_score, opportunity_score,
        place_id: place.placeId || place.id || Date.now().toString(),
        niche, city, status: 'novo'
      }, { onConflict: 'place_id' })
      .select().single();

    if (!upsertErr) leadsProcessados.push(savedLead);
  }
  console.log(`[LeadRadar][BG] ✅ ${leadsProcessados.length} leads salvos.`);
}

// POST /api/v2/admin/leads/scan - Iniciar varredura no Google Maps (responde imediatamente)
router.post('/leads/scan', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { niche, city, zip, limit = 10, context = '' } = req.body;
    if (!niche || !city) return res.status(400).json({ success: false, error: 'Nicho e Cidade são obrigatórios' });

    // 1. Obter Apify API Token das configurações
    const { data: settings } = await supabase.from('global_settings').select('apify_api_token').single();
    const apifyToken = settings?.apify_api_token;

    if (!apifyToken) return res.status(400).json({ success: false, error: 'Apify API Token não configurado' });

    // Responde imediatamente — o scraping roda em background para evitar timeout do proxy
    res.json({ success: true, scanning: true, message: 'Busca iniciada. Acompanhe os leads aparecendo em breve.' });

    // Dispara o processamento sem bloquear a resposta
    runLeadScanBackground({ niche, city, zip, limit, context, apifyToken })
      .catch(err => console.error('[LeadRadar] Erro background scan:', err.message));
  } catch (err: any) {
    console.error('[LeadRadar] Erro geral:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v2/admin/leads/autopilot - Iniciar disparos automáticos
router.post('/leads/autopilot', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.userId;
    const { limit = 40, minDelay = 60, maxDelay = 180, templateName, injectVariable } = req.body;

    // Verificar se o admin tem provedor conectado
    const provider = await WhatsAppProviderFactory.getProvider(adminId);
    if (!provider) {
      return res.status(400).json({ success: false, error: 'Nenhuma conexão de WhatsApp ativa encontrada para a Sofia.' });
    }
    const instanceName = `wppai_${adminId.substring(0, 8)}`;
    const statusInfo = await provider.getStatus(instanceName);
    if (statusInfo.status !== 'connected') {
      return res.status(400).json({ success: false, error: 'O WhatsApp da Sofia não está conectado.' });
    }

    // Buscar leads pendentes
    const { data: leads, error } = await supabase
      .from('leads_radar')
      .select('*')
      .eq('status', 'novo')
      .not('personalized_message', 'is', null)
      .not('phone', 'is', null)
      .limit(limit);

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum lead com status "novo" e mensagem gerada foi encontrado.' });
    }

    // Função assíncrona de background (fire-and-forget)
    const runAutopilot = async () => {
      console.log(`[LeadRadar] Piloto Automático iniciado para ${leads.length} leads.`);
      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        
        try {
          // Verifica se o telefone está formatado corretamente para o provedor
          let jid = lead.phone;
          if (!jid.includes('@')) jid = `${jid}@s.whatsapp.net`;
          if (!jid.startsWith('55')) jid = `55${jid}`;
          
          if (templateName && provider.sendTemplate) {
            // Usa envio de template (padrão oficial da Meta para abrir conversas)
            let components: any[] = [];
            if (injectVariable && lead.personalized_message) {
              components = [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: lead.personalized_message }
                  ]
                }
              ];
            }
            await provider.sendTemplate(adminId, jid, templateName, 'pt_BR', components);
          } else {
            // Fallback para envio padrão de texto (caso seja Baileys ou Evolution)
            await provider.sendMessage(adminId, jid, lead.personalized_message);
          }
          
          // Atualiza status para 'contatado'
          await supabase.from('leads_radar').update({ status: 'contatado', updated_at: new Date().toISOString() }).eq('id', lead.id);
          console.log(`[LeadRadar] Piloto Automático: Mensagem enviada para ${lead.phone} (${i+1}/${leads.length})`);
        } catch (sendErr: any) {
          console.error(`[LeadRadar] Piloto Automático: Erro ao enviar para ${lead.phone}:`, sendErr.message);
          // Atualiza status para 'erro'
          await supabase.from('leads_radar').update({ status: 'erro', updated_at: new Date().toISOString() }).eq('id', lead.id);
        }

        // Se não for o último lead, aguarda o delay aleatório para evitar banimento
        if (i < leads.length - 1) {
          const delaySeconds = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          console.log(`[LeadRadar] Piloto Automático: Aguardando ${delaySeconds}s antes do próximo envio...`);
          await new Promise(r => setTimeout(r, delaySeconds * 1000));
        }
      }
      console.log(`[LeadRadar] Piloto Automático finalizado com sucesso.`);
    };

    // Inicia a função sem travar a resposta da API (O usuário recebe o feedback na hora)
    runAutopilot().catch(err => console.error('[LeadRadar] Erro fatal no Piloto Automático:', err));

    res.json({ success: true, count: leads.length, message: `Piloto Automático iniciado em background para ${leads.length} leads.` });
  } catch (err: any) {
    console.error('[LeadRadar] Erro ao iniciar Piloto Automático:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/v2/admin/leads/:id - Atualizar status e/ou notas do lead
router.patch('/leads/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, notes } = req.body;
    const updateFields: Record<string, any> = { updated_at: new Date().toISOString() };
    if (status !== undefined) updateFields.status = status;
    if (notes !== undefined) updateFields.notes = notes;

    const { data, error } = await supabase
      .from('leads_radar')
      .update(updateFields)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v2/admin/leads/:id - Remover lead
router.delete('/leads/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { error } = await supabase
      .from('leads_radar')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /templates — cross-tenant template overview for admin dashboard.
 * Returns template_status_cache enriched with send metrics and latest quality.
 */
router.get('/templates', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: cacheRows, error: cacheErr } = await supabase
      .from('template_status_cache')
      .select('user_id, template_name, language_code, status, reason, last_event, last_event_at');
    if (cacheErr) throw cacheErr;

    const userIds = [...new Set((cacheRows || []).map((r: any) => r.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    const since30d = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: sendRows } = await supabase
      .from('template_send_log')
      .select('user_id, template_name, status, warnings')
      .gte('created_at', since30d);

    const metricsMap = new Map<string, { total: number; sent: number; with_warnings: number }>();
    for (const r of sendRows || []) {
      const k = `${r.user_id}__${r.template_name}`;
      if (!metricsMap.has(k)) metricsMap.set(k, { total: 0, sent: 0, with_warnings: 0 });
      const m = metricsMap.get(k)!;
      m.total++;
      if (r.status === 'sent') m.sent++;
      if (Array.isArray(r.warnings) && r.warnings.length > 0) m.with_warnings++;
    }

    const { data: qualityRows } = await supabase
      .from('template_quality_history')
      .select('user_id, template_name, language_code, quality_score, recorded_at')
      .order('recorded_at', { ascending: false });

    const qualityMap = new Map<string, string>();
    for (const r of qualityRows || []) {
      const k = `${r.user_id}__${r.template_name}__${r.language_code}`;
      if (!qualityMap.has(k)) qualityMap.set(k, r.quality_score);
    }

    let totalApproved = 0, totalPaused = 0, totalRejected = 0, totalSends30d = 0;

    const rows = (cacheRows || []).map((r: any) => {
      const profile = profileMap.get(r.user_id);
      const metrics = metricsMap.get(`${r.user_id}__${r.template_name}`) || { total: 0, sent: 0, with_warnings: 0 };
      const quality = qualityMap.get(`${r.user_id}__${r.template_name}__${r.language_code}`) || null;
      const s = (r.status || '').toUpperCase();
      if (s === 'APPROVED') totalApproved++;
      else if (s === 'PAUSED') totalPaused++;
      else if (s === 'REJECTED') totalRejected++;
      totalSends30d += metrics.total;
      return {
        user_id: r.user_id,
        tenant_email: profile?.email || r.user_id.slice(0, 8),
        template_name: r.template_name,
        language_code: r.language_code,
        status: r.status,
        reason: r.reason,
        last_event: r.last_event,
        last_event_at: r.last_event_at,
        sends_30d: metrics.total,
        sent_ok_30d: metrics.sent,
        warnings_30d: metrics.with_warnings,
        quality_score: quality,
      };
    });

    return res.json({
      success: true,
      rows,
      stats: { total: rows.length, approved: totalApproved, paused: totalPaused, rejected: totalRejected, sends_30d: totalSends30d },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /templates/sync — busca templates de todos os tenants na Meta e
 * faz upsert em template_status_cache. Corrige a defasagem entre a API
 * da Meta e o cache local (que normalmente só é atualizado via webhook).
 */
router.post('/templates/sync', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    // Busca qualquer tenant que tenha meta_waba_id E meta_access_token configurados,
    // independente do campo whatsapp_provider (alguns admins podem ter valor diferente)
    const { data: tenants, error: tenantsErr } = await supabase
      .from('profiles')
      .select('id, meta_waba_id, whatsapp_provider')
      .not('meta_waba_id', 'is', null)
      .not('meta_access_token', 'is', null);

    if (tenantsErr) throw tenantsErr;

    console.log(`[Templates/Sync] Found ${tenants?.length ?? 0} tenants with meta credentials`);

    if (!tenants || tenants.length === 0) {
      return res.json({ success: true, synced: 0, tenants: 0, message: 'Nenhum tenant com credenciais Meta encontrado' });
    }

    let totalSynced = 0;
    const errors: string[] = [];

    for (const tenant of tenants) {
      try {
        const provider = new MetaProvider(tenant.id);
        const templates = await provider.listTemplates(tenant.id, { limit: 200 });
        console.log(`[Templates/Sync] Tenant ${tenant.id} (${tenant.whatsapp_provider}): ${templates?.length ?? 0} templates`);
        if (!templates || templates.length === 0) continue;

        const upserts = templates.map((t: any) => {
          // quality_score pode vir como objeto { score: 'GREEN' } ou string
          let qs: string | null = null;
          if (t.quality_score) {
            qs = typeof t.quality_score === 'object'
              ? (t.quality_score.score || 'UNKNOWN').toUpperCase()
              : String(t.quality_score).toUpperCase();
          }
          return {
            user_id: tenant.id,
            template_name: t.name,
            language_code: t.language || 'pt_BR',
            status: (t.status || 'UNKNOWN').toUpperCase(),
            category: t.category || null,
            quality_score: qs,
            reason: t.rejected_reason || null,
            last_event: 'SYNC',
            last_event_at: new Date().toISOString(),
          };
        });

        const { error } = await supabase
          .from('template_status_cache')
          .upsert(upserts, { onConflict: 'user_id,template_name,language_code' });

        if (!error) {
          totalSynced += upserts.length;
        } else {
          console.warn(`[Templates/Sync] Tenant ${tenant.id} upsert error:`, error.message);
          errors.push(`${tenant.id.slice(0, 8)}: ${error.message}`);
        }
      } catch (err: any) {
        const msg = err.message || String(err);
        console.warn(`[Templates/Sync] Tenant ${tenant.id} failed:`, msg);
        errors.push(`${tenant.id.slice(0, 8)}: ${msg}`);
      }
    }

    return res.json({
      success: true,
      synced: totalSynced,
      tenants: tenants.length,
      errors: errors.length ? errors : undefined,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
