/**
 * Contact API Routes — Backend proxy for contacts table.
 *
 * Uses service role key and Redis cache (60s TTL).
 * JWT auth middleware ensures privacy.
 */
import { Router, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { cacheWrap, invalidateCache, cacheKey, TTL } from '../lib/redisCache.js';

const router = Router();

// All routes require a valid Supabase JWT
router.use(requireAuth as any);

// ─── GET /api/v2/contacts ─────────────────────────────────────────────────
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const contacts = await cacheWrap(
      cacheKey.contacts(userId),
      TTL.CONTACTS,
      async () => {
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .eq('user_id', userId)
          .order('ultima_interacao', { ascending: false });

        if (error) throw error;
        return data || [];
      }
    );

    res.json({ success: true, data: contacts });
  } catch (err: any) {
    console.error('[ContactAPI] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/contacts ────────────────────────────────────────────────
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const { data, error } = await supabase
      .from('contacts')
      .insert({ ...req.body, user_id: userId })
      .select()
      .single();

    if (error) throw error;

    await invalidateCache(cacheKey.contacts(userId));
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    console.error('[ContactAPI] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/v2/contacts/:id ───────────────────────────────────────────
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const contactId = req.params.id;
  try {
    const { error } = await supabase
      .from('contacts')
      .update(req.body)
      .eq('id', contactId)
      .eq('user_id', userId);

    if (error) throw error;

    await invalidateCache(cacheKey.contacts(userId));
    res.json({ success: true });
  } catch (err: any) {
    console.error('[ContactAPI] PATCH error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/v2/contacts/:id ──────────────────────────────────────────
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const contactId = req.params.id;
  try {
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contactId)
      .eq('user_id', userId);

    if (error) throw error;

    await invalidateCache(cacheKey.contacts(userId));
    res.json({ success: true });
  } catch (err: any) {
    console.error('[ContactAPI] DELETE error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/contacts/sync ──────────────────────────────────────────
router.post('/sync', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    console.log(`[ContactAPI] Triggering sync for userId: ${userId}`);
    const { agentService } = await import('../services/agentService.js');
    const result = await agentService.syncContactsFromThreads(userId);
    
    await invalidateCache(cacheKey.contacts(userId));
    res.json(result);
  } catch (err: any) {
    console.error('[ContactAPI] SYNC error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
