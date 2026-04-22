import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { supabase } from '../lib/supabaseClient.js';
import { agentService } from './agentService.js';
import { EvolutionApiService } from './evolutionApiService.js';
import { Queue, Worker, Job } from 'bullmq';
import { redisService } from './redisService.js';


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
      const { data, error } = await supabase.storage
        .from('chat-audios')
        .upload(path, buffer, {
          contentType: 'audio/ogg',
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
    console.log(`[WhatsAppService] Starting Evolution instance: ${instanceName}`);
    try {
      await EvolutionApiService.createInstance(instanceName);
      let qrData = null;
      for (let i = 0; i < 3; i++) {
        qrData = await EvolutionApiService.getQrCode(instanceName);
        if (qrData && qrData.base64) break;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (qrData && qrData.base64) {
        await this.updateProfileStatus(userId, { status: 'connecting', qr: qrData.base64 });
        return qrData.base64;
      }
      const status = await EvolutionApiService.getInstanceStatus(instanceName);
      if (status.state === 'open') {
        await this.updateProfileStatus(userId, { status: 'connected' });
        return 'connected';
      }
      await this.updateProfileStatus(userId, { status: 'connecting' });
      return null;
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message;
      console.error(`[WhatsAppService] Error in createSession for ${instanceName}:`, errorMsg);
      throw new Error(`Evolution API Error: ${errorMsg}`);
    }
  }

  async getSessionStatus(userId: string): Promise<WhatsAppStatusResponse> {
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('whatsapp_status, whatsapp_qr, whatsapp_instance_id')
        .eq('id', userId)
        .single();
      
      const instanceName = `wppai_${userId.substring(0, 8)}`;
      if (!prof?.whatsapp_instance_id) {
         await supabase.from('profiles').update({ whatsapp_instance_id: instanceName }).eq('id', userId);
      }
      const status = await EvolutionApiService.getInstanceStatus(instanceName);
      let dbStatus = 'disconnected';
      let webhookOk = true;

      if (status.state === 'open') {
        dbStatus = 'connected';
        
        // Verificação Proativa de Webhook
        try {
          const webhookInfo = await EvolutionApiService.getWebhook(instanceName);
          const expectedUrl = process.env.BACKEND_WEBHOOK_URL;
          if (webhookInfo?.url !== expectedUrl) {
            webhookOk = false;
            console.warn(`[WhatsAppService] Webhook mismatch for ${instanceName}. Expected: ${expectedUrl}, Found: ${webhookInfo?.url}`);
          }
        } catch (e) {
          webhookOk = false;
        }

        const now = Date.now();
        const lastSync = this.lastWebhookSync.get(instanceName) || 0;
        if (now - lastSync > 3600000 || !webhookOk) {
          EvolutionApiService.setWebhook(instanceName).then(() => this.lastWebhookSync.set(instanceName, now)).catch(() => {});
        }
      } else if (status.state === 'connecting') {
        dbStatus = 'connecting';
      }

      let qr = undefined;
      if (dbStatus === 'connecting') {
        const qrData = await EvolutionApiService.getQrCode(instanceName);
        qr = qrData?.base64;
      }
      await this.updateProfileStatus(userId, { status: dbStatus, qr });
      return { status: dbStatus, qr, webhookOk };
    } catch (error) {
      return { status: 'disconnected', webhookOk: false };
    }
  }

  async requestPairingCode(userId: string, phoneNumber: string): Promise<string> {
    try {
      const instanceName = `wppai_${userId.substring(0, 8)}`;
      await EvolutionApiService.createInstance(instanceName);
      await supabase.from('profiles').update({ whatsapp_instance_id: instanceName }).eq('id', userId);
      const data = await EvolutionApiService.getPairingCode(instanceName, phoneNumber);
      if (!data || !data.code) throw new Error('Não foi possível gerar o código.');
      await this.updateProfileStatus(userId, { status: 'connecting' });
      return data.code;
    } catch (error: any) {
      throw error;
    }
  }

  async logout(userId: string) {
    try {
      const { data: prof } = await supabase.from('profiles').select('whatsapp_instance_id').eq('id', userId).single();
      const instanceName = prof?.whatsapp_instance_id || `wppai_${userId.substring(0, 8)}`;
      await EvolutionApiService.logout(instanceName);
      await supabase.from('profiles').update({ whatsapp_status: 'disconnected', whatsapp_qr: null, whatsapp_instance_id: null, updated_at: new Date().toISOString() }).eq('id', userId);
    } catch (error) {
      await this.updateProfileStatus(userId, { status: 'disconnected' });
    }
  }

  async destroySession(userId: string) { await this.logout(userId); }

  async sendMessage(userId: string, to: string, message: string, senderName: string = 'Atendente', senderType: 'IA' | 'Atendente' = 'Atendente'): Promise<any> {
    const instanceName = `wppai_${userId.substring(0, 8)}`;
    const cleanTo = to.split('@')[0].replace(/\D/g, '');
    
    try {
      const result = await EvolutionApiService.sendMessage(instanceName, to, message);
      const msgId = result.key?.id || result.messageId || `out-${Date.now()}`;

      // Persiste a mensagem
      await agentService.persistMessage(`${userId}_${cleanTo}`, userId, message, 'outbound', msgId, senderName, to, cleanTo, senderType);
      
      // 🔄 Reseta/Agenda o Follow-up após mensagem (exceto se for o próprio follow-up enviando)
      if (senderName !== 'IA (FOLLOW-UP)') {
        console.log(`[WhatsAppService] 📤 Message sent to ${to}. Scheduling follow-up...`);
        await this.scheduleFollowUp(userId, to, 0);
      }
      
      return { success: true, messageId: msgId };
    } catch (err: any) {
      console.error(`[WhatsAppService] Error in sendMessage to ${to}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  async sendVoice(userId: string, to: string, audioBuffer: Buffer) {
    const instanceName = `wppai_${userId.substring(0, 8)}`;
    const result = await EvolutionApiService.sendVoice(instanceName, to, audioBuffer.toString('base64'));
    const audioUrl = await this.uploadToStorage(userId, audioBuffer, `manual_${Date.now()}.ogg`);
    try {
      const cleanTo = to.split('@')[0].replace(/\D/g, '');
      await agentService.persistMessage(`${userId}_${cleanTo}`, userId, '[Áudio]', 'outbound', result.key?.id || `ai-${Date.now()}`, 'Cliente', to, cleanTo, 'Atendente', undefined, audioUrl || undefined);
    } catch (err) {}
    return { success: true, messageId: result.key?.id };
  }

  async sendMedia(userId: string, to: string, buffer: Buffer, mimetype: string, filename: string) {
    const instanceName = `wppai_${userId.substring(0, 8)}`;
    const result = await EvolutionApiService.sendMedia(instanceName, to, buffer.toString('base64'), mimetype, filename);
    try {
      const cleanTo = to.split('@')[0].replace(/\D/g, '');
      await agentService.persistMessage(`${userId}_${cleanTo}`, userId, `[Mídia]: ${filename}`, 'outbound', result.key?.id || `med-${Date.now()}`, 'Cliente', to, cleanTo, 'Atendente');
    } catch (err) {}
    return { success: true, messageId: result.key?.id };
  }


  // Novo método para ser chamado pelo Webhook (Agora via BullMQ)
  async triggerAIResponseViaWebhook(userId: string, from: string, body: string, contactName: string, cleanPhone: string, messageId: string, isAudio: boolean = false) {
    const jobId = `pending_ai:${userId}:${from}`;
    
    const cacheKey = `agent_config:${userId}`;
    let delaySeconds = 15;
    
    try {
      // Tentar buscar do Cache primeiro
      const cached = await redisService.get(cacheKey);
      if (cached) {
        delaySeconds = cached.response_delay || 15;
      } else {
        const { data: agent } = await supabase
          .from('agents')
          .select('response_delay')
          .eq('user_id', userId)
          .eq('status_ativo', true)
          .maybeSingle();
        
        if (agent) {
          delaySeconds = agent.response_delay || 15;
          // Cache por 10 minutos
          await redisService.set(cacheKey, { response_delay: delaySeconds }, 600);
        }
      }
    } catch (e) {
      console.warn(`[WhatsAppService] Cache/DB error for agent config:`, e);
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

      // LÓGICA DE ENVIO INTELIGENTE
      if (audioBuffer && usedVoiceMode === 'audio_only') {
        await EvolutionApiService.sendVoice(instanceName, from, audioBuffer.toString('base64'));
        const aiAudioUrl = await this.uploadToStorage(userId, audioBuffer, `ai_resp_${Date.now()}.ogg`);
        await agentService.persistMessage(
           `${userId}_${displayPhone}`, userId, '[Áudio]',
           'outbound', `${aiMsgId}-audio`, contactName, from, displayPhone,
           'Atendente', undefined, aiAudioUrl || undefined
        );
      } else {
        await EvolutionApiService.sendMessage(instanceName, from, finalResponseText);
        if (audioBuffer && usedVoiceMode === 'always') {
          const aiAudioUrl = await this.uploadToStorage(userId, audioBuffer, `ai_resp_${Date.now()}.ogg`);
          await EvolutionApiService.sendVoice(instanceName, from, audioBuffer.toString('base64'));
          await agentService.persistMessage(
            `${userId}_${displayPhone}`, userId, '[Áudio]',
            'outbound', `${aiMsgId}-audio`, contactName, from, displayPhone,
            'Atendente', undefined, aiAudioUrl || undefined
          );
        }
      }

      // 🔄 Agenda o Follow-up após o envio da resposta da IA
      await this.scheduleFollowUp(userId, from, 0);

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

        for (const profile of profiles) {
          const instanceName = profile.whatsapp_instance_id;
          
          try {
            // 1. Verificar Status Real vs Banco
            const realStatus = await EvolutionApiService.getInstanceStatus(instanceName);
            const mappedStatus = realStatus.state === 'open' ? 'connected' : (realStatus.state === 'connecting' ? 'connecting' : 'disconnected');
            
            if (mappedStatus !== profile.whatsapp_status) {
              console.log(`[WhatsAppService] 🔄 Status mismatch for ${instanceName}: DB=${profile.whatsapp_status}, Real=${mappedStatus}. Syncing...`);
              await this.updateProfileStatus(profile.id, { status: mappedStatus });
            }

            // 2. Garantir Webhook Ativo
            // Se estiver conectado, reforçamos a configuração do webhook para evitar perda de mensagens
            if (mappedStatus === 'connected') {
              await EvolutionApiService.setWebhook(instanceName);
            }

            // 3. Polling de Segurança (Apenas se houver discrepância ou para instâncias ativas)
            // Isso serve como redundância final
            if (mappedStatus === 'connected') {
              const messages = await EvolutionApiService.fetchMessages(instanceName);
              if (messages && messages.length > 0) {
                console.log(`[WhatsAppService] 🛡️ Safety Polling: Found ${messages.length} messages for ${instanceName}`);
                // O processamento aqui já é seguro devido à idempotência do Redis
                for (const msg of messages) {
                  const messageId = msg.key?.id;
                  if (messageId && !msg.key?.fromMe) {
                    // Trigger manual do processamento via webhook logic (idempotente)
                    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
                    const from = msg.key?.remoteJid;
                    if (body && from) {
                       const cleanFrom = from.split('@')[0].replace(/\D/g, '');
                       await this.triggerAIResponseViaWebhook(profile.id, from, body, msg.pushName || 'User', cleanFrom, messageId);
                    }
                  }
                }
              }
            }

          } catch (err) {
            console.error(`[WhatsAppService] Maintenance error for ${instanceName}:`, err);
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

