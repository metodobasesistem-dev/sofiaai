import { Router } from 'express';
import { agentService } from '../services/agentService.js';
import { whatsappService } from '../services/whatsappService.js';
import { supabase } from '../lib/supabaseClient.js';
import { transcribeAudio } from '../services/aiService.js';
import { WhatsAppProviderFactory } from '../providers/WhatsAppProviderFactory.js';

const router = Router();

router.post('/webhook', async (req, res) => {
  const body = req.body;
  // Identificador comum de instância (necessário para achar o dono)
  const instanceName = body.instance || body.instanceName || (body.data?.instance) || (body.data?.instanceName);
  const event = body.event;

  if (!instanceName) return res.status(200).send('OK');

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
  const { from, body, contactName, id: messageId, fromMe, type, caption, fileName, mimeType, raw } = message;
  
  if (from.includes('@g.us')) return; // Ignore groups for now

  const cleanPhone = from.split('@')[0].replace(/\D/g, '');
  const threadId = `${userId}_${cleanPhone}`;

  // If it's fromMe, it was sent from the phone (or system echo)
  if (fromMe) {
    // Check if it's already in the DB (sent by system)
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('whatsapp_id', messageId)
      .maybeSingle();

    if (existing) return; // Already persisted by system
  }

  // INBOUND OR OUTBOUND FROM PHONE
  console.log(`[Webhook] 📥 Processing message: ${messageId} | Type: ${type} | fromMe: ${fromMe}`);

  // Handle Media Asynchronously to not block the response
  if (type !== 'text' && type !== 'unknown') {
    handleMediaMessage(userId, instanceName, threadId, message, provider, fromMe ? 'outbound' : 'inbound').catch(err => {
      console.error(`[Webhook] Error handling media message:`, err);
    });
    return;
  }

  // Persist Text and Trigger AI (only if inbound)
  await agentService.persistMessage(threadId, userId, body, fromMe ? 'outbound' : 'inbound', messageId, contactName, from, cleanPhone, fromMe ? 'Atendente' : undefined, undefined, undefined, type, undefined, undefined, undefined, undefined, fromMe);
  
  if (!fromMe) {
    await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, body, contactName, cleanPhone, messageId, false);
  }
}

async function handleMediaMessage(userId: string, instanceName: string, threadId: string, message: any, provider: any, direction: 'inbound' | 'outbound' = 'inbound') {
  const { from, body, contactName, id: messageId, type, caption, fileName, mimeType, raw } = message;
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
      isExternal ? 'Atendente' : undefined, undefined, mediaUrl, type, mediaUrl, mimeType, fileName, caption, isExternal
    );

    // Trigger AI only if inbound
    if (direction === 'inbound') {
      if (type === 'audio' && transcription) {
        await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, transcription, contactName, cleanPhone, messageId, true);
      } else if (type === 'image' || type === 'video') {
         if (caption) {
           await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, caption, contactName, cleanPhone, messageId, false);
         }
      }
    }
  } catch (err) {
    console.error(`[Webhook] Failed to process media message ${messageId}:`, err);
    // Fallback persist without media URL if failed
    await agentService.persistMessage(threadId, userId, body, direction, messageId, contactName, from, cleanPhone, isExternal ? 'Atendente' : undefined, undefined, undefined, type, undefined, mimeType, fileName, caption, isExternal);
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
