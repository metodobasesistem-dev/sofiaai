/**
 * Modelos de follow-up — mensagens prontas para envio programado.
 *
 * Separado de quick_replies de propósito: resposta rápida é digitada pelo
 * atendente na conversa; modelo de follow-up é enviado pelo sistema, sem
 * ninguém na frente. Daí `ativo` e `ordem`, que a outra não tem.
 */
import { Router, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';

/**
 * Envios automáticos que podem usar um modelo. Nulo = só envio manual.
 *
 * Um gatilho desconhecido é recusado em vez de gravado: a coluna existe para
 * o backend PROCURAR por ela, e um valor com erro de digitação viraria um
 * modelo que nunca é usado, sem erro nenhum aparecer.
 */
const GATILHOS = ['lembrete_consulta'];

/**
 * O 23505 pode vir de dois lugares: o nome único por clínica, ou o índice
 * parcial que garante um modelo só por gatilho. Dizer sempre "nome duplicado"
 * mandaria o usuário renomear um modelo que estava com o nome certo.
 */
function mensagemDeDuplicado(error: any): string {
  return String(error?.message || '').includes('gatilho')
    ? 'Já existe um modelo usado nesse envio automático. Desmarque o outro primeiro.'
    : 'Já existe um modelo com esse nome.';
}

const router = Router();
router.use(requireAuth as any);

// ─── GET /api/v2/follow-up-templates ─────────────────────────────────────
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('follow_up_templates')
      .select('*')
      .eq('user_id', req.userId!)
      .order('ordem')
      .order('created_at');
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error('[FollowUpTemplateAPI] GET:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/follow-up-templates ────────────────────────────────────
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const nome = String(req.body?.nome || '').trim();
  const conteudo = String(req.body?.conteudo || '').trim();

  if (!nome) return res.status(400).json({ success: false, error: 'Dê um nome ao modelo.' });
  if (!conteudo) return res.status(400).json({ success: false, error: 'Escreva a mensagem.' });

  const gatilho = req.body?.gatilho ? String(req.body.gatilho).trim() : null;
  if (gatilho && !GATILHOS.includes(gatilho)) {
    return res.status(400).json({ success: false, error: 'Gatilho desconhecido.' });
  }

  try {
    const { count } = await supabase
      .from('follow_up_templates')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { data, error } = await supabase
      .from('follow_up_templates')
      .insert({ user_id: userId, nome, conteudo, gatilho, ordem: count || 0 })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, error: mensagemDeDuplicado(error) });
      }
      throw error;
    }
    res.json({ success: true, data });
  } catch (err: any) {
    console.error('[FollowUpTemplateAPI] POST:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/v2/follow-up-templates/:id ───────────────────────────────
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const payload: Record<string, any> = {};
  if (typeof req.body?.nome === 'string' && req.body.nome.trim()) payload.nome = req.body.nome.trim();
  if (typeof req.body?.conteudo === 'string' && req.body.conteudo.trim()) payload.conteudo = req.body.conteudo.trim();
  if (typeof req.body?.ativo === 'boolean') payload.ativo = req.body.ativo;
  if (typeof req.body?.ordem === 'number') payload.ordem = req.body.ordem;
  if ('gatilho' in (req.body || {})) {
    const g = req.body.gatilho ? String(req.body.gatilho).trim() : null;
    if (g && !GATILHOS.includes(g)) {
      return res.status(400).json({ success: false, error: 'Gatilho desconhecido.' });
    }
    payload.gatilho = g;
  }

  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ success: false, error: 'Nada para atualizar.' });
  }

  try {
    const { error } = await supabase
      .from('follow_up_templates')
      .update(payload)
      .eq('id', req.params.id)
      .eq('user_id', req.userId!);
    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, error: mensagemDeDuplicado(error) });
      }
      throw error;
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('[FollowUpTemplateAPI] PATCH:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /api/v2/follow-up-templates/ordem ───────────────────────────────
// Reordenação por arrastar: a lista inteira chega na ordem nova.
router.put('/ordem', async (req: AuthenticatedRequest, res: Response) => {
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (ids.length === 0) return res.status(400).json({ success: false, error: 'Informe a nova ordem.' });

  try {
    // Um update por linha, todos travados no user_id: um id de outro inquilino
    // na lista não encontra linha e não faz nada.
    await Promise.all(
      ids.map((id, i) =>
        supabase
          .from('follow_up_templates')
          .update({ ordem: i })
          .eq('id', id)
          .eq('user_id', req.userId!)
      )
    );
    res.json({ success: true });
  } catch (err: any) {
    console.error('[FollowUpTemplateAPI] ordem PUT:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/v2/follow-up-templates/:id ──────────────────────────────
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { error } = await supabase
      .from('follow_up_templates')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId!);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error('[FollowUpTemplateAPI] DELETE:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
