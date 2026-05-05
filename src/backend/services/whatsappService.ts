import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { supabase } from '../lib/supabaseClient.js';
import { agentService } from './agentService.js';
import { EvolutionApiService } from './evolutionApiService.js';
import { WhatsAppProviderFactory } from '../providers/WhatsAppProviderFactory.js';
import { Queue, Worker, Job } from 'bullmq';
import { redisService } from './redisService.js';
import { normalizePhone } from '../lib/phoneHelper.js';



const DEBUG_LOG = path.join(process.cwd(), 'audio_debug.log');
function logDebug(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(DEBUG_LOG, line);
}

console.log('[WhatsAppService] Evolution API version loaded');

interface Session {
  status: string;
  qr?: string;
}

export interface WhatsAppStatusResponse {
  status: string;
  qr?: string;
}

class WhatsAppService {
  private sessions: Map<string, Session> = new Map();
  private lastWebhookSync: Map<string, number> = new Map();
  private messageQueue: Queue;
  private followUpQueue: Queue;
  private messageWorker: Worker | null = null;
  private followUpWorker: Worker | null = null;

  constructor() {
    console.log('[WhatsAppService] Initializing with BullMQ...');
    
    // Configuração do Redis para BullMQ
    const connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    };

    this.messageQueue = new Queue('whatsapp-messages', { connection });
    this.followUpQueue = new Queue('whatsapp-followups', { connection });
    
