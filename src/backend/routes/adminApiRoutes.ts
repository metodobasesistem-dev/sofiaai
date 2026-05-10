/**
 * Admin API Routes — Global platform management.
 *
 * Strictly restricted to users with 'admin' role.
 * Uses service role key to access all tenant data.
 */
import { Router, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/authMiddleware.js';

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
    res.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error('[AdminAPI] Users Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/v2/admin/users/:id ────────────────────────────────────────
// SEC-06: Whitelist de campos para evitar injeção de campos sensíveis (role, id, email)
const ADMIN_USER_PATCH_ALLOWED_FIELDS = [
  'name', 'plan', 'trial_ends_at', 'is_active',
  'feature_flags', 'sofia_active', 'whatsapp_status'
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

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', targetUserId);

    if (error) throw error;
    
    const { invalidateCache, cacheKey } = await import('../lib/redisCache.js');
    await invalidateCache(cacheKey.profile(targetUserId));
    
    res.json({ success: true });
  } catch (err: any) {
    console.error('[AdminAPI] User Update Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
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
