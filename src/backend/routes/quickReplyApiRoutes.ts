/**
 * Quick Reply API Routes — Backend proxy for quick_replies table.
 *
 * Uses service role key to bypass RLS.
 * JWT auth middleware ensures privacy.
 */
import { Router, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';

const router = Router();

// All routes require a valid Supabase JWT
router.use(requireAuth as any);

// ─── GET /api/v2/quick-replies ───────────────────────────────────────────
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const { data, error } = await supabase
      .from('quick_replies')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error('[QuickReplyAPI] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/quick-replies ──────────────────────────────────────────
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, error: 'Title and content are required' });
    }

    const { data, error } = await supabase
      .from('quick_replies')
      .insert({
        user_id: userId,
        title,
        content
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    console.error('[QuickReplyAPI] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/v2/quick-replies/:id ─────────────────────────────────────
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const replyId = req.params.id;
  try {
    const { error } = await supabase
      .from('quick_replies')
      .delete()
      .eq('id', replyId)
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error('[QuickReplyAPI] DELETE error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
