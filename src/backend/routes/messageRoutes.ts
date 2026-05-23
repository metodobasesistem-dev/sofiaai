import { Router, Response } from 'express';
import { sessionController } from '../controllers/sessionController.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { supabase } from '../lib/supabaseClient.js';

const router = Router();

router.use(requireAuth);

router.post('/send', sessionController.sendMessage);
router.post('/delete', sessionController.deleteMessage);
router.post('/react', sessionController.reactToMessage);

// PATCH /api/messages/threads/:threadId/agent
// Atualiza o agente de IA responsável por uma conversa.
// agent_id: UUID do agente, ou null para voltar ao padrão.
router.patch('/threads/:threadId/agent', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { threadId } = req.params;
    const { agent_id } = req.body as { agent_id: string | null };

    // 1. Valida que a thread pertence ao usuário
    const { data: thread, error: threadErr } = await supabase
      .from('threads').select('id, user_id').eq('id', threadId).maybeSingle();
    if (threadErr || !thread) return res.status(404).json({ success: false, error: 'Conversa não encontrada.' });
    if (thread.user_id !== userId) return res.status(403).json({ success: false, error: 'Acesso negado.' });

    // 2. Se agent_id foi informado, valida que pertence ao usuário
    if (agent_id) {
      const { data: agent } = await supabase
        .from('agents').select('id').eq('id', agent_id).eq('user_id', userId).maybeSingle();
      if (!agent) return res.status(400).json({ success: false, error: 'Agente não encontrado ou não pertence a você.' });
    }

    // 3. Atualiza
    const { error: updateErr } = await supabase
      .from('threads').update({ agent_id: agent_id ?? null }).eq('id', threadId);
    if (updateErr) throw updateErr;

    res.json({ success: true, agent_id: agent_id ?? null });
  } catch (err: any) {
    console.error('[MessageRoutes] Erro ao atualizar agente da thread:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
