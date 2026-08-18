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
import { getThreadId } from '../lib/phoneHelper.js';

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
          .order('ultima_interacao', { ascending: false, nullsFirst: false });

        if (error) throw error;
        return data || [];
      }
    );

    res.json({ success: true, data: contacts });
  } catch (err: any) {
    console.error('[ContactAPI] Error:', err.message);
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

// ─── GET /api/v2/contacts/profile-picture/:phone ──────────────────────────
router.get('/profile-picture/:phone', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const phone = req.params.phone;
  try {
    const { agentService } = await import('../services/agentService.js');
    const remoteJid = `${phone}@s.whatsapp.net`;
    
    // Resolve a thread pelo id exato ({userId}_{telefone normalizado}).
    // O ilike '%phone%' + maybeSingle anterior estourava (PGRST116) sempre que
    // dois números do tenant casavam pelo sufixo — e a foto nunca vinha.
    const threadId = getThreadId(userId, phone);
    let { data: thread } = await supabase
      .from('threads')
      .select('id')
      .eq('id', threadId)
      .maybeSingle();

    // Fallback para threads antigas cujo id não segue o formato normalizado.
    // limit(1) em vez de maybeSingle: múltiplos matches não podem virar erro.
    if (!thread) {
      const { data: fuzzy } = await supabase
        .from('threads')
        .select('id')
        .eq('user_id', userId)
        .ilike('remote_jid', `%${phone}%`)
        .limit(1);
      thread = fuzzy?.[0] || null;
    }

    if (thread) {
      // Sincroniza em background
      await agentService.syncProfilePicture(userId, thread.id, remoteJid);
      
      // Busca o resultado atualizado
      const { data: updated } = await supabase
        .from('threads')
        .select('profile_picture_url')
        .eq('id', thread.id)
        .single();
        
      return res.json({ success: true, url: updated?.profile_picture_url });
    }

    res.json({ success: false, error: 'Thread not found' });
  } catch (err: any) {
    console.error('[ContactAPI] Profile picture error:', err.message);
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
    
    // Invalida o cache após o sync para forçar recarregamento
    await invalidateCache(cacheKey.contacts(userId));
    
    res.json(result);
  } catch (err: any) {
    console.error('[ContactAPI] SYNC error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
