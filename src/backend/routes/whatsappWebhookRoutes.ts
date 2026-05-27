import { Router } from 'express';
import crypto from 'crypto';
import { agentService } from '../services/agentService.js';
import { whatsappService } from '../services/whatsappService.js';
import { supabase } from '../lib/supabaseClient.js';
import { transcribeAudio } from '../services/aiService.js';
import { WhatsAppProviderFactory } from '../providers/WhatsAppProviderFactory.js';
import { normalizePhone } from '../lib/phoneHelper.js';


const router = Router();

/**
 * SEC-02: Valida token de segurança do webhook da Evolution API.
 * A Evolution API não suporta assinatura HMAC nativamente.
 * A proteção é feita via token secreto na URL do webhook:
 *   https://sua-url.com/api/whatsapp/evolution/webhook?token=SEU_TOKEN_SECRETO
 *
 * Configure EVOLUTION_WEBHOOK_SECRET = SEU_TOKEN_SECRETO no .env.
 * Se não configurado, aceita sem validação (modo compatibilidade).
 */
function validateEvolutionToken(tokenFromQuery: string | undefined): boolean {
  const secret = (process.env.EVOLUTION_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    // Modo compatibilidade: sem secret configurado, aceita tudo
    return true;
  }
  const tokenTrimmed = (tokenFromQuery || '').trim();
  if (!tokenTrimmed) {
    console.warn('[Webhook] ⚠️ Token ausente na URL. Webhook rejeitado.');
    return false;
  }
  // Comparação timing-safe para evitar timing attacks
  try {
    const bufA = Buffer.from(tokenTrimmed);
    const bufB = Buffer.from(secret);
    // timingSafeEqual exige buffers do mesmo tamanho
    if (bufA.length !== bufB.length) {
      console.warn(`[Webhook] ⚠️ Token diverge: URL=${bufA.length} chars | ENV=${bufB.length} chars. Verifique EVOLUTION_WEBHOOK_SECRET no Coolify.`);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

router.post('/webhook', async (req, res) => {
  const body = req.body;
  // [DIAG] Log de chegada do webhook ANTES de qualquer validação
  console.log(`[Webhook] 📨 Received: event=${body?.event} instance=${body?.instance || body?.instanceName} | bodySize=${JSON.stringify(body || {}).length}`);

  // Identificador comum de instância (necessário para achar o dono)
  const instanceName = body.instance || body.instanceName || (body.data?.instance) || (body.data?.instanceName);
  const event = body.event;

  if (!instanceName) {
    console.warn(`[Webhook] ⚠️ Received webhook without instanceName. Event: ${event}`);
    return res.status(200).send('OK');
  }

  // [SEC-02] Validar token secreto da URL do webhook
  const token = req.query.token as string | undefined;
  if (!validateEvolutionToken(token)) {
    console.warn(`[Webhook] ❌ Token inválido ou ausente. Instance: ${instanceName}. Rejeitando.`);
    return res.status(403).send('Forbidden');
  }

  // [IDEMPOTENCY] Evitar processar o mesmo evento/mensagem múltiplas vezes (webhook duplicate)
  const eventId = body.data?.key?.id || 
                  body.data?.id || 
                  body.data?.messages?.[0]?.key?.id || 
                  body.message?.key?.id || 
                  body.id;

  if (eventId && (event === 'messages.upsert' || event === 'MESSAGES_UPSERT')) {
    const isNew = await (whatsappService as any).markEventAsProcessed(`webhook:${eventId}`, 300); // 5 min lock
    if (!isNew) {
      console.log(`[Webhook] 🛡️ Skipping duplicate webhook event: ${eventId}`);
      return res.status(200).send('OK');
    }
  }

  try {
    // 1. Resolve o usuário pelo whatsapp_instance_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('whatsapp_instance_id', instanceName)
      .single();

    if (!profile) {
      console.warn(`[Webhook] ⚠️ No profile found for instanceName: "${instanceName}". Webhook ignored.`);
      return res.status(200).send('OK');
    }
    const userId = profile.id;

    // 2. Obtém o Provider Abstraído
    const provider = await WhatsAppProviderFactory.getProvider(userId);

    const normalizedEvent = (event || '').toUpperCase().replace(/\./g, '_');

    // 3. [STATUS] Atualiza status de entrega/leitura das mensagens (✓ → ✓✓ → ✓✓ azul)
    if (normalizedEvent === 'MESSAGES_UPDATE') {
      await handleMessageStatusUpdate(userId, body.data);
      return res.status(200).send('OK');
    }

    // 4. Traduz o payload proprietário para o formato universal
    const message = provider.transformPayload(body);

    // 5. Processa se for uma mensagem válida
    if (message) {
      await handleStandardizedMessage(userId, instanceName, message, provider);
    }

    // 6. Tratamento de Eventos de Conexão
    if (normalizedEvent === 'CONNECTION_UPDATE') {
      await handleConnectionUpdate(userId, body.data);
    } else if (normalizedEvent === 'QRCODE_UPDATED') {
      await handleQrUpdate(userId, body.data);
    }

  } catch (error) {
    console.error(`[WhatsappWebhook] Error processing webhook:`, error);
  }

  res.status(200).send('OK');
});

async function handleStandardizedMessage(userId: string, instanceName: string, message: any, provider: any) {
  const { from, body, contactName, id: messageId, fromMe, type, caption, fileName, mimeType, quotedId, quotedText, contactJid, raw } = message;
  
  // Filtro de Tipos Não Suportados/Técnicos
  const tiposParaIgnorar = ['pollUpdateMessage', 'protocolMessage'];
  if (tiposParaIgnorar.includes(type)) {
    console.log(`[Webhook] 🔇 Ignoring technical message type: ${type} from ${from}`);
    return;
  }

  if (type === 'reaction') {
    const { reaction, reactionTargetId } = message;
    if (reactionTargetId) {
      await agentService.updateMessageReaction(userId, reactionTargetId, reaction || '');
    }
    return;
  }

  if (from.includes('@g.us')) return; // Ignore groups for now

  const cleanPhone = normalizePhone(from);
  let threadId = `${userId}_${cleanPhone}`;

  // ── Deduplicação do 9º dígito brasileiro ──────────────────────────────────
  // A Evolution às vezes entrega o mesmo número com e sem o 9º dígito:
  //   outbound para 553288996173 (12 dig) → inbound de 5532988996173 (13 dig)
  // Isso cria dois threads para o mesmo contato. Antes de processar, verifica
  // se já existe um thread para a versão alternativa do número e usa esse ID.
  if (cleanPhone.startsWith('55') && (cleanPhone.length === 12 || cleanPhone.length === 13)) {
    const ddd = cleanPhone.slice(2, 4);   // ex: "32"
    const rest = cleanPhone.slice(4);      // restante após DDD
    let altPhone = '';
    if (cleanPhone.length === 13 && rest.startsWith('9')) {
      altPhone = '55' + ddd + rest.slice(1); // 13→12: remove o 9
    } else if (cleanPhone.length === 12) {
      altPhone = '55' + ddd + '9' + rest;   // 12→13: adiciona o 9
    }
    if (altPhone) {
      const altThreadId = `${userId}_${altPhone}`;
      const { data: altThread } = await supabase.from('threads').select('id').eq('id', altThreadId).maybeSingle();
      if (altThread) {
        threadId = altThreadId;
        console.log(`[Webhook] 🔀 9º dígito dedup: roteando ${cleanPhone} → ${altPhone}`);
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // If it's fromMe, it was sent from the phone (or system echo)
  if (fromMe) {
    // Check if it's already in the DB (sent by system)
    // Usamos select count para ser rápido. A constraint UNIQUE no banco é o fallback final.
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('whatsapp_id', messageId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      console.log(`[Webhook] 🔄 Message ${messageId} already exists (echo). Skipping.`);
      return; 
    }
  }

  // INBOUND OR OUTBOUND FROM PHONE
  console.log(`[Webhook] 📥 Processing message: ${messageId} | Type: ${type} | fromMe: ${fromMe}`);

  // Handle Media Asynchronously
  if (type !== 'text' && type !== 'unknown') {
    handleMediaMessage(userId, instanceName, threadId, message, provider, fromMe ? 'outbound' : 'inbound').catch(err => {
      console.error(`[Webhook] Error handling media message:`, err);
    });
    return;
  }

  // Persist Text and Trigger AI (only if inbound)
  try {
    // 3. Rastreamento de Anúncios (Click-to-WhatsApp)
    const referral = raw?.message?.referral;
    if (referral) {
      console.log(`[Webhook] 🎯 Ad Referral detected for ${from}:`, referral.headline);
      await agentService.updateContactTracking(userId, cleanPhone, {
        source: 'Meta Ads',
        type: referral.sourceType,
        sourceId: referral.sourceId,
        sourceUrl: referral.sourceUrl,
        headline: referral.headline,
        body: referral.body,
        mediaUrl: referral.imageUrl || referral.videoUrl
      }).catch(err => console.error('[Webhook] Error updating tracking:', err));
    }

    // 1. PRIMEIRO PERSISTE (Bug 1: Garante ordem e sucesso)
    await agentService.persistMessage(threadId, userId, body, fromMe ? 'outbound' : 'inbound', messageId, contactName, from, cleanPhone, fromMe ? 'Atendente' : undefined, undefined, undefined, type, undefined, undefined, undefined, undefined, fromMe, quotedId, quotedText, contactJid);

    // 2. SÓ DISPARA SE PERSISTIU (ou se for outbound do telefone, não dispara IA)
    if (!fromMe) {
      const { data: threadRow } = await supabase.from('threads').select('agent_id').eq('id', threadId).maybeSingle();
      await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, body, contactName, cleanPhone, messageId, false, undefined, undefined, threadRow?.agent_id ?? null);
    }

    // 3. [FOTO] Enfileira sync de foto de perfil via BullMQ (deduplica por threadId, TTL controlado no worker)
    if (!fromMe) {
      await whatsappService.enqueueProfilePictureSync({ userId, threadId, remoteJid: from });
    }
  } catch (err: any) {
    // Log detalhado conforme solicitado no Bug 1
    console.error(`[Webhook] ❌ PERSISTENCE FAILED for message ${messageId} | User: ${userId} | Jid: ${from} | Type: ${type} | Error:`, err.message || err);
    // Não dispara a IA se a persistência falhou
  }
}

async function handleMediaMessage(userId: string, instanceName: string, threadId: string, message: any, provider: any, direction: 'inbound' | 'outbound' = 'inbound') {
  const { from, body, contactName, id: messageId, type, caption, fileName, mimeType, quotedId, quotedText, contactJid, raw, mediaBase64: webhookBase64 } = message;
  const cleanPhone = normalizePhone(from);
  const isExternal = direction === 'outbound';

  console.log(`[Webhook] 📥 Downloading media for ${direction} message: ${messageId} (${type})`);

  try {
    // Se o webhook já trouxer o base64 (Webhook Base64 habilitado na Evolution), usa direto
    let base64 = webhookBase64 || null;

    // Caso contrário, tenta baixar via API com até 3 tentativas e delays crescentes
    if (!base64) {
      const delays = [0, 2000, 5000];
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt] > 0) {
          console.log(`[Webhook] ⏳ Retry ${attempt}/${delays.length - 1} for media ${messageId} (aguardando ${delays[attempt]}ms)`);
          await new Promise(r => setTimeout(r, delays[attempt]));
        }
        base64 = await provider.getMediaBase64(instanceName, raw?.key, raw?.message);
        if (base64) break;
      }
    }

    if (!base64) {
      console.warn(`[Webhook] ⚠️ Could not get base64 after retries for message: ${messageId} (${type})`);
      await agentService.persistMessage(threadId, userId, body, direction, messageId, contactName, from, cleanPhone, isExternal ? 'Atendente' : undefined, undefined, undefined, type, undefined, mimeType, fileName, caption, isExternal, quotedId, quotedText, contactJid);
      return;
    }

    const buffer = Buffer.from(base64, 'base64');
    const ext = mimeType?.split('/')[1]?.split(';')[0] || 'bin';
    const storagePath = `${type}s/${Date.now()}_${fileName || `file.${ext}`}`;
    
    // Upload to Storage
    const mediaUrl = await (whatsappService as any).uploadToStorage(userId, buffer, storagePath);
    
    let processedText = body;
    let transcription = undefined;

    if (type === 'audio') {
      console.log(`[Webhook] 🎙️ Transcribing audio: ${messageId}`);
      transcription = await transcribeAudio(buffer, `audio_${Date.now()}.ogg`);
      if (transcription) {
        processedText = `[Áudio]: ${transcription}`;
      }
    }

    // Persist enriched message
    await agentService.persistMessage(
      threadId, userId, processedText, direction, messageId, contactName, from, cleanPhone, 
      isExternal ? 'Atendente' : undefined, undefined, mediaUrl, type, mediaUrl, mimeType, fileName, caption, isExternal, quotedId, quotedText, contactJid
    );

    // Trigger AI only if inbound
    if (direction === 'inbound') {
      const { data: threadRow } = await supabase.from('threads').select('agent_id').eq('id', threadId).maybeSingle();
      const threadAgentId = threadRow?.agent_id ?? null;
      if (type === 'audio' && transcription) {
        await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, transcription, contactName, cleanPhone, messageId, true, undefined, undefined, threadAgentId);
      } else if (type === 'image' || type === 'video') {
        await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, caption || (type === 'image' ? '[Imagem]' : '[Vídeo]'), contactName, cleanPhone, messageId, false, mediaUrl, mimeType, threadAgentId);
      } else if (type === 'document') {
        await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, `[Documento recebido: ${fileName || 'arquivo'}]`, contactName, cleanPhone, messageId, false, undefined, undefined, threadAgentId);
      }
    }
  } catch (err) {
    console.error(`[Webhook] Failed to process media message ${messageId}:`, err);
    // Fallback persist without media URL if failed
    await agentService.persistMessage(threadId, userId, body, direction, messageId, contactName, from, cleanPhone, isExternal ? 'Atendente' : undefined, undefined, undefined, type, undefined, mimeType, fileName, caption, isExternal, quotedId, quotedText, contactJid);
  }
}

