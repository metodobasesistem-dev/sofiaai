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

// ─── GET /api/v2/admin/users ──────────────────────────────────────────────
router.get('/users', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Redact sensitive credentials before sending to the admin UI. We expose
    // only boolean "configured" flags so the panel can render state without
    // ever holding secret material in browser memory.
    const redacted = (data || []).map((row: any) => {
      const { meta_access_token, meta_app_secret, whatsapp_qr, ...safe } = row;
      return {
        ...safe,
        meta_access_token_set: !!meta_access_token,
        meta_app_secret_set: !!meta_app_secret,
      };
    });

    res.json({ success: true, data: redacted });
  } catch (err: any) {
    console.error('[AdminAPI] Users Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/v2/admin/users/:id ────────────────────────────────────────
// SEC-06: Whitelist de campos para evitar injeção de campos sensíveis (role, id, email)
const ADMIN_USER_PATCH_ALLOWED_FIELDS = [
  'name', 'plan', 'trial_ends_at', 'is_active',
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

export default router;
