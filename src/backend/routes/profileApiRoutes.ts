/**
 * Profile API Routes — Backend proxy for profiles table.
 *
 * Uses service role key and Redis cache (10-minute TTL).
 * Handles the "get_my_profile" logic securely.
 */
import { Router, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { cacheWrap, invalidateCache, cacheKey, TTL } from '../lib/redisCache.js';

const router = Router();

// All routes require a valid Supabase JWT
router.use(requireAuth as any);

// ─── GET /api/v2/profile ──────────────────────────────────────────────────
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const profile = await cacheWrap(
      cacheKey.profile(userId),
      TTL.PROFILE,
      async () => {
        // We use service role to fetch the profile by ID
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (error) {
          // If profile doesn't exist, return a skeleton (frontend handles creation if needed)
          return { id: userId, email: req.userEmail, role: 'client', whatsapp_status: 'disconnected' };
        }
        return data;
      }
    );

    res.json({ success: true, data: profile });
  } catch (err: any) {
    console.error('[ProfileAPI] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/v2/profile ───────────────────────────────────────────────
router.patch('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const { error } = await supabase
      .from('profiles')
      .update(req.body)
      .eq('id', userId);

    if (error) throw error;

    await invalidateCache(cacheKey.profile(userId));
    res.json({ success: true });
  } catch (err: any) {
    console.error('[ProfileAPI] PATCH error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v2/profile/growth ─────────────────────────────────────────────
router.get('/growth', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // Buscar leads e resolvidos do usuário nos últimos 7 dias
    const [leads, resolved] = await Promise.all([
      supabase.from('contacts')
        .select('created_at')
        .eq('user_id', userId)
        .gt('created_at', sevenDaysAgo),
      supabase.from('contacts')
        .select('updated_at') // Usamos updated_at para capturar quando virou resolvido
        .eq('user_id', userId)
        .eq('status_funil', 'Resolvido')
        .gt('updated_at', sevenDaysAgo)
    ]);

    const dailyData: Record<string, any> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      dailyData[d] = { date: d, leads: 0, resolvidos: 0 };
    }

    (leads.data || []).forEach(l => {
      const d = l.created_at.split('T')[0];
      if (dailyData[d]) dailyData[d].leads++;
    });

    (resolved.data || []).forEach(r => {
      const d = r.updated_at.split('T')[0];
      if (dailyData[d]) dailyData[d].resolvidos++;
    });

    res.json({ success: true, data: Object.values(dailyData).reverse() });
  } catch (err: any) {
    console.error('[ProfileAPI] Growth error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
