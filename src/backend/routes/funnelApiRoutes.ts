/**
 * Funnel API Routes — motivos de perda e a marcação de "Perdido".
 *
 * Marcar um lead como perdido é mais do que trocar o status: registra o
 * motivo, a observação e a data. Concentrar isso numa rota evita que o Kanban
 * e a conversa gravem o mesmo evento de formas diferentes.
 */
import { Router, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { invalidateCache, cacheKey } from '../lib/redisCache.js';

const router = Router();
router.use(requireAuth as any);

/** Valor de contacts.status_funil para um lead perdido. */
const ETAPA_PERDIDO = 'Perdido';

// ─── GET /api/v2/funnel/loss-reasons ──────────────────────────────────────
router.get('/loss-reasons', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('loss_reasons')
      .select('*')
      .eq('user_id', req.userId!)
      .order('ordem')
      .order('nome');
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error('[FunnelAPI] loss-reasons GET:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/funnel/loss-reasons ─────────────────────────────────────
router.post('/loss-reasons', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const nome = String(req.body?.nome || '').trim();
  if (!nome) return res.status(400).json({ success: false, error: 'Informe o motivo.' });

  try {
    const { count } = await supabase
      .from('loss_reasons')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { data, error } = await supabase
      .from('loss_reasons')
      .insert({ user_id: userId, nome, ordem: count || 0 })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, error: 'Esse motivo já existe.' });
      }
      throw error;
    }
    res.json({ success: true, data });
  } catch (err: any) {
    console.error('[FunnelAPI] loss-reasons POST:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/v2/funnel/loss-reasons/:id ───────────────────────────────
router.delete('/loss-reasons/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // O FK é ON DELETE SET NULL: quem foi perdido por este motivo mantém a
    // data e a observação, só perde o rótulo.
    const { error } = await supabase
      .from('loss_reasons')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId!);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error('[FunnelAPI] loss-reasons DELETE:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/funnel/mark-lost ────────────────────────────────────────
// Marca o lead como perdido registrando por quê.
router.post('/mark-lost', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { contactId, reasonId, note } = req.body || {};

  if (!contactId) return res.status(400).json({ success: false, error: 'Contato não informado.' });

  try {
    // Motivo precisa ser do próprio usuário — id de outro tenant não entra.
    let motivoValido: string | null = null;
    if (reasonId) {
      const { data: motivo } = await supabase
        .from('loss_reasons')
        .select('id')
        .eq('id', reasonId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!motivo) return res.status(400).json({ success: false, error: 'Motivo inválido.' });
      motivoValido = motivo.id;
    }

    const { error } = await supabase
      .from('contacts')
      .update({
        status_funil: ETAPA_PERDIDO,
        loss_reason_id: motivoValido,
        loss_note: note ? String(note).trim() : null,
        lost_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .eq('user_id', userId);

    if (error) throw error;

    await invalidateCache(cacheKey.contacts(userId)).catch(() => {});
    res.json({ success: true });
  } catch (err: any) {
    console.error('[FunnelAPI] mark-lost:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/funnel/reopen ───────────────────────────────────────────
// Tira o lead de "Perdido" e limpa o registro da perda.
router.post('/reopen', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { contactId, etapa } = req.body || {};
  if (!contactId) return res.status(400).json({ success: false, error: 'Contato não informado.' });

  try {
    const { error } = await supabase
      .from('contacts')
      .update({
        status_funil: etapa || 'Lead',
        loss_reason_id: null,
        loss_note: null,
        lost_at: null,
      })
      .eq('id', contactId)
      .eq('user_id', userId);
    if (error) throw error;

    await invalidateCache(cacheKey.contacts(userId)).catch(() => {});
    res.json({ success: true });
  } catch (err: any) {
    console.error('[FunnelAPI] reopen:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
