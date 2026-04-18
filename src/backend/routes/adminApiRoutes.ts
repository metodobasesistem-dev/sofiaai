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

// All routes require authentication AND admin role
router.use(requireAuth as any);
router.use(requireAdmin as any);

// ─── GET /api/v2/admin/stats ──────────────────────────────────────────────
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Note: In a huge system, these should be pre-calculated or use RPC
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
router.patch('/users/:id', async (req: AuthenticatedRequest, res: Response) => {
  const targetUserId = req.params.id;
  try {
    const { error } = await supabase
      .from('profiles')
      .update(req.body)
      .eq('id', targetUserId);

    if (error) throw error;
    
    // Invalidate profile cache for the target user
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
  console.log(`[AdminAPI] Force resetting WhatsApp session for user: ${targetUserId}`);
  
  try {
    const { whatsappService } = await import('../services/whatsappService.js');
    
    // 1. Tentar logout (o novo whatsappService já é resiliente e busca o ID correto)
    await whatsappService.logout(targetUserId).catch(err => {
      console.warn(`[AdminAPI] Warning during logout for ${targetUserId}:`, err.message);
    });
    
    // 2. Clear status e ID de instância no profiles (Garante a limpeza profunda)
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

    // 3. Clear profile cache
    const { invalidateCache, cacheKey } = await import('../lib/redisCache.js');
    await invalidateCache(cacheKey.profile(targetUserId)).catch(() => {});

    res.json({ success: true, message: 'WhatsApp session reset completely' });
  } catch (err: any) {
    console.error('[AdminAPI] WhatsApp Reset Error:', err.message);
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
    console.error('[AdminAPI] Activity Error:', err.message);
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
    const { data: existing } = await supabase.from('global_settings').select('id').limit(1).maybeSingle();
    
    let result;
    if (existing) {
      result = await supabase.from('global_settings').update(req.body).eq('id', existing.id);
    } else {
      result = await supabase.from('global_settings').insert(req.body);
    }

    if (result.error) throw result.error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v2/admin/finance/stats ─────────────────────────────────────
router.get('/finance/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // 1. Total cost
    const { data: totalData, error: totalErr } = await supabase
      .from('messages')
      .select('cost_brl, tokens_prompt, tokens_completion');
    
    if (totalErr) throw totalErr;
    
    const totalCost = (totalData || []).reduce((acc, curr) => acc + (Number(curr.cost_brl) || 0), 0);
    const totalTokensPrompt = (totalData || []).reduce((acc, curr) => acc + (curr.tokens_prompt || 0), 0);
    const totalTokensCompletion = (totalData || []).reduce((acc, curr) => acc + (curr.tokens_completion || 0), 0);

    // 2. Cost by user
    const userCostsMap = (totalData || []).reduce((acc: any, curr: any) => {
      acc[curr.user_id] = (acc[curr.user_id] || 0) + (Number(curr.cost_brl) || 0);
      return acc;
    }, {});

    res.json({ 
      success: true, 
      data: {
        totalCostBrl: totalCost,
        totalTokens: totalTokensPrompt + totalTokensCompletion,
        userCosts: userCostsMap
      } 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
