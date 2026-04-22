import { Router } from 'express';
import { agentService } from '../services/agentService.js';
import { whatsappService } from '../services/whatsappService.js';
import { supabase } from '../lib/supabaseClient.js';
import { transcribeAudio } from '../services/aiService.js';
import { EvolutionApiService } from '../services/evolutionApiService.js';

const router = Router();

router.post('/webhook', async (req, res) => {
  const body = req.body;
  // Evolution v2 pode mandar em 'instance' ou 'instanceName'
  const instanceName = body.instance || body.instanceName || (body.data?.instance) || (body.data?.instanceName);
  const event = body.event;

  console.log(`[WhatsappWebhook] 📩 Event: "${event}" | Instance: "${instanceName}"`);
  
  if (!instanceName) {
    console.warn(`[WhatsappWebhook] ⚠️ No instanceName found in body:`, JSON.stringify(body).substring(0, 500));
    return res.status(200).send('OK');
  }

  try {
    // RESOLUÇÃO DE USUÁRIO: Buscar o UUID real do usuário pelo whatsapp_instance_id
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('whatsapp_instance_id', instanceName)
      .single();

    if (profileErr || !profile) {
      console.warn(`[WhatsappWebhook] ⚠️ Could not resolve user UUID for instance "${instanceName}". Skipping event.`);
      if (profileErr) console.error(`[WhatsappWebhook] DB Error:`, profileErr);
      return res.status(200).send('OK'); // Retornamos OK para a Evolution não ficar tentando reenviar algo que não achamos dono
    }

    const userId = profile.id; // O UUID real (ex: f8a2b1c0-xxxx-xxxx...)

    // Normalizar evento para suportar v1 e v2
    const normalizedEvent = event.toUpperCase().replace(/\./g, '_');

    switch (normalizedEvent) {
      case 'MESSAGES_UPSERT':
        const messageObj = body.data.messages?.[0] || body.data.message || body.data;
        const msgId = messageObj.key?.id || body.data.key?.id;
        
        if (msgId) {
          // A trava de duplicidade deve ser única por instância
          const lockKey = `${instanceName}:${msgId}`;
          const isNew = await (await import('../services/redisService.js')).redisService.markAsProcessed(lockKey);
          if (!isNew) {
            console.log(`[WhatsappWebhook] 🛡️ Duplicate message detected and ignored: ${lockKey}`);
            return res.status(200).send('OK');
          }
        }
        await handleMessageUpsert(userId, instanceName, body.data);
        break;
      
      case 'CONNECTION_UPDATE':

        await handleConnectionUpdate(userId, body.data);
        break;
      
      case 'QRCODE_UPDATED':
        await handleQrUpdate(userId, body.data);
        break;
      
      case 'MESSAGES_UPDATE':
      case 'MESSAGES_DELETE':
        // Eventos informativos, podemos implementar no futuro
        break;

      default:
        console.log(`[WhatsappWebhook] Unhandled normalized event: ${normalizedEvent} (Original: ${event})`);
        break;
    }
  } catch (error) {
    console.error(`[WhatsappWebhook] Error processing event ${event}:`, error);
  }

  res.status(200).send('OK');
});

async function handleMessageUpsert(userId: string, instanceName: string, data: any) {
  // Extrair o dado unificado independente de Evolution v1 ou v2
  // v2: data.message OU data.messages[0]
  const messageObj = data.message || (data.messages && data.messages[0]) || data;
  const key = messageObj.key || data.key;
  const messageContentObj = messageObj.message || messageObj;
  
  if (!messageContentObj || key?.fromMe) return;

  const remoteJid = key?.remoteJid;
  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') return;

  const pushName = messageObj.pushName || data.pushName || 'Cliente';
  const cleanNumber = remoteJid.split('@')[0].replace(/\D/g, '');
  const messageContent = messageContentObj.conversation || messageContentObj.extendedTextMessage?.text || '';
  const messageId = key.id;

  console.log(`[Webhook] 📥 Message from ${remoteJid}: "${messageContent.substring(0, 30)}"`);

  // Detectar Áudio
  const isAudio = !!(messageContentObj.audioMessage || (messageContentObj.viewOnceMessageV2?.message?.audioMessage));
  
  if (isAudio) {
      console.log(`[Webhook] 🎙️ Audio detected from ${remoteJid}. Processing...`);
      
      // Tentar pegar base64 (pode vir no webhook ou precisamos buscar na API)
      let base64Audio = messageContentObj.audioMessage?.base64 || messageContentObj.viewOnceMessageV2?.message?.audioMessage?.base64;
      
      if (!base64Audio) {
         console.log(`[Webhook] 🎙️ Audio detected but no base64. Attempting to fetch from Evolution API...`);
         const fetchedBase64 = await EvolutionApiService.getMediaBase64(instanceName, key, messageContentObj);
         if (fetchedBase64) {
            base64Audio = fetchedBase64;
            console.log(`[Webhook] ✅ Successfully fetched audio base64 from API.`);
         }
      }

      const threadId = `${userId}_${cleanNumber}`;
      if (!base64Audio) {
         console.log(`[Webhook] 🎙️ Audio detected from ${remoteJid} but no base64 found. Recording as placeholder.`);
         await agentService.persistMessage(
            threadId, userId, '[Áudio enviado pelo cliente]',
            'inbound', messageId, pushName, remoteJid, cleanNumber
         );
         return;
      }
      
      const buffer = Buffer.from(base64Audio, 'base64');
      const transcription = await transcribeAudio(buffer, `audio_${Date.now()}.ogg`);
      
      if (transcription) {
        const audioUrl = await (whatsappService as any).uploadToStorage(userId, buffer, `inbound_${Date.now()}.ogg`);
        await agentService.persistMessage(
          threadId, userId, `[Áudio]: ${transcription}`,
          'inbound', messageId, pushName, remoteJid, cleanNumber,
          undefined, undefined, audioUrl || undefined
        );

        // Disparar Resposta AI
        await (whatsappService as any).triggerAIResponseViaWebhook(userId, remoteJid, transcription, pushName, cleanNumber, messageId, true);
      }
      return;
  }

  // Persistir Mensagem de Texto
  const threadId = `${userId}_${cleanNumber}`;
  await agentService.persistMessage(
    threadId,
    userId,
    messageContent,
    'inbound',
    messageId,
    pushName,
    remoteJid,
    cleanNumber
  );

  // Disparar Resposta AI
  await (whatsappService as any).triggerAIResponseViaWebhook(userId, remoteJid, messageContent, pushName, cleanNumber, messageId, false);
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