/**
 * Processa eventos MESSAGES_UPDATE da Evolution API.
 * Esses eventos chegam quando o WhatsApp confirma entrega/leitura de uma mensagem.
 * 
 * Status mapping da Evolution API:
 *   PENDING   → pending   (na fila do WhatsApp)
 *   SERVER_ACK → sent     (servidor do WhatsApp recebeu)
 *   DELIVERY_ACK → delivered (celular do destinatário recebeu)
 *   READ      → read      (destinatário visualizou — tique azul)
 *   PLAYED    → read      (áudio ouvido)
 */
async function handleMessageStatusUpdate(userId: string, data: any) {
  try {
    // A Evolution pode mandar um array ou objeto único
    const updates = Array.isArray(data) ? data : [data];

    for (const update of updates) {
      const msgId = update?.key?.id || update?.id;
      const rawStatus = (update?.update?.status || update?.status || '').toUpperCase();
      
      if (!msgId || !rawStatus) continue;

      // Só processa mensagens enviadas por nós (fromMe)
      const fromMe = update?.key?.fromMe === true;
      if (!fromMe) continue;

      // Mapeamento de status da Evolution para o nosso banco
      const statusMap: Record<string, string> = {
        'PENDING':       'pending',
        'SERVER_ACK':    'sent',
        'DELIVERY_ACK':  'delivered',
        'READ':          'read',
        'PLAYED':        'read'  // áudio ouvido = lido
      };

      const mappedStatus = statusMap[rawStatus];
      if (!mappedStatus) continue;

      // Hierarquia de progressao — eventos podem chegar fora de ordem.
      // pending=0, sent=1, delivered=2, read=3. Nunca regredir.
      const RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 };
      const { data: current } = await supabase
        .from('messages')
        .select('status')
        .eq('whatsapp_id', msgId)
        .eq('user_id', userId)
        .maybeSingle();

      const currentRank = RANK[current?.status as string] ?? -1;
      const newRank = RANK[mappedStatus] ?? -1;

      if (newRank <= currentRank) {
        console.log(`[Webhook] ⏭️ Ignored regressive status: ${msgId} ${current?.status} → ${mappedStatus}`);
        continue;
      }

      console.log(`[Webhook] 📬 Status update: ${msgId} → ${mappedStatus}`);

      await supabase
        .from('messages')
        .update({ status: mappedStatus })
        .eq('whatsapp_id', msgId)
        .eq('user_id', userId);
    }
  } catch (err) {
    console.error('[Webhook] Error processing message status update:', err);
  }
}

async function handleConnectionUpdate(userId: string, data: any) {
  const state = data.state; // "open", "connecting", "close"
  console.log(`[Webhook] 🔄 Connection update for ${userId}: ${state}`);
  
  let dbStatus = 'disconnected';
  if (state === 'open') dbStatus = 'connected';
  else if (state === 'connecting') dbStatus = 'connecting';

  await supabase
    .from('profiles')
    .update({ 
      whatsapp_status: dbStatus,
      updated_at: new Date().toISOString(),
      ...(dbStatus === 'connected' ? { whatsapp_qr: null } : {})
    })
    .eq('id', userId);
}

async function handleQrUpdate(userId: string, data: any) {
  const qr = data.qrcode?.base64 || data.base64;
  if (!qr) return;

  console.log(`[Webhook] 📱 QR Code updated for ${userId}`);
  
  await supabase
    .from('profiles')
    .update({ 
      whatsapp_status: 'connecting',
      whatsapp_qr: qr,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);
}

export default router;
