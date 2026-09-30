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

// ─── Origem do lead ───────────────────────────────────────────────────────
// As frases que identificam o canal, e a correção manual da origem.

// ─── GET /api/v2/contacts/origin-patterns ────────────────────────────────
router.get('/origin-patterns', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('lead_origin_patterns')
      .select('*')
      .eq('user_id', req.userId!)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error('[ContactAPI] origin-patterns GET:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/contacts/origin-patterns ───────────────────────────────
router.post('/origin-patterns', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const pattern = String(req.body?.pattern || '').trim();
  const source = String(req.body?.source || '').trim().toLowerCase();
  const campaignName = String(req.body?.campaign_name || '').trim();
  const description = String(req.body?.description || '').trim() || null;

  if (!pattern) return res.status(400).json({ success: false, error: 'Informe a frase.' });
  if (!source) return res.status(400).json({ success: false, error: 'Informe a origem.' });
  if (!campaignName) return res.status(400).json({ success: false, error: 'Informe o nome da campanha.' });

  // Frase curta demais casa mensagem que não devia: a comparação é substring,
  // e "oi" apareceria em quase tudo.
  if (pattern.length < 4) {
    return res.status(400).json({ success: false, error: 'A frase precisa ter ao menos 4 caracteres.' });
  }

  try {
    const { data, error } = await supabase
      .from('lead_origin_patterns')
      .insert({ user_id: userId, pattern, source, campaign_name: campaignName, description })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, error: 'Essa frase já está cadastrada.' });
      }
      throw error;
    }
    res.json({ success: true, data });
  } catch (err: any) {
    console.error('[ContactAPI] origin-patterns POST:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/v2/contacts/origin-patterns/:id ─────────────────────────
router.delete('/origin-patterns/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Apagar a frase não reclassifica quem já foi marcado por ela: a origem
    // gravada no contato é um fato do passado.
    const { error } = await supabase
      .from('lead_origin_patterns')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId!);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error('[ContactAPI] origin-patterns DELETE:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/v2/contacts/:id/origin ───────────────────────────────────
// Correção manual. Trava a origem: nenhum detector sobrescreve depois disso.
router.patch('/:id/origin', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const source = String(req.body?.source || '').trim().toLowerCase();
  if (!source) return res.status(400).json({ success: false, error: 'Informe a origem.' });

  try {
    const { data, error } = await supabase
      .from('contacts')
      .update({
        source,
        origin_locked: true,
        ad_tracking: {
          source: req.body?.label || source,
          type: 'manual',
          headline: req.body?.campaign_name || null,
          captured_at: new Date().toISOString(),
        },
      })
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    await invalidateCache(cacheKey.contacts(userId));
    res.json({ success: true, data });
  } catch (err: any) {
    console.error('[ContactAPI] origin PATCH:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
