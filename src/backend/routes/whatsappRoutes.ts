import { Router } from 'express';
import multer from 'multer';
import { whatsappService } from '../services/whatsappService.js';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Secure all routes in this router
router.use(requireAuth);

router.post('/send-voice', upload.single('audio'), async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId!;
  const { remoteJid } = req.body;
  const audioFile = req.file;

  if (!remoteJid || !audioFile) {
    return res.status(400).json({ error: 'Faltam parâmetros: remoteJid e audio são necessários.' });
  }

  try {
    console.log(`[WhatsappRoutes] 🎙️ Recebido pedido de envio de voz para ${remoteJid} (User: ${userId})`);
    await whatsappService.sendVoice(userId, remoteJid, audioFile.buffer);
    res.json({ success: true, message: 'Áudio enviado com sucesso!' });
  } catch (err: any) {
    console.error('[WhatsappRoutes] Erro ao enviar áudio:', err);
    res.status(500).json({ error: err.message || 'Erro interno ao enviar áudio.' });
  }
});

router.post('/send-media', upload.single('media'), async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId!;
  const { remoteJid, caption } = req.body;
  const mediaFile = req.file;

  if (!remoteJid || !mediaFile) {
    return res.status(400).json({ error: 'Faltam parâmetros: remoteJid e media são necessários.' });
  }

  try {
    console.log(`[WhatsappRoutes] 📎 Recebido pedido de envio de mídia para ${remoteJid} (User: ${userId})`);
    await whatsappService.sendMedia(userId, remoteJid, mediaFile.buffer, mediaFile.mimetype, mediaFile.originalname, caption);
    res.json({ success: true, message: 'Mídia enviada com sucesso!' });
  } catch (err: any) {
    console.error('[WhatsappRoutes] Erro ao enviar mídia:', err);
    res.status(500).json({ error: err.message || 'Erro interno ao enviar mídia.' });
  }
});

router.post('/sync', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId!;
  try {
    const result = await whatsappService.syncInstance(userId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/followup/manual', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId!;
  const { remoteJid, message, delayMinutes, isAi } = req.body;
  
  if (!remoteJid || delayMinutes === undefined) {
    return res.status(400).json({ error: 'Parâmetros remoteJid e delayMinutes são obrigatórios.' });
  }

  try {
    await whatsappService.scheduleManualFollowUp(userId, remoteJid, message, delayMinutes, isAi);
    res.json({ success: true, message: 'Follow-up agendado com sucesso!' });
  } catch (err: any) {
    console.error('[WhatsappRoutes] Erro ao agendar follow-up manual:', err);
    res.status(500).json({ error: err.message || 'Erro ao agendar follow-up.' });
  }
});

/**
 * POST /api/whatsapp/threads/refresh-photo
 *
 * Chamado pelo frontend quando uma foto de perfil falha ao carregar (onError).
 * Invalida o cache imediatamente e tenta buscar uma URL nova em background.
 * A atualização do banco dispara o Supabase Realtime, que notifica o frontend
 * com a nova URL (ou null, mostrando as iniciais enquanto o fetch não conclui).
 */
router.post('/threads/refresh-photo', async (req, res) => {
  const { threadId } = req.body;
  const userId = (req as AuthenticatedRequest).userId!;

  if (!threadId) {
    return res.status(400).json({ error: 'threadId é obrigatório' });
  }

  try {
    // Verifica que a thread pertence ao usuário autenticado (segurança multi-tenant)
    const { data: thread } = await supabase
      .from('threads')
      .select('id, remote_jid')
      .eq('id', threadId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!thread) {
      return res.status(404).json({ error: 'Thread não encontrada' });
    }

    // 1. Invalida a URL expirada imediatamente — Realtime notifica o frontend com null,
    //    ContactAvatar exibe iniciais enquanto o worker busca a nova URL.
    await supabase
      .from('threads')
      .update({ profile_picture_url: null, profile_picture_updated_at: null })
      .eq('id', threadId);

    // 2. Enfileira busca com force=true (ignora TTL) via BullMQ.
    await whatsappService.enqueueProfilePictureSync({
      userId: userId!,
      threadId,
      remoteJid: thread.remote_jid,
      force: true
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('[PhotoRefresh] Erro:', err);
    res.status(500).json({ error: 'Erro ao processar refresh de foto' });
  }
});

export default router;