    this.setupWorker(connection);
    this.setupFollowUpWorker(connection);
  }

  private setupWorker(connection: any) {
    this.messageWorker = new Worker('whatsapp-messages', async (job: Job) => {
      console.log(`[BullMQ] Processing message job ${job.id} for ${job.data.from}`);
      await this.processAIResponse(job.data);
    }, { 
      connection,
      concurrency: 5,
      limiter: { max: 10, duration: 1000 }
    });

    this.messageWorker.on('failed', (job, err) => {
      console.error(`[BullMQ] Message job ${job?.id} failed:`, err);
    });
  }

  private setupFollowUpWorker(connection: any) {
    this.followUpWorker = new Worker('whatsapp-followups', async (job: Job) => {
      console.log(`[FollowUp] ⏰ Processing level ${job.data.level + 1} for ${job.data.from}`);
      await this.processFollowUp(job.data);
    }, { connection, concurrency: 2 });

    this.followUpWorker.on('failed', (job, err) => {
      console.error(`[FollowUp] Job ${job?.id} failed:`, err);
    });
  }

  async enqueueMessage(data: any) {
    await this.messageQueue.add('process-message', data, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });
  }

  /**
   * Agenda um follow-up para um contato.
   * Se já existir um agendado, ele será substituído (debounce).
   */
  async scheduleFollowUp(userId: string, from: string, level: number = 0) {
    const jobId = `followup:${userId}:${from}`;
    let dbUserId = userId;
    
    try {
      // [CRITICAL] Resolv e UUID se o userId for um email (Hostinger compatibility)
      if (userId.includes('@')) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', userId)
          .maybeSingle();
        if (prof?.id) dbUserId = prof.id;
      }

      console.log(`[FollowUp] 🔍 Searching config for level ${level} (User: ${dbUserId}, From: ${from})`);

      // 1. Buscar configuração do agente
      const { data: agent } = await supabase
        .from('agents')
        .select('follow_ups')
        .eq('user_id', dbUserId)
        .eq('status_ativo', true)
        .maybeSingle();

      if (!agent?.follow_ups || !agent.follow_ups[level]) {
        console.log(`[FollowUp] 🛑 No configuration found for level ${level}`);
        return;
      }

      const config = agent.follow_ups[level];
      const delayMinutes = config.delayMinutes || 60;
      const delayMs = delayMinutes * 60 * 1000;

      // 2. Remover qualquer follow-up pendente anterior
      const existingJob = await this.followUpQueue.getJob(jobId);
      if (existingJob) {
        await existingJob.remove();
        console.log(`[FollowUp] 🔄 Resetting previous job for ${from}`);
      }

      // 3. Adicionar novo job com o delay configurado
      await this.followUpQueue.add('send-followup', {
        userId: dbUserId,
        from,
        level,
        config
      }, {
        jobId,
        delay: delayMs,
        removeOnComplete: true,
        attempts: 2
      });

      console.log(`[FollowUp] ✅ Level ${level + 1} scheduled for ${from} in ${delayMinutes}m`);
    } catch (err) {
      console.error('[FollowUp] Error scheduling:', err);
    }
  }

  /**
   * Cancela qualquer follow-up pendente para o contato (ex: quando ele responde)
   */
  async cancelFollowUp(userId: string, from: string) {
    const jobId = `followup:${userId}:${from}`;
    try {
      const job = await this.followUpQueue.getJob(jobId);
      if (job) {
        await job.remove();
        console.log(`[FollowUp] 🛑 Cancelled for ${from} (customer replied)`);
      }
    } catch (err) {}
  }

  async uploadToStorage(userId: string, buffer: Buffer, filename: string): Promise<string | null> {
    try {
      const path = `${userId}/${Date.now()}_${filename}`;
      const ext = filename.split('.').pop()?.toLowerCase() || 'bin';
      
      // Mapear extensão para Content-Type
      let contentType = 'application/octet-stream';
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      } else if (['mp4', 'avi', 'mov', 'mpeg'].includes(ext)) {
        contentType = `video/${ext === 'mov' ? 'quicktime' : (ext === 'mpeg' ? 'mpeg' : 'mp4')}`;
      } else if (['ogg', 'mp3', 'wav', 'aac'].includes(ext)) {
        contentType = `audio/${ext === 'mp3' ? 'mpeg' : (ext === 'wav' ? 'wav' : 'ogg')}`;
      } else if (ext === 'pdf') {
        contentType = 'application/pdf';
      }

      const { data, error } = await supabase.storage
        .from('chat-audios') // Bucket legado, mas usaremos para todas as mídias do chat por enquanto
        .upload(path, buffer, {
          contentType,
          upsert: true
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-audios')
        .getPublicUrl(path);

      return publicUrl;
    } catch (err) {
      console.error('[WhatsAppService] Error uploading to storage:', err);
      return null;
    }
  }

  private async updateProfileStatus(userId: string, data: { status: string; qr?: string }) {
    try {
      const instanceName = `wppai_${userId.substring(0, 8)}`;
      console.log(`[WhatsAppService] Updating status for user ${userId} (${instanceName}): ${data.status}`);

      const { error } = await supabase
        .from('profiles')
        .update({
          whatsapp_status: data.status,
          ...(data.qr ? { whatsapp_qr: data.qr } : (data.status === 'connected' || data.status === 'disconnected' ? { whatsapp_qr: null } : {})),
          whatsapp_instance_id: instanceName,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) console.error(`[WhatsAppService] Error updating profile:`, error.message);
    } catch (error) {
      console.error(`[WhatsAppService] Exception updating Supabase:`, error);
    }
  }

  async createSession(userId: string): Promise<string | null> {
    const instanceName = `wppai_${userId.substring(0, 8)}`;
    console.log(`[WhatsAppService] Starting WhatsApp session via Provider: ${instanceName}`);
    try {
      const provider = await WhatsAppProviderFactory.getProvider(userId);
      await provider.connect(instanceName, {});
      
      const status = await provider.getStatus(instanceName);
      if (status.status === 'qrcode' && status.qrcode) {
        await this.updateProfileStatus(userId, { status: 'connecting', qr: status.qrcode });
        return status.qrcode;
      }
      
      if (status.status === 'connected') {
        await this.updateProfileStatus(userId, { status: 'connected' });
        return 'connected';
      }
      
      await this.updateProfileStatus(userId, { status: 'connecting' });
      return null;
    } catch (error: any) {
      console.error(`[WhatsAppService] Error in createSession for ${instanceName}:`, error.message);
      throw error;
    }
  }

  async getSessionStatus(userId: string): Promise<WhatsAppStatusResponse> {
    try {
      const instanceName = `wppai_${userId.substring(0, 8)}`;
      const provider = await WhatsAppProviderFactory.getProvider(userId);
      const status = await provider.getStatus(instanceName);
      
      let dbStatus = 'disconnected';
      if (status.status === 'connected') dbStatus = 'connected';
      else if (status.status === 'connecting' || status.status === 'qrcode') dbStatus = 'connecting';

      const qr = status.status === 'qrcode' ? status.qrcode : undefined;
      await this.updateProfileStatus(userId, { status: dbStatus, qr });
      
      return { status: dbStatus, qr, webhookOk: true };
    } catch (error) {
      return { status: 'disconnected', webhookOk: false };
    }
  }

  async requestPairingCode(userId: string, phoneNumber: string): Promise<string> {
    try {
      const instanceName = `wppai_${userId.substring(0, 8)}`;
      const provider = await WhatsAppProviderFactory.getProvider(userId);
      await provider.connect(instanceName, {});
      
      const code = await provider.requestPairingCode(instanceName, phoneNumber);
      await this.updateProfileStatus(userId, { status: 'connecting' });
      return code;
    } catch (error: any) {
      console.error(`[WhatsAppService] Pairing Code Error:`, error.message);
      throw error;
    }
  }
  async deleteInstance(userId: string) {
    try {
      const { data: prof } = await supabase.from('profiles').select('whatsapp_instance_id').eq('id', userId).single();
      const instanceName = prof?.whatsapp_instance_id || `wppai_${userId.substring(0, 8)}`;
      
      const provider = await WhatsAppProviderFactory.getProvider(userId);
      await provider.disconnect(instanceName).catch(() => {});
      
      // Limpeza total no banco
      await supabase.from('profiles').update({ 
        whatsapp_status: 'disconnected', 
        whatsapp_qr: null, 
        whatsapp_instance_id: null,
        updated_at: new Date().toISOString() 
      }).eq('id', userId);
    } catch (error) {
      console.error('[WhatsAppService] Error deleting instance:', error);
      throw error;
    }
  }

  async logout(userId: string) {
    try {
      const { data: prof } = await supabase.from('profiles').select('whatsapp_instance_id').eq('id', userId).single();
      const instanceName = prof?.whatsapp_instance_id || `wppai_${userId.substring(0, 8)}`;
      const provider = await WhatsAppProviderFactory.getProvider(userId);
      await provider.disconnect(instanceName);

      await supabase.from('profiles').update({
        whatsapp_status: 'disconnected',
        whatsapp_qr: null,
        updated_at: new Date().toISOString()
      }).eq('id', userId);
    } catch (error) {
      await this.updateProfileStatus(userId, { status: 'disconnected' });
    }
  }

  async destroySession(userId: string) { await this.logout(userId); }

  async sendMessage(userId: string, to: string, message: string, senderName: string = 'Atendente', senderType: 'IA' | 'Atendente' = 'Atendente'): Promise<any> {
    const instanceName = `wppai_${userId.substring(0, 8)}`;
    const cleanTo = normalizePhone(to);
    const threadId = `${userId}_${cleanTo}`;


    // ── FASE 2: Banco PRIMEIRO, API depois ─────────────────────────────
    // Gera um ID temporário para persistir com status 'sending' imediatamente.
    // Quando a API confirmar o messageId real, faremos upsert com o ID correto.
    const tempId = `sending-${Date.now()}-${cleanTo}`;
    const sendTimestamp = Date.now();

    try {
    // 1. Persiste com status='sending' ANTES de chamar a API
    await supabase.from('messages').insert({
      id: tempId,
      whatsapp_id: tempId,
      user_id: userId,
      thread_id: threadId,
      text: message,
      direction: 'outbound',
      status: 'sending',
      timestamp: sendTimestamp,
      created_at: new Date(sendTimestamp).toISOString(),
    }).then(({ error }) => {
      if (error) console.warn('[WhatsAppService] Pre-persist (sending) warning:', error.message);
    });

    // 2. Atualiza thread com preview da mensagem (sidebar)
    const { data: contact } = await supabase.from('contacts').select('nome').eq('id', `${userId}_${cleanTo}`).maybeSingle();
    
    await supabase.from('threads').upsert({
      id: threadId,
      user_id: userId,
      last_message: message.substring(0, 1000),
      last_message_time: new Date(sendTimestamp).toISOString(),
      remote_jid: to,
      display_phone: cleanTo,
      agent_name: senderName,
      contact_name: contact?.nome || 'Cliente'
    }).then(({ error }) => {
      if (error) console.warn('[WhatsAppService] Thread preview update warning:', error.message);
    });

      // 3. Chama o provider via Abstração
      const provider = await WhatsAppProviderFactory.getProvider(userId);
      const result = await provider.sendMessage(instanceName, to, message);
      const msgId = (result as any).messageId || (result as any).key?.id || tempId;

      // 4. Substitui o registro temporário pelo definitivo com o ID real do WhatsApp
      if (msgId !== tempId) {
        // Insere o definitivo (pode conflitar com webhook echo — tratado por onConflict)
        const { error } = await supabase.from('messages').insert({
          id: msgId,
          whatsapp_id: msgId,
          user_id: userId,
          thread_id: threadId,
          text: message,
          direction: 'outbound',
          status: 'sent',
          timestamp: sendTimestamp,
          created_at: new Date(sendTimestamp).toISOString(),
        });

        if (error) {
          if (error.code === '23505') {
            // Webhook chegou primeiro — só atualiza o status do registro que já existe para este usuário
            await supabase.from('messages').update({ status: 'sent', thread_id: threadId }).eq('whatsapp_id', msgId).eq('user_id', userId);
            // Neste caso de conflito positivo, podemos deletar a temporária
            await supabase.from('messages').delete().eq('id', tempId);
          } else {
            console.error('[WhatsAppService] Definitive persist failed, keeping temp as fallback:', error.message);
            // NÃO DELETA A TEMPORÁRIA SE FALHAR — mantém como rastro
          }
        } else {
          // Sucesso no insert definitivo: remove o registro temporário com segurança
          await supabase.from('messages').delete().eq('id', tempId);
        }
      } else {
        // API não retornou ID diferente — só atualiza o status do temp
        await supabase.from('messages').update({ status: 'sent' }).eq('id', tempId);
      }

      console.log(`[WhatsAppService] ✅ Message sent and persisted: ${msgId}`);

      // 5. Agenda follow-up
      if (senderName !== 'IA (FOLLOW-UP)') {
        await this.scheduleFollowUp(userId, to, 0);
      }

      return { success: true, messageId: msgId };
    } catch (err: any) {
      // API falhou — marca a mensagem temporária como 'failed'
      await supabase.from('messages').update({ status: 'failed' }).eq('id', tempId);
      console.error(`[WhatsAppService] Error in sendMessage to ${to}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  async deleteMessage(userId: string, messageId: string) {
    try {
      // 1. Localizar a mensagem para saber a direção e o remoteJid
      const { data: msg } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!msg) return { success: false, error: 'Mensagem não encontrada' };

      // 2. Se for outbound, tenta apagar no WhatsApp via Provider
      if (msg.direction === 'outbound') {
         const { data: prof } = await supabase.from('profiles').select('whatsapp_instance_id').eq('id', userId).single();
         const instanceName = prof?.whatsapp_instance_id || `wppai_${userId.substring(0, 8)}`;
         const provider = await WhatsAppProviderFactory.getProvider(userId);
         
         // No WhatsApp, apagamos para todos (fromMe: true)
         const remoteJid = msg.thread_id.includes('_') ? msg.thread_id.split('_')[1] + '@c.us' : msg.thread_id;
         await provider.deleteMessage(instanceName, remoteJid, msg.whatsapp_id || messageId, true);
      }

      // 3. Marcamos como apagada no banco (estilo WhatsApp)
      const { error } = await supabase
        .from('messages')
        .update({ 
          text: '🚫 Esta mensagem foi apagada',
          message_type: 'revoked',
          media_url: null,
          audio_url: null,
          caption: null
        })
        .eq('id', messageId)
        .eq('user_id', userId);

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error('[WhatsAppService] Error deleting message:', err);
      return { success: false, error: err.message };
    }
  }

  private async getInstanceName(userId: string): Promise<string> {
    const { data: prof } = await supabase.from('profiles').select('whatsapp_instance_id').eq('id', userId).maybeSingle();
    return prof?.whatsapp_instance_id || `wppai_${userId.substring(0, 8)}`;
  }

  async sendReaction(userId: string, to: string, messageId: string, emoji: string) {
    try {
      let dbUserId = userId;
      if (userId.includes('@')) {
        const { data: prof } = await supabase.from('profiles').select('id').eq('email', userId).maybeSingle();
        if (prof?.id) dbUserId = prof.id;
      }

      const instanceName = await this.getInstanceName(dbUserId);
      const provider = await WhatsAppProviderFactory.getProvider(dbUserId);
      
      // Busca a direção da mensagem original para saber o fromMe
      const { data: msg } = await supabase
        .from('messages')
        .select('direction')
        .eq('whatsapp_id', messageId)
        .maybeSingle();
      
      const fromMe = msg?.direction === 'outbound';

      console.log(`[WhatsAppService] Sending reaction "${emoji}" to ${messageId} | fromMe: ${fromMe} | Instance: ${instanceName}`);
      const success = await provider.sendReaction(instanceName, to, messageId, emoji, fromMe);
      
      if (success) {
        await agentService.updateMessageReaction(dbUserId, messageId, emoji);
      }
      return { success };
    } catch (err: any) {
      console.error(`[WhatsAppService] Error sending reaction to ${messageId}:`, err);
      return { success: false, error: err.message };
    }
  }

  async sendVoice(userId: string, to: string, audioBuffer: Buffer) {
    const instanceName = `wppai_${userId.substring(0, 8)}`;
    const provider = await WhatsAppProviderFactory.getProvider(userId);
    const result = await provider.sendMedia(instanceName, to, audioBuffer.toString('base64'), undefined, 'audio');
    const audioUrl = await this.uploadToStorage(userId, audioBuffer, `manual_${Date.now()}.ogg`);
    try {
      const cleanTo = normalizePhone(to);
      await agentService.persistMessage(
        `${userId}_${cleanTo}`, 
        userId, 
        '[Áudio]', 
        'outbound', 
        result.key?.id || `ai-${Date.now()}`, 
        undefined, // contactName
        to, 
        cleanTo, 
        'Atendente', // agentName
        undefined, 
        audioUrl || undefined,
        'audio', // messageType
        audioUrl || undefined // mediaUrl
      );
    } catch (err) {}
    return { success: true, messageId: result.key?.id };
  }

  async sendMedia(userId: string, to: string, buffer: Buffer, mimetype: string, filename: string) {
    const instanceName = `wppai_${userId.substring(0, 8)}`;
    const provider = await WhatsAppProviderFactory.getProvider(userId);
    const type = mimetype.startsWith('image') ? 'image' : mimetype.startsWith('video') ? 'video' : 'document';
    const result = await provider.sendMedia(instanceName, to, buffer.toString('base64'), filename, type);
    
    // Upload para nosso storage para visualização no chat
    const mediaUrl = await this.uploadToStorage(userId, buffer, filename);

    try {
      const cleanTo = normalizePhone(to);
      await agentService.persistMessage(
        `${userId}_${cleanTo}`, 
        userId, 
        `[Mídia]: ${filename}`, 
        'outbound', 
        result.key?.id || `med-${Date.now()}`, 
        'Cliente', 
        to, 
        cleanTo, 
        'Atendente',
        undefined, // usage
        undefined, // audioUrl
        type,      // messageType
        mediaUrl || undefined, // mediaUrl
        mimetype,
        filename
      );
    } catch (err) {
      console.error('[WhatsAppService] Error persisting sent media:', err);
    }
    return { success: true, messageId: result.key?.id };
  }


  // Novo método para ser chamado pelo Webhook (Agora via BullMQ)
  async triggerAIResponseViaWebhook(userId: string, from: string, body: string, contactName: string, cleanPhone: string, messageId: string, isAudio: boolean = false) {
    const jobId = `pending_ai:${userId}:${from}`;
    
    const cacheKey = `agent_config:${userId}`;
    let delaySeconds = 15;
    
    try {
      // 1. Sempre buscar do banco para garantir tempo real (ou cache curto)
      const { data: agent } = await supabase
        .from('agents')
        .select('response_delay, config')
        .eq('user_id', userId)
        .eq('status_ativo', true)
        .maybeSingle();
      
      if (agent) {
        // Tenta pegar do campo direto ou de dentro do JSON config
        delaySeconds = agent.response_delay || agent.config?.response_delay || 15;
        console.log(`[WhatsAppService] ⚙️ Config found for ${userId}: delay=${delaySeconds}s`);
      } else {
        console.warn(`[WhatsAppService] ⚠️ No active agent found for ${userId}, using default 15s delay.`);
      }
    } catch (e) {
      console.warn(`[WhatsAppService] DB error for agent config:`, e);
    }

    console.log(`[WhatsAppService] ⏳ Scheduling AI response for ${from} in ${delaySeconds}s (BullMQ)`);

    // Debounce: Se já existir um job agendado para este contato, o BullMQ vai ignorar o novo se usarmos o mesmo jobId
    // Ou podemos remover o antigo para "resetar" o timer (melhor para debounce real)
    try {
      // 🛑 Cancela follow-ups pendentes pois o cliente acabou de mandar uma mensagem
      await this.cancelFollowUp(userId, from);

      const job = await this.messageQueue.getJob(jobId);
      if (job) {
        await job.remove();
        console.log(`[WhatsAppService] 🔄 Debounce: Removed previous job for ${from}`);
      }
    } catch (e) {}

    await this.messageQueue.add('process-message', {
      profileId: userId,
      userId, // para compatibilidade
      from,
      body,
      contactName,
      displayPhone: cleanPhone,
      messageId,
      isAudio
    }, {
      jobId,
      delay: delaySeconds * 1000,
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });
  }

  // Método interno que processa a lógica de IA (chamado pelo Worker do BullMQ)
  private async processAIResponse(data: any) {
    const { userId, from, body, contactName, displayPhone, messageId, isAudio } = data;
    const instanceName = `wppai_${userId.substring(0, 8)}`;

    try {
      console.log(`[WhatsAppService] 🚀 Processing AI response for ${from} (BullMQ Worker)`);

      // 🛑 Idempotência: Verifica se já houve uma resposta outbound recente para esta thread (últimos 30s)
      // para evitar duplicatas por retentativa de webhook/job
      const thirtySecondsAgo = Date.now() - 30000;
      const cleanPhone = from.split('@')[0].replace(/\D/g, '');
      const threadId = `${userId}_${cleanPhone}`;

      const { data: recentReply } = await supabase
        .from('messages')
        .select('id')
        .eq('thread_id', threadId)
        .eq('direction', 'outbound')
        .gte('timestamp', thirtySecondsAgo)
        .limit(1)
        .maybeSingle();

      if (recentReply) {
        console.log(`[WhatsAppService] 🛡️ Idempotency: Response already sent recently for ${from}. Skipping.`);
        return;
      }

      const aiResponse = await agentService.processIncoming(userId, {
        from, body, contactName, messageId,
        displayPhone: displayPhone,
        skipPersist: true,
        isAudioRequest: isAudio
      });

      // 🛡️ PROTEÇÃO: Se a IA não retornou resposta (ex: modo humano ou ignorado), para por aqui sem quebrar
      if (!aiResponse) {
        console.log(`[WhatsAppService] ℹ️ AI skipped response for ${from} (Possibly human mode or no active agent)`);
        return;
      }

      const aiResponseData = typeof aiResponse === 'string' ? { text: aiResponse } : aiResponse;
      const finalResponseText = (aiResponseData as any)?.text;
      const audioBuffer = (aiResponseData as any)?.audioBuffer;
      const usedVoiceMode = (aiResponseData as any)?.voiceMode || 'disabled';
      const aiMsgId = (aiResponseData as any)?.aiMsgId;

      if (!finalResponseText || finalResponseText.trim().length === 0) return;
 
      // Busca dados do agente para usar o nome correto no chat
      const { data: agentData } = await supabase.from('agents').select('nome').eq('user_id', userId).eq('is_active', true).maybeSingle();
 
      // LÓGICA DE ENVIO INTELIGENTE VIA MÉTODO CENTRALIZADO
      // Isso garante status 'sending', 'sent' e evita duplicidade no chat.
      const provider = await WhatsAppProviderFactory.getProvider(userId);
      if (audioBuffer && usedVoiceMode === 'audio_only') {
        await provider.sendMedia(instanceName, from, audioBuffer.toString('base64'), undefined, 'audio');
        const aiAudioUrl = await this.uploadToStorage(userId, audioBuffer, `ai_resp_${Date.now()}.ogg`);
        await agentService.persistMessage(
           `${userId}_${displayPhone}`, userId, '[Áudio]',
           'outbound', `${aiMsgId}-audio`, contactName, from, displayPhone,
           'Atendente', undefined, aiAudioUrl || undefined,
           'audio',
           aiAudioUrl || undefined
        );
      } else {
        await this.sendMessage(userId, from, finalResponseText, agentData?.nome || 'Sofia', 'IA');
        if (audioBuffer && usedVoiceMode === 'always') {
          const aiAudioUrl = await this.uploadToStorage(userId, audioBuffer, `ai_resp_${Date.now()}.ogg`);
          await provider.sendMedia(instanceName, from, audioBuffer.toString('base64'), undefined, 'audio');
          await agentService.persistMessage(
            `${userId}_${displayPhone}`, userId, '[Áudio]',
            'outbound', `${aiMsgId}-audio`, contactName, from, displayPhone,
            'Atendente', undefined, aiAudioUrl || undefined,
            'audio',
            aiAudioUrl || undefined
          );
        }
      }
    } catch (err) {
      console.error(`[WhatsAppService] AI Processing Error for ${from}:`, err);
      throw err; // Força retry do BullMQ
    }
  }

  /**
   * Processa a execução do Follow-up (Níveis configurados)
   */
  private async processFollowUp(data: any) {
    const { userId, from, level, config } = data;
    const instanceName = `wppai_${userId.substring(0, 8)}`;

    try {
      // 1. Verificar se o último status da thread ainda permite follow-up
      // (Se o cliente já respondeu ou se foi assumido por humano, paramos)
      const cleanPhone = from.split('@')[0].replace(/\D/g, '');
      const threadId = `${userId}_${cleanPhone}`;
      
      const { data: thread } = await supabase
        .from('threads')
        .select('status, last_message_time')
        .eq('id', threadId)
        .maybeSingle();

      if (!thread || thread.status !== 'ia') {
        console.log(`[FollowUp] 🛑 Skipping for ${from}: Thread status is ${thread?.status || 'unknown'}`);
        return;
      }

      // 2. Definir a mensagem (IA ou Fixa)
      let finalMessage = config.message;

      if (config.type === 'ai') {
        console.log(`[FollowUp] 🧠 Generating AI message for re-engagement...`);
        const { data: agent } = await supabase.from('agents').select('*').eq('user_id', userId).maybeSingle();
        
        const aiResponse = await agentService.processIncoming(userId, {
          from,
          body: `[SISTEMA: O cliente parou de responder. Envie um follow-up de reengajamento seguindo esta instrução: ${config.extraPrompt}]`,
          contactName: 'Cliente',
          messageId: `followup-gen-${Date.now()}`,
          displayPhone: cleanPhone,
          skipPersist: true
        });

        const aiResponseData = typeof aiResponse === 'string' ? { text: aiResponse } : aiResponse;
        finalMessage = aiResponseData?.text;
      }

      if (!finalMessage) return;

      // 3. Enviar a mensagem (O sendMessage centralizado já faz o envio e a persistência única)
      await this.sendMessage(userId, from, finalMessage, 'IA (FOLLOW-UP)', 'IA');

      // 4. Agendar o PRÓXIMO nível, se existir
      await this.scheduleFollowUp(userId, from, level + 1);

    } catch (err) {
      console.error(`[FollowUp] Error processing for ${from}:`, err);
      throw err;
    }
  }

  async startMaintenanceWorker() {
    console.log('[WhatsAppService] 🛠️ Maintenance Worker started (30 min cycle)');
    
    // Roda a cada 30 minutos para não sobrecarregar o sistema
    setInterval(async () => {
      try {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, whatsapp_instance_id, whatsapp_status')
          .not('whatsapp_instance_id', 'is', null);

        if (!profiles) return;

        // --- PARTE A: Sincronização de Status (Instâncias Ativas) ---
        for (const profile of profiles) {
          const instanceName = profile.whatsapp_instance_id!;
          try {
            const realStatus = await EvolutionApiService.getInstanceStatus(instanceName);
            const mappedStatus = realStatus.state === 'open' ? 'connected' : (realStatus.state === 'connecting' ? 'connecting' : 'disconnected');
            if (mappedStatus !== profile.whatsapp_status) {
              await this.updateProfileStatus(profile.id, { status: mappedStatus });
            }
            if (mappedStatus === 'connected') {
              await EvolutionApiService.setWebhook(instanceName).catch(() => {});
            }
          } catch (err) {}
        }

        // --- PARTE B: Limpeza de Órfãos (Zeladoria) ---
        // Busca todas as instâncias que existem na Evolution
        const allEvolutionInstances = await EvolutionApiService.listInstances();
        if (allEvolutionInstances && Array.isArray(allEvolutionInstances)) {
          for (const instance of allEvolutionInstances) {
            const name = instance.instanceName;
            if (name && name.startsWith('wppai_')) {
              // Verifica se essa instância pertence a algum usuário no nosso banco
              const isLinked = profiles.some(p => p.whatsapp_instance_id === name);
              if (!isLinked) {
                console.log(`[Maintenance] 🧹 Deleting orphaned instance: ${name}`);
                await EvolutionApiService.deleteInstance(name).catch(() => {});
              }
            }
          }
        }
      } catch (err) {
        console.error('[WhatsAppService] Global Maintenance Error:', err);
      }
    }, 1800000); // 30 minutos
  }

  async destroyAll() {
    console.log('[WhatsAppService] destroyAll called (No-op for Evolution)');
  }

  async initializeAllSessions() {
    this.startMaintenanceWorker();
    // Rodar limpeza de storage uma vez ao dia (ou a cada 24h)
    setInterval(() => this.cleanupOldStorageFiles(), 86400000);
    // Rodar uma vez agora no boot
    this.cleanupOldStorageFiles();
    console.log('[WhatsAppService] initializeAllSessions called');
  }

  async syncInstance(userId: string) {
    const instanceName = `wppai_${userId.substring(0, 8)}`;
    const webhookUrl = process.env.BACKEND_WEBHOOK_URL;

    console.log(`[WhatsAppService] 🔄 Syncing instance for user ${userId}...`);

    try {
      // 1. Verificar se existe na Evolution
      const status = await EvolutionApiService.getInstanceStatus(instanceName);
      
      if (status === 'not_found') {
        throw new Error('Instância não encontrada na Evolution. Por favor, desconecte e conecte novamente.');
      }

      // 2. Forçar Webhook
      if (webhookUrl) {
        await EvolutionApiService.setWebhook(instanceName, webhookUrl);
      }

      // 3. Forçar Configurações (Always Online, etc)
      const settings = {
        rejectCall: false,
        msgCall: "",
        groupsIgnore: true,
        alwaysOnline: true,
        readMessages: true,
        readStatus: false,
        syncFullHistory: false
      };
      await EvolutionApiService.setSettings(instanceName, settings);

      // 4. Garantir que o DB está com o ID correto
      await supabase.from('profiles').update({
        whatsapp_instance_id: instanceName,
        updated_at: new Date().toISOString()
      }).eq('id', userId);

      return { success: true, message: 'Instância sincronizada com sucesso!' };
    } catch (error: any) {
      console.error(`[WhatsAppService] Sync error for ${userId}:`, error.message);
      throw error;
    }
  }

  async cleanupOldStorageFiles() {
    console.log('[WhatsAppService] 🧹 Starting storage cleanup (files > 7 days)...');
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets) return;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      for (const bucket of buckets) {
        // Listar arquivos no bucket (limitado a 1000 por vez para segurança)
        const { data: files } = await supabase.storage.from(bucket.name).list();
        if (!files) continue;

        const filesToDelete = files
          .filter(f => new Date(f.created_at) < sevenDaysAgo)
          .map(f => f.name);

        if (filesToDelete.length > 0) {
          console.log(`[WhatsAppService] 🧹 Deleting ${filesToDelete.length} old files from bucket ${bucket.name}`);
          await supabase.storage.from(bucket.name).remove(filesToDelete);
        }
      }
    } catch (err) {
      console.error('[WhatsAppService] Storage cleanup error:', err);
    }
  }
}


export const whatsappService = new WhatsAppService();
// Inicia o worker de manutenção ao carregar o serviço
whatsappService.startMaintenanceWorker();

