import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { whatsappService } from '../services/whatsappService.js';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { WhatsAppProviderFactory } from '../providers/WhatsAppProviderFactory.js';
import { EvolutionApiService } from '../services/evolutionApiService.js';
import { normalizePhone, variantesDoTelefone } from '../lib/phoneHelper.js';

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

/**
 * POST /api/whatsapp/check-number
 *
 * Antes de abrir uma conversa nova a partir de um número digitado:
 *   1. confere se o número tem WhatsApp (Evolution /chat/whatsappNumbers);
 *   2. confere se já existe histórico com ele na nossa base (threads,
 *      mensagens e disparos de campanha), considerando com e sem o 9º dígito.
 * Evita mandar mensagem para número inexistente ou para quem já foi abordado.
 */
router.post('/check-number', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId!;
  const phone = normalizePhone(String(req.body?.phone || ''));

  if (!phone || phone.length < 10 || phone.length > 15) {
    return res.status(400).json({ success: false, error: 'Número inválido. Informe DDD + número (ex.: 32 99999-9999).' });
  }

  try {
    const variantes = variantesDoTelefone(phone);

    // ── 1. Existe no WhatsApp? ───────────────────────────────────────────
    const { data: prof } = await supabase
      .from('profiles')
      .select('whatsapp_instance_id')
      .eq('id', userId)
      .maybeSingle();
    const instanceName = prof?.whatsapp_instance_id || `wppai_${userId.substring(0, 8)}`;

    let whatsappExists: boolean | null = null;
    let jid: string | null = null;
    try {
      const results = await EvolutionApiService.checkWhatsappNumbersStrict(instanceName, variantes);
      const found = results.find(r => r.exists);
      whatsappExists = !!found;
      jid = found?.jid || (found ? `${found.number}@s.whatsapp.net` : null);
    } catch (err: any) {
      console.warn('[CheckNumber] Falha ao consultar WhatsApp:', err?.response?.data || err?.message);
      whatsappExists = null; // não foi possível verificar
    }

    // O número "oficial" é o que o WhatsApp devolveu (pode vir sem o 9).
    const numeroFinal = jid ? normalizePhone(jid) : phone;
    const todasVariantes = Array.from(new Set([...variantes, ...variantesDoTelefone(numeroFinal)]));
    const threadIds = todasVariantes.map(v => `${userId}_${v}`);

    // ── 2. Histórico na nossa base ───────────────────────────────────────
    const [{ data: threads }, { data: contatos }] = await Promise.all([
      supabase
        .from('threads')
        .select('id, contact_name, last_message, last_message_time, remote_jid')
        .eq('user_id', userId)
        .in('id', threadIds),
      supabase
        .from('contacts')
        .select('id, nome, is_client')
        .eq('user_id', userId)
        .in('id', threadIds),
    ]);

    const thread = threads?.[0] || null;
    let totalMensagens = 0;
    let enviadas = 0;
    if (threads?.length) {
      const ids = threads.map(t => t.id);
      const [{ count: total }, { count: out }] = await Promise.all([
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('thread_id', ids),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('thread_id', ids).eq('direction', 'outbound'),
      ]);
      totalMensagens = total || 0;
      enviadas = out || 0;
    }

    let disparosCampanha = 0;
    if (contatos?.length) {
      const { count } = await supabase
        .from('campaign_logs')
        .select('id', { count: 'exact', head: true })
        .in('contact_id', contatos.map(c => c.id))
        .in('status', ['sent', 'success']);
      disparosCampanha = count || 0;
    }

    const contato = contatos?.[0] || null;
    const jaContatado = totalMensagens > 0 || disparosCampanha > 0;

    res.json({
      success: true,
      phone: numeroFinal,
      jid: jid || `${numeroFinal}@s.whatsapp.net`,
      whatsappExists,
      history: {
        hasHistory: jaContatado,
        threadId: thread?.id || null,
        contactName: contato?.nome || thread?.contact_name || null,
        isClient: !!contato?.is_client,
        totalMessages: totalMensagens,
        sentMessages: enviadas,
        campaignSends: disparosCampanha,
        lastMessage: thread?.last_message || null,
        lastMessageAt: thread?.last_message_time || null,
      },
    });
  } catch (err: any) {
    console.error('[CheckNumber] Erro:', err);
    res.status(500).json({ success: false, error: err.message || 'Erro ao verificar número' });
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
    const existingUrl = msg.media_url || msg.audio_url;
    if (existingUrl) {
      if (existingUrl.includes('/uploads/')) {
        const filename = path.basename(existingUrl);
        const uploadsDir = path.join(process.cwd(), 'uploads');
        const filePath = path.join(uploadsDir, filename);
        if (fs.existsSync(filePath)) {
          return res.json({ success: true, mediaUrl: existingUrl });
        }
        console.warn(`[WhatsappRoutes] ⚠️ Arquivo local ${filename} não existe no disco (perda pós-deploy). Buscando novamente da Evolution API...`);
      } else {
        return res.json({ success: true, mediaUrl: existingUrl });
      }
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
