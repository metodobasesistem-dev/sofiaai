/**
 * Agent API Routes — Backend proxy for agents table.
 *
 * All operations use service role key (bypasses RLS entirely).
 * Redis cache with 2-minute TTL reduces Supabase queries to near-zero.
 * JWT auth middleware ensures only the owner can access their agents.
 */
import { Router, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { cacheWrap, invalidateCache, cacheKey, TTL } from '../lib/redisCache.js';

const router = Router();

// All routes require a valid Supabase JWT
router.use(requireAuth as any);

// ─── GET /api/v2/agents ───────────────────────────────────────────────────
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const agents = await cacheWrap(
      cacheKey.agents(userId),
      TTL.AGENTS,
      async () => {
        const { data, error } = await supabase
          .from('agents')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
      }
    );

    res.json({ success: true, data: agents });
  } catch (err: any) {
    console.error('[AgentAPI] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/agents ──────────────────────────────────────────────────
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const { data, error } = await supabase
      .from('agents')
      .insert({ ...req.body, user_id: userId })
      .select()
      .single();

    if (error) throw error;

    await invalidateCache(cacheKey.agents(userId));
    console.log(`[AgentAPI] ✅ Agent created: ${data.id} for user ${userId}`);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    console.error('[AgentAPI] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /api/v2/agents/:id ───────────────────────────────────────────────
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const agentId = req.params.id;
  try {
    const { error } = await supabase
      .from('agents')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', agentId)
      .eq('user_id', userId); // Security: only own agents

    if (error) throw error;

    await invalidateCache(cacheKey.agents(userId));
    console.log(`[AgentAPI] ✅ Agent updated: ${agentId}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[AgentAPI] PUT error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/v2/agents/:id/toggle ─────────────────────────────────────
router.patch('/:id/toggle', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const agentId = req.params.id;
  const { status_ativo } = req.body;

  try {
    // Deactivate all other agents first (only one can be active)
    if (status_ativo) {
      await supabase
        .from('agents')
        .update({ status_ativo: false })
        .eq('user_id', userId)
        .neq('id', agentId);
    }

    const { error } = await supabase
      .from('agents')
      .update({ status_ativo })
      .eq('id', agentId)
      .eq('user_id', userId);

    if (error) throw error;

    await invalidateCache(cacheKey.agents(userId));
    res.json({ success: true });
  } catch (err: any) {
    console.error('[AgentAPI] PATCH toggle error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/v2/agents/:id ────────────────────────────────────────────
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const agentId = req.params.id;
  try {
    const { error } = await supabase
      .from('agents')
      .delete()
      .eq('id', agentId)
      .eq('user_id', userId);

    if (error) throw error;

    await invalidateCache(cacheKey.agents(userId));
    console.log(`[AgentAPI] ✅ Agent deleted: ${agentId}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[AgentAPI] DELETE error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
