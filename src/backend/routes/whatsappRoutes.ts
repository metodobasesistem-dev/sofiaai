import { Router } from 'express';
import multer from 'multer';
import { whatsappService } from '../services/whatsappService.js';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { WhatsAppProviderFactory } from '../providers/WhatsAppProviderFactory.js';

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
    const result = await whatsappService.sendMedia(userId, remoteJid, mediaFile.buffer, mediaFile.mimetype, mediaFile.originalname, caption);
    if (!result?.success) {
      throw new Error(result?.error || 'Falha ao processar envio de mídia.');
    }
    res.json({ success: true, message: 'Mídia enviada com sucesso!', messageId: result.messageId, mediaUrl: result.mediaUrl });
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

/**
 * POST /api/whatsapp/threads/backfill-photos
 *
 * A sincronização automática de foto só dispara quando chega uma NOVA
 * mensagem inbound do contato — conversas antigas/importadas que nunca
 * receberam mensagem depois desse gatilho ficam com iniciais para sempre.
 * Esta rota enfileira o sync (via BullMQ, mesmo worker rate-limited de
 * /threads/refresh-photo) para todas as threads do usuário que nunca
 * tiveram sequer uma tentativa de busca (profile_picture_updated_at nulo).
 * Não sobrescreve threads já tentadas — essas respeitam o TTL normal do
 * worker para não martelar a Evolution API à toa.
 */
router.post('/threads/backfill-photos', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId!;

  try {
    const { data: threads, error } = await supabase
      .from('threads')
      .select('id, remote_jid')
      .eq('user_id', userId)
      .is('profile_picture_updated_at', null);

    if (error) throw error;

    for (const t of threads || []) {
      await whatsappService.enqueueProfilePictureSync({
        userId,
        threadId: t.id,
        remoteJid: t.remote_jid
      });
    }

    res.json({ success: true, enqueued: threads?.length || 0 });
  } catch (err: any) {
    console.error('[PhotoBackfill] Erro:', err);
    res.status(500).json({ error: 'Erro ao enfileirar sincronização de fotos' });
  }
});

router.post('/load-media', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId!;
  const { messageId } = req.body;

  if (!userId || !messageId) {
    return res.status(400).json({ error: 'Faltam parâmetros: messageId é obrigatório.' });
  }

  try {
    const { data: msg } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!msg) {
      return res.status(404).json({ error: 'Mensagem não encontrada.' });
    }

    // Se já tiver uma URL de mídia válida
    if (msg.media_url || msg.audio_url) {
      return res.json({ success: true, mediaUrl: msg.media_url || msg.audio_url });
    }

    if (!msg.whatsapp_id) {
      return res.status(400).json({ error: 'Mensagem sem identificador do WhatsApp.' });
    }

    const { data: prof } = await supabase.from('profiles').select('whatsapp_instance_id').eq('id', userId).single();
    const instanceName = prof?.whatsapp_instance_id || `wppai_${userId.substring(0, 8)}`;
    const provider = await WhatsAppProviderFactory.getProvider(userId);

    // Tenta obter a mídia da Evolution API
    let base64: string | null = null;
    if (typeof (provider as any).fetchMediaForMessage === 'function') {
      base64 = await (provider as any).fetchMediaForMessage(instanceName, msg.whatsapp_id);
    } else if (typeof (provider as any).getMediaBase64 === 'function') {
      base64 = await (provider as any).getMediaBase64(instanceName, { id: msg.whatsapp_id }, null);
    }

    if (!base64) {
      return res.status(404).json({ error: 'Não foi possível baixar a mídia dos servidores do WhatsApp. Ela pode ter expirado.' });
    }

    const buffer = Buffer.from(base64, 'base64');
    const ext = msg.media_mime_type?.split('/')[1]?.split(';')[0] || (msg.message_type === 'video' ? 'mp4' : 'bin');
    const filename = msg.media_filename || `media_${Date.now()}.${ext}`;

    const mediaUrl = await whatsappService.uploadToStorage(userId, buffer, filename);
    const resolvedUrl = mediaUrl || `data:${msg.media_mime_type || (msg.message_type === 'video' ? 'video/mp4' : 'image/jpeg')};base64,${base64}`;

    // Atualiza a mensagem no banco de dados para que os próximos acessos já tenham a mídia salva
    await supabase
      .from('messages')
      .update({ media_url: resolvedUrl, audio_url: msg.message_type === 'audio' ? resolvedUrl : msg.audio_url })
      .eq('id', messageId)
      .eq('user_id', userId);

    res.json({ success: true, mediaUrl: resolvedUrl });
  } catch (err: any) {
    console.error('[WhatsappRoutes] Erro ao carregar mídia:', err);
    res.status(500).json({ error: err.message || 'Erro ao carregar mídia.' });
  }
});

export default router;
