import { Router } from 'express';
import { agentService } from '../services/agentService.js';
import { whatsappService } from '../services/whatsappService.js';
import { supabase } from '../lib/supabaseClient.js';
import { transcribeAudio } from '../services/aiService.js';
import { WhatsAppProviderFactory } from '../providers/WhatsAppProviderFactory.js';
import { normalizePhone } from '../lib/phoneHelper.js';


const router = Router();

router.post('/webhook', async (req, res) => {
  const body = req.body;
  // Identificador comum de instância (necessário para achar o dono)
  const instanceName = body.instance || body.instanceName || (body.data?.instance) || (body.data?.instanceName);
  const event = body.event;

  if (!instanceName) return res.status(200).send('OK');

  // [IDEMPOTENCY] Evitar processar o mesmo evento/mensagem múltiplas vezes (webhook duplicate)
  // Alguns providers mandam múltiplos webhooks para o mesmo evento (ex: status pending, then status received)
  const eventId = body.data?.key?.id || body.data?.id || body.message?.key?.id || body.id;
  if (eventId && event === 'messages.upsert') {
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

    if (!profile) return res.status(200).send('OK');
    const userId = profile.id;

    // 2. Obtém o Provider Abstraído
    const provider = await WhatsAppProviderFactory.getProvider(userId);

    // 3. Traduz o payload proprietário para o formato universal
    const message = provider.transformPayload(body);

    // 4. Processa se for uma mensagem válida
    if (message) {
      await handleStandardizedMessage(userId, instanceName, message, provider);
    }

    // 5. Tratamento de Eventos de Conexão (Agnóstico via Evento do Provider se possível, 
    // ou fallback para o switch atual se o evento for detectado)
    const normalizedEvent = (event || '').toUpperCase().replace(/\./g, '_');
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
  const { from, body, contactName, id: messageId, fromMe, type, caption, fileName, mimeType, quotedId, quotedText, raw } = message;
  
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
  const threadId = `${userId}_${cleanPhone}`;


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
    await agentService.persistMessage(threadId, userId, body, fromMe ? 'outbound' : 'inbound', messageId, contactName, from, cleanPhone, fromMe ? 'Atendente' : undefined, undefined, undefined, type, undefined, undefined, undefined, undefined, fromMe, quotedId, quotedText);
    
    // 2. SÓ DISPARA SE PERSISTIU (ou se for outbound do telefone, não dispara IA)
    if (!fromMe) {
      await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, body, contactName, cleanPhone, messageId, false);
    }
  } catch (err: any) {
    // Log detalhado conforme solicitado no Bug 1
    console.error(`[Webhook] ❌ PERSISTENCE FAILED for message ${messageId} | User: ${userId} | Jid: ${from} | Type: ${type} | Error:`, err.message || err);
    // Não dispara a IA se a persistência falhou
  }
}

async function handleMediaMessage(userId: string, instanceName: string, threadId: string, message: any, provider: any, direction: 'inbound' | 'outbound' = 'inbound') {
  const { from, body, contactName, id: messageId, type, caption, fileName, mimeType, quotedId, quotedText, raw } = message;
  const cleanPhone = from.split('@')[0].replace(/\D/g, '');
  const isExternal = direction === 'outbound';

  console.log(`[Webhook] 📥 Downloading media for ${direction} message: ${messageId} (${type})`);
  
  try {
    const base64 = await provider.getMediaBase64(instanceName, raw?.key, raw?.message);
    if (!base64) {
      console.warn(`[Webhook] Could not get base64 for media message: ${messageId}`);
      await agentService.persistMessage(threadId, userId, body, direction, messageId, contactName, from, cleanPhone, isExternal ? 'Atendente' : undefined, undefined, undefined, type, undefined, mimeType, fileName, caption, isExternal);
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
      isExternal ? 'Atendente' : undefined, undefined, mediaUrl, type, mediaUrl, mimeType, fileName, caption, isExternal, quotedId, quotedText
    );

    // Trigger AI only if inbound
    if (direction === 'inbound') {
      if (type === 'audio' && transcription) {
        await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, transcription, contactName, cleanPhone, messageId, true);
      } else if (type === 'image' || type === 'video') {
         await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, caption || (type === 'image' ? '[Imagem]' : '[Vídeo]'), contactName, cleanPhone, messageId, false, mediaUrl, mimeType);
      }
    }
  } catch (err) {
    console.error(`[Webhook] Failed to process media message ${messageId}:`, err);
    // Fallback persist without media URL if failed
    await agentService.persistMessage(threadId, userId, body, direction, messageId, contactName, from, cleanPhone, isExternal ? 'Atendente' : undefined, undefined, undefined, type, undefined, mimeType, fileName, caption, isExternal, quotedId, quotedText);
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
