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
  const { from, body, contactName, id: messageId, fromMe } = message;
  
  if (fromMe || from.includes('@g.us')) {
    // Se for echo (fromMe), só persistimos se necessário e encerramos (evita loop de IA)
    if (fromMe) {
       const cleanTo = from.split('@')[0].replace(/\D/g, '');
       await agentService.persistMessage(`${userId}_${cleanTo}`, userId, body, 'outbound', messageId, contactName, from, cleanTo, 'Atendente');
    }
    return;
  }

  const cleanPhone = from.split('@')[0].replace(/\D/g, '');
  const threadId = `${userId}_${cleanPhone}`;

  // Verificar se a mensagem possui mídia (através do objeto original preservado ou campos do provider)
  // Nota: A lógica de áudio permanece similar, mas usando o provider para buscar o base64
  const isAudio = body === '[Áudio]' || !!(message.raw?.message?.audioMessage);

  if (isAudio) {
    console.log(`[Webhook] 🎙️ Audio detected. Processing via Provider...`);
    const base64 = await provider.getMediaBase64(instanceName, message.raw?.key, message.raw?.message);
    
    if (base64) {
      const buffer = Buffer.from(base64, 'base64');
      const transcription = await transcribeAudio(buffer, `audio_${Date.now()}.ogg`);
      if (transcription) {
        const audioUrl = await (whatsappService as any).uploadToStorage(userId, buffer, `inbound_${Date.now()}.ogg`);
        await agentService.persistMessage(threadId, userId, `[Áudio]: ${transcription}`, 'inbound', messageId, contactName, from, cleanPhone, undefined, undefined, audioUrl || undefined);
        await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, transcription, contactName, cleanPhone, messageId, true);
        return;
      }
    }
  }

  // Persistir Texto e Disparar IA
  await agentService.persistMessage(threadId, userId, body, 'inbound', messageId, contactName, from, cleanPhone);
  await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, body, contactName, cleanPhone, messageId, false);
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
