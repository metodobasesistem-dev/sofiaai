import { Router } from 'express';
import { agentService } from '../services/agentService.js';
import { whatsappService } from '../services/whatsappService.js';
import { supabase } from '../lib/supabaseClient.js';
import { transcribeAudio } from '../services/aiService.js';

const router = Router();

router.post('/webhook', async (req, res) => {
  const body = req.body;
  const instanceName = body.instance; // O userId é o instanceName
  const event = body.event;

  console.log(`[WhatsappWebhook] Received event "${event}" for instance "${instanceName}"`);

  try {
    switch (event) {
      case 'MESSAGES_UPSERT':
        await handleMessageUpsert(instanceName, body.data);
        break;
      
      case 'CONNECTION_UPDATE':
        await handleConnectionUpdate(instanceName, body.data);
        break;
      
      case 'QRCODE_UPDATED':
        await handleQrUpdate(instanceName, body.data);
        break;

      default:
        // console.log(`[WhatsappWebhook] Unhandled event: ${event}`);
        break;
    }
  } catch (error) {
    console.error(`[WhatsappWebhook] Error processing event ${event}:`, error);
  }

  res.status(200).send('OK');
});

async function handleMessageUpsert(userId: string, data: any) {
  const message = data.message;
  if (!message || data.key.fromMe) return;

  const remoteJid = data.key.remoteJid;
  if (remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') return;

  const pushName = data.pushName || 'Cliente';
  const cleanNumber = remoteJid.split('@')[0].replace(/\D/g, '');
  const messageContent = message.conversation || message.extendedTextMessage?.text || '';
  const messageId = data.key.id;

  console.log(`[Webhook] 📥 Message from ${remoteJid}: "${messageContent.substring(0, 30)}"`);

  // Detectar Áudio
  const isAudio = !!(message.audioMessage || (message.viewOnceMessageV2?.message?.audioMessage));
  
  if (isAudio) {
     console.log(`[Webhook] 🎙️ Audio detected from ${remoteJid}. Processing...`);
     // Evolution API v2 envia o base64 se configurado ou precisamos baixar
     // Se não tiver base64, ignoramos ou buscamos via API
     const base64Audio = message.audioMessage?.base64 || message.viewOnceMessageV2?.message?.audioMessage?.base64;
     
     if (base64Audio) {
        const buffer = Buffer.from(base64Audio, 'base64');
        const transcription = await transcribeAudio(buffer, `audio_${Date.now()}.ogg`);
        
        if (transcription) {
          // Upload e Persistência similar ao whatsappService antigo
          const audioUrl = await (whatsappService as any).uploadToStorage(userId, buffer, `inbound_${Date.now()}.ogg`);
          
          const threadId = `${userId}_${cleanNumber}`;
          await agentService.persistMessage(
            threadId,
            userId,
            `[Áudio]: ${transcription}`,
            'inbound',
            messageId,
            pushName,
            remoteJid,
            cleanNumber,
            undefined,
            undefined,
            audioUrl || undefined
          );

          // Disparar Resposta AI
          await (whatsappService as any).triggerAIResponseViaWebhook(userId, remoteJid, transcription, pushName, cleanNumber, messageId, true);
        }
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
