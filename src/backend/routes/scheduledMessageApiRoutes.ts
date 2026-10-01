/**
 * Mensagens programadas — o atendente escolhe o texto e a hora.
 *
 * O texto chega daqui já renderizado: quem agenda viu a prévia, e é ela que
 * precisa chegar ao paciente.
 */
import { Router, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { normalizePhone } from '../lib/phoneHelper.js';

const router = Router();
router.use(requireAuth as any);

// ─── GET /api/v2/scheduled-messages?threadId=... ─────────────────────────
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const threadId = String(req.query.threadId || '').trim();
  try {
    let q = supabase
      .from('scheduled_messages')
      .select('*')
      .eq('user_id', req.userId!)
      .order('enviar_em');

    if (threadId) q = q.eq('thread_id', threadId);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error('[ScheduledMessageAPI] GET:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/scheduled-messages ─────────────────────────────────────
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const threadId = String(req.body?.thread_id || '').trim();
  const conteudo = String(req.body?.conteudo || '').trim();
  const enviarEm = String(req.body?.enviar_em || '').trim();
  const templateId = req.body?.template_id || null;

  if (!threadId) return res.status(400).json({ success: false, error: 'Conversa não identificada.' });
  if (!conteudo) return res.status(400).json({ success: false, error: 'Escreva a mensagem.' });
  if (!enviarEm) return res.status(400).json({ success: false, error: 'Escolha quando enviar.' });

  const quando = new Date(enviarEm);
  if (Number.isNaN(quando.getTime())) {
    return res.status(400).json({ success: false, error: 'Data e hora inválidas.' });
  }
  // Um minuto de folga: o relógio do navegador e o do servidor não batem
  // exatamente, e recusar "agora" por segundos de diferença só confunde.
  if (quando.getTime() < Date.now() - 60_000) {
    return res.status(400).json({ success: false, error: 'Escolha um horário no futuro.' });
  }

  // O telefone sai do próprio thread_id ({userId}_{telefone}), e não do corpo:
  // aceitar um telefone do cliente deixaria agendar mensagem para qualquer
  // número usando a sessão de quem está logado.
  const telefone = normalizePhone(threadId.split('_').slice(1).join('_'));
  if (!telefone) {
    return res.status(400).json({ success: false, error: 'Conversa sem telefone válido.' });
  }

  try {
    const { data, error } = await supabase
      .from('scheduled_messages')
      .insert({
        user_id: userId,
        thread_id: threadId,
        telefone,
        conteudo,
        enviar_em: quando.toISOString(),
        template_id: templateId,
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    console.error('[ScheduledMessageAPI] POST:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/v2/scheduled-messages/:id ───────────────────────────────
// Cancela. Só o que ainda não saiu: uma mensagem já enviada não volta, e
// apagar o registro dela esconderia do atendente que o paciente a recebeu.
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('scheduled_messages')
      .update({ status: 'cancelada' })
      .eq('id', req.params.id)
      .eq('user_id', req.userId!)
      .eq('status', 'pendente')
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(400).json({ success: false, error: 'Essa mensagem já saiu ou já foi cancelada.' });
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('[ScheduledMessageAPI] DELETE:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
