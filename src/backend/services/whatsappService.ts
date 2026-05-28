import { randomUUID } from 'crypto';
import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { supabase } from '../lib/supabaseClient.js';
import { agentService, logToDB } from './agentService.js';
import { EvolutionApiService } from './evolutionApiService.js';
import { WhatsAppProviderFactory } from '../providers/WhatsAppProviderFactory.js';
import { parseProviderError, recordMetaError } from '../providers/providerErrors.js';
import { MetaProvider } from '../providers/MetaProvider.js';
import { validateTemplateVariables, maskVariableValue, hashVariables, extractBodyParameters, type Violation } from '../lib/templateValidator.js';
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PushNotificationService } from './pushNotificationService.js';
import { whatsappService as selfRef } from './whatsappService.js'; // Para evitar circular dependency se necessário
import { redisService } from './redisService.js';
import { normalizePhone } from '../lib/phoneHelper.js';

// Cria conexao ioredis dedicada para BullMQ com listeners de socket detalhados.
// O BullMQ recomenda conexoes separadas para Queue e Worker (Worker faz BRPOPLPUSH
// bloqueante e nao pode dividir o socket com comandos normais).
function createBullMQConnection(label: string): Redis {
  const conn = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    username: process.env.REDIS_USERNAME || 'default',
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 200, 5000)
  });
  conn.on('connect',      () => console.log(`[BullMQ:${label}] socket connect`));
  conn.on('ready',        () => console.log(`[BullMQ:${label}] socket ready`));
  conn.on('error',        (err) => console.error(`[BullMQ:${label}] socket error: ${err.message}`));
  conn.on('close',        () => console.warn(`[BullMQ:${label}] socket close`));
  conn.on('reconnecting', (delay: any) => console.warn(`[BullMQ:${label}] socket reconnecting (delay=${delay}ms)`));
  conn.on('end',          () => console.warn(`[BullMQ:${label}] socket end`));
  return conn;
}



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
  private photoSyncQueue: Queue;
  private messageWorker: Worker | null = null;
  private followUpWorker: Worker | null = null;
  private photoSyncWorker: Worker | null = null;
  // Timers de delay gerenciados pelo Node — workaround para bug do scheduler
  // interno do BullMQ que nao move jobs delayed -> waiting neste ambiente Redis.
  private pendingAITimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    console.log('[WhatsAppService] Initializing with BullMQ...');

    // Conexoes ioredis explicitas e dedicadas. BullMQ recomenda conexoes
    // separadas para Queue e Worker.
    const queueConn       = createBullMQConnection('messageQueue');
    const workerConn      = createBullMQConnection('messageWorker');
    const followUpQConn   = createBullMQConnection('followUpQueue');
    const followUpWConn   = createBullMQConnection('followUpWorker');
    const photoSyncQConn  = createBullMQConnection('photoSyncQueue');
    const photoSyncWConn  = createBullMQConnection('photoSyncWorker');

    this.messageQueue   = new Queue('whatsapp-messages',     { connection: queueConn });
    this.followUpQueue  = new Queue('whatsapp-followups',    { connection: followUpQConn });
    this.photoSyncQueue = new Queue('profile-picture-sync',  { connection: photoSyncQConn });

    this.setupWorker(workerConn);
    this.setupFollowUpWorker(followUpWConn);
    this.setupPhotoSyncWorker(photoSyncWConn);
  }

  private setupWorker(connection: any) {
    this.messageWorker = new Worker('whatsapp-messages', async (job: Job) => {
      if (job.data?.__healthcheck) {
        const elapsed = Date.now() - (job.data.ts || 0);
        console.log(`[BullMQ] 🏥 HEALTHCHECK OK — worker processed job in ${elapsed}ms`);
        return;
      }
      console.log(`[BullMQ] Processing message job ${job.id} for ${job.data.from}`);
      await this.processAIResponse(job.data);
    }, {
      connection,
      // Limiter e concurrency removidos: havia bug do BullMQ 5.76 onde o worker
      // processava 1 job e travava — provavelmente pool de conexoes em estado
      // ruim com Redis ACL. concurrency: 1 simplifica e ja eh suficiente.
      concurrency: 1
    });

    this.messageWorker.on('ready',     () => console.log('[BullMQ] ✅ Message worker connected and listening'));
    this.messageWorker.on('active',    (job) => console.log(`[BullMQ] ▶️ Message job ${job.id} ACTIVE (worker picked it up)`));
    this.messageWorker.on('error',     (err) => console.error('[BullMQ] ❌ Message worker error:', err.message));
    this.messageWorker.on('stalled',   (jobId) => console.warn(`[BullMQ] ⚠️ Message job ${jobId} stalled`));
    this.messageWorker.on('drained',   () => console.log('[BullMQ] 💧 Message queue drained'));
    this.messageWorker.on('completed', (job) => console.log(`[BullMQ] ✅ Message job ${job.id} completed`));
    this.messageWorker.on('failed', (job, err) => {
      console.error(`[BullMQ] ❌ Message job ${job?.id} failed:`, err?.message || err);
      if (err?.stack) console.error(err.stack);
    });

    // Inspeciona estado + envia 2 healthchecks para distinguir o ponto de falha:
    //   A) immediate (sem delay) → testa o consumo basico do worker
    //   B) delayed 2s            → testa o scheduler interno (delayed -> waiting)
    // Se A funciona e B nao, o bug esta no scheduler do BullMQ e a solucao
    // eh mover o delay para setTimeout no Node em vez de usar delay do BullMQ.
    setTimeout(async () => {
      try {
        const counts = await this.messageQueue.getJobCounts(
          'waiting', 'active', 'delayed', 'failed', 'completed'
        );
        console.log(`[BullMQ] 📊 Queue 'whatsapp-messages' state on boot:`, counts);

        if ((counts as any).failed > 0) {
          const cleaned = await this.messageQueue.clean(0, 1000, 'failed');
          console.log(`[BullMQ] 🧹 Cleaned ${cleaned.length} failed jobs from queue`);
        }

        await this.messageQueue.add(
          'healthcheck-immediate',
          { __healthcheck: true, kind: 'immediate', ts: Date.now() },
          { removeOnComplete: true, removeOnFail: true }
        );
        console.log('[BullMQ] 🏥 Healthcheck IMMEDIATE enqueued (expect OK <500ms)');

        await this.messageQueue.add(
          'healthcheck-delayed',
          { __healthcheck: true, kind: 'delayed', ts: Date.now() },
          { delay: 2000, removeOnComplete: true, removeOnFail: true }
        );
        console.log('[BullMQ] 🏥 Healthcheck DELAYED(2s) enqueued (expect OK ~2s)');
      } catch (err: any) {
        console.error('[BullMQ] ❌ Healthcheck enqueue failed:', err?.message || err);
      }
    }, 5000);

    // Snapshot periodico da fila — SEMPRE loga (mesmo zerado) para detectar
    // worker travado em estado interno (BRPOPLPUSH preso, pool morto, etc.)
    setInterval(async () => {
      try {
        const c: any = await this.messageQueue.getJobCounts(
          'waiting', 'active', 'delayed', 'failed', 'completed', 'paused', 'prioritized', 'waiting-children'
        );
        console.log(`[BullMQ] 📊 periodic: waiting=${c.waiting} active=${c.active} delayed=${c.delayed} failed=${c.failed} completed=${c.completed} paused=${c.paused} prio=${c.prioritized}`);
      } catch (e: any) {
        console.warn(`[BullMQ] 📊 periodic failed: ${e?.message || e}`);
      }
    }, 15000);
  }

  private setupFollowUpWorker(connection: any) {
    this.followUpWorker = new Worker('whatsapp-followups', async (job: Job) => {
      console.log(`[FollowUp] ⏰ Processing ${job.name} for ${job.data.from}`);
      await this.processFollowUp(job.data);
    }, { connection, concurrency: 2 });

    this.followUpWorker.on('ready', () => console.log('[BullMQ] ✅ FollowUp worker connected'));
    this.followUpWorker.on('error', (err) => console.error('[BullMQ] ❌ FollowUp worker error:', err.message));
    this.followUpWorker.on('failed', (job, err) => {
      console.error(`[FollowUp] Job ${job?.id} failed:`, err);
    });
  }

  private setupPhotoSyncWorker(connection: any) {
    this.photoSyncWorker = new Worker('profile-picture-sync', async (job: Job) => {
      const { userId, threadId, remoteJid, force } = job.data;
      console.log(`[PhotoSync] 🔄 Processing job ${job.id} for thread ${threadId}`);
      await agentService.syncProfilePicture(userId, threadId, remoteJid, force ?? false);
    }, { connection, concurrency: 3, limiter: { max: 5, duration: 1000 } });

    this.photoSyncWorker.on('ready', () => console.log('[BullMQ] ✅ PhotoSync worker connected'));
    this.photoSyncWorker.on('error', (err) => console.error('[BullMQ] ❌ PhotoSync worker error:', err.message));
    this.photoSyncWorker.on('completed', (job) => {
      console.log(`[PhotoSync] ✅ Job ${job.id} completed for thread ${job.data.threadId}`);
    });
    this.photoSyncWorker.on('failed', (job, err) => {
      console.error(`[PhotoSync] ❌ Job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err.message);
    });
  }

  async enqueueProfilePictureSync(data: { userId: string; threadId: string; remoteJid: string; force?: boolean }) {
    try {
      await this.photoSyncQueue.add('sync-photo', data, {
        jobId: `photo-${data.threadId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 }
      });
    } catch (err) {
      console.warn('[PhotoSync] Failed to enqueue job:', err);
    }
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
    const jobId = `followup-${userId}-${from}`;
    let dbUserId = userId;
    
    try {
      if (userId.includes('@')) {
        const { data: prof } = await supabase.from('profiles').select('id').eq('email', userId).maybeSingle();
        if (prof?.id) dbUserId = prof.id;
      }

      const { data: agent } = await supabase
        .from('agents')
        .select('follow_ups')
        .eq('user_id', dbUserId)
        .eq('status_ativo', true)
        .maybeSingle();

      if (!agent?.follow_ups || !agent.follow_ups[level]) return;

      const config = agent.follow_ups[level];
      const delayMinutes = config.delayMinutes || 60;
      const delayMs = delayMinutes * 60 * 1000;

      const existingJob = await this.followUpQueue.getJob(jobId);
      if (existingJob) await existingJob.remove();

      await this.followUpQueue.add('send-followup', {
        userId: dbUserId,
        from,
        level,
        config
      }, {
        jobId,
        delay: delayMs,
        removeOnComplete: true,
        // attempts: 1 (sem retry). Retry em job de envio causa mensagem duplicada
        // — o envio em si nao eh idempotente (cria 2 registros, 2 wamids no Meta).
        attempts: 1
      });

      console.log(`[FollowUp] ✅ Auto level ${level + 1} scheduled for ${from} in ${delayMinutes}m`);
    } catch (err) {
      console.error('[FollowUp] Error scheduling auto:', err);
    }
  }

  async scheduleManualFollowUp(userId: string, from: string, message: string, delayMinutes: number, isAi: boolean = false) {
    const cleanPhone = normalizePhone(from);
    const threadId = `${userId}_${cleanPhone}`;
    const jobId = `followup-manual-${userId}-${cleanPhone}`;
    const delayMs = delayMinutes * 60 * 1000;
    const scheduledAt = new Date(Date.now() + delayMs).toISOString();

    try {
      // 1. Atualizar banco para controle visual no Front
      await supabase.from('threads').update({
        pending_followup: {
          message,
          scheduled_at: scheduledAt,
          type: isAi ? 'ai' : 'manual'
        }
      }).eq('id', threadId);

      // 2. Remover anterior se existir
      const existing = await this.followUpQueue.getJob(jobId);
      if (existing) await existing.remove();

      // 3. Agendar no BullMQ
      await this.followUpQueue.add('send-followup-manual', {
        userId,
        from,
        message,
        isAi,
        isManual: true
      }, {
        jobId,
        delay: delayMs,
        removeOnComplete: true,
        attempts: 1
      });

      console.log(`[FollowUp] ⏲️ Manual follow-up scheduled for ${from} in ${delayMinutes}m (AI: ${isAi})`);
    } catch (err) {
      console.error('[FollowUp] Error scheduling manual:', err);
    }
  }

  /**
   * Cancela qualquer follow-up pendente para o contato (ex: quando ele responde)
   */
  async cancelFollowUp(userId: string, from: string) {
    const cleanPhone = normalizePhone(from);
    const threadId = `${userId}_${cleanPhone}`;
    const autoJobId = `followup-${userId}-${from}`;
    const manualJobId = `followup-manual-${userId}-${cleanPhone}`;

    try {
      // Cancela Job Automático
      const autoJob = await this.followUpQueue.getJob(autoJobId);
      if (autoJob) await autoJob.remove();

      // Cancela Job Manual
      const manualJob = await this.followUpQueue.getJob(manualJobId);
      if (manualJob) {
        await manualJob.remove();
        // Limpa visual no banco se for manual
        await supabase.from('threads').update({ pending_followup: null }).eq('id', threadId);
      }

      console.log(`[FollowUp] 🛑 Cancelled all follow-ups for ${from} (customer replied)`);
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

  private async isTrialExpired(userId: string): Promise<boolean> {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('trial_ends_at, plano')
        .eq('id', userId)
        .maybeSingle();

      if (!profile) return false;
      if (profile.plano?.toLowerCase() !== 'trial') return false;
      if (!profile.trial_ends_at) return false;

      return new Date(profile.trial_ends_at).getTime() < Date.now();
    } catch (err) {
      console.error('[WhatsAppService] Error checking trial status:', err);
      return false;
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
    if (await this.isTrialExpired(userId)) {
      throw new Error('Seu período de teste expirou. Assine um plano para conectar seu WhatsApp.');
    }
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

      // Check for trial expiration
      if (await this.isTrialExpired(userId)) {
        const status = await provider.getStatus(instanceName);
        if (status.status === 'connected' || status.status === 'qrcode') {
           console.log(`[WhatsAppService] ⚠️ Trial expired for ${userId}. Forcing logout.`);
           await this.logout(userId).catch(() => {});
        }
        return { status: 'disconnected', trialExpired: true } as any;
      }

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

  async sendMessage(userId: string, to: string, message: string, senderName: string = 'Atendente', senderType: 'IA' | 'Atendente' = 'Atendente', quotedMessageId?: string): Promise<any> {
    if (!userId) {
      console.error('[WhatsAppService] ❌ ERROR: userId is undefined in sendMessage');
      return { success: false, error: 'User ID is required' };
    }
    const { data: prof } = await supabase.from('profiles').select('whatsapp_instance_id').eq('id', userId).single();

    const instanceName = prof?.whatsapp_instance_id || `wppai_${userId.substring(0, 8)}`;
    const cleanTo = normalizePhone(to);
    const threadId = `${userId}_${cleanTo}`;


    // ── FASE 2: Banco PRIMEIRO, API depois ─────────────────────────────
    // ── FASE 1: Busca Mensagem Original (se houver reply) ──────────────
    let quoted = undefined;
    if (quotedMessageId) {
      const { data: qMsg } = await supabase
        .from('messages')
        .select('direction, whatsapp_id, text')
        .or(`whatsapp_id.eq.${quotedMessageId},id.eq.${quotedMessageId}`)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (qMsg) {
        quoted = {
          id: qMsg.whatsapp_id || quotedMessageId,
          fromMe: qMsg.direction === 'outbound' || qMsg.direction === 'sent' || qMsg.direction === 'delivered',
          text: qMsg.text || '...'
        };
      } else {
        quoted = { id: quotedMessageId, fromMe: false, text: '...' };
      }
    }

    // ── FASE 2: Banco PRIMEIRO, API depois ─────────────────────────────
    const tempId = `sending-${Date.now()}-${cleanTo}`; // usado como whatsapp_id temporário
    const tempUUID = randomUUID();                       // uuid real para messages.id
    const sendTimestamp = Date.now();

    try {
      // 1. Atualiza thread com preview da mensagem (sidebar) PRIMEIRO
      // Isso evita erro de Foreign Key na inserção da mensagem
      const [{ data: existingThread }, { data: contactExact }] = await Promise.all([
        supabase.from('threads').select('contact_name, profile_picture_url, profile_picture_updated_at').eq('id', threadId).maybeSingle(),
        supabase.from('contacts').select('nome').eq('id', `${userId}_${cleanTo}`).maybeSingle()
      ]);

      // [FIX] Busca fuzzy por últimos 8 dígitos se a busca exata não encontrou
      let contact = contactExact;
      if (!contact?.nome && cleanTo.length >= 8) {
        const { data: fuzzy } = await supabase
          .from('contacts')
          .select('nome')
          .eq('user_id', userId)
          .ilike('telefone', `%${cleanTo.slice(-8)}`)
          .maybeSingle();
        if (fuzzy?.nome) contact = fuzzy;
      }

      // [FIX] Nunca salva número como contact_name
      const isPhone = (s: string) => !/[a-zA-Z]/.test(s) && s.replace(/\D/g, '').length >= 8;

      const resolvedContactName = (contact?.nome && !isPhone(contact.nome)) ? contact.nome 
        : (existingThread?.contact_name && !isPhone(existingThread.contact_name)) ? existingThread.contact_name
        : null;


      const threadUpsertData: Record<string, any> = {
        id: threadId,
        user_id: userId,
        last_message: message.substring(0, 1000),
        last_message_time: new Date(sendTimestamp).toISOString(),
        remote_jid: to.includes('@') ? to : `${cleanTo}@s.whatsapp.net`,
        display_phone: cleanTo,
        agent_name: senderName,
        updated_at: new Date(sendTimestamp).toISOString()
      };

      // Só inclui contact_name se encontramos um nome real (não número)
      if (resolvedContactName) threadUpsertData.contact_name = resolvedContactName;

      // Preserva a foto de perfil existente
      if (existingThread?.profile_picture_url) {
        threadUpsertData.profile_picture_url = existingThread.profile_picture_url;
        threadUpsertData.profile_picture_updated_at = existingThread.profile_picture_updated_at;
      }

      const { error: tErr } = await supabase.from('threads').upsert(threadUpsertData);

      if (tErr) {
        console.error('[WhatsAppService] ❌ CRITICAL THREAD UPSERT ERROR:', tErr);
      } else {
        console.log(`[WhatsAppService] 🧵 Thread updated for ${threadId} | name: ${resolvedContactName || '(preserved)'}`);
      }


      // 2. Persiste com status='sending' ANTES de chamar a API (E AGUARDA)
      const { error: mErr } = await supabase.from('messages').insert({
        id: tempUUID,       // uuid válido como PK
        whatsapp_id: tempId, // formato sending-* apenas no campo text
        user_id: userId,
        thread_id: threadId,
        text: message,
        direction: 'outbound',
        is_ai: senderType === 'IA',
        message_type: 'text',
        status: 'sending',
        timestamp: sendTimestamp,
        created_at: new Date(sendTimestamp).toISOString(),
        quoted_id: quoted?.id,
        quoted_text: quoted?.text
      });

      if (mErr) {
        console.warn('[WhatsAppService] ⚠️ Pre-persist (sending) failed:', mErr.message);
        await logToDB(userId, 'warning', 'persistence', `Pre-persist failed for ${tempId}`, mErr);
      }

      // 3. Chama o provider via Abstração — com retry para erros transitórios
      const provider = await WhatsAppProviderFactory.getProvider(userId);

      if (quoted) {
        console.log(`[WhatsAppService] 📤 Replying to message ${quoted.id} | text: ${quoted.text}`);
      }

      // Retry com backoff (1s, 3s, 9s) — NÃO retenta em erros permanentes
      // (24h window fechada, credenciais inválidas, 4xx específicos)
      const sendDelays = [1000, 3000, 9000];
      let result: any;
      for (let attempt = 0; attempt <= sendDelays.length; attempt++) {
        try {
          result = await provider.sendMessage(instanceName, to, message, quoted);
          break;
        } catch (err: any) {
          const errInfo = parseProviderError(err);
          // Erros permanentes não devem ser retentados
          if (errInfo.is24hWindowClosed || errInfo.isAuthError || attempt === sendDelays.length) {
            throw err;
          }
          const delay = sendDelays[attempt];
          console.warn(`[WhatsAppService] ⚠️ sendMessage para ${to} falhou (tentativa ${attempt + 1}): ${errInfo.message}. Tentando em ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
      const msgId = (result as any).messageId || (result as any).key?.id || tempId;

      // 4. Substitui o registro temporário pelo definitivo com o ID real do WhatsApp
      if (msgId !== tempId) {
        console.log(`[WhatsAppService] 💾 Attempting definitive persist for msg ${msgId}`);
        const { error } = await supabase.from('messages').insert({
          id: randomUUID(),   // uuid válido como PK
          whatsapp_id: msgId, // wamid/id real do WhatsApp no campo text
          user_id: userId,
          thread_id: threadId,
          text: message,
          direction: 'outbound',
          is_ai: senderType === 'IA',
          message_type: 'text',
          status: 'sent',
          timestamp: sendTimestamp,
          created_at: new Date(sendTimestamp).toISOString(),
          quoted_id: quoted?.id,
          quoted_text: quoted?.text
        });

 
        if (error) {
          if (error.code === '23505') {
            console.log(`[WhatsAppService] 🔄 Conflict: Webhook already persisted ${msgId}. Updating status.`);
            const { error: upErr } = await supabase.from('messages')
              .update({ status: 'sent', thread_id: threadId })
              .eq('whatsapp_id', msgId)
              .eq('user_id', userId);
            
            if (!upErr) {
              await supabase.from('messages').delete().eq('id', tempUUID);
            } else {
              console.error('[WhatsAppService] ❌ Failed to update existing message during conflict:', upErr);
            }
          } else {
            console.error('[WhatsAppService] ❌ Definitive persist failed:', error);
            // Se falhou o definitivo mas temos o tempUUID, atualiza o status do temp
            // para o usuário não "perder" a mensagem visualmente.
            await supabase.from('messages').update({ status: 'sent', whatsapp_id: msgId }).eq('id', tempUUID);
          }
        } else {
          console.log(`[WhatsAppService] ✅ Definitive persist success for ${msgId}. Cleaning up temp ${tempId}.`);
          await supabase.from('messages').delete().eq('id', tempUUID);
        }
      } else {
        console.log(`[WhatsAppService] ℹ️ API returned same ID as temp. Just updating status for ${tempId}.`);
        await supabase.from('messages').update({ status: 'sent' }).eq('id', tempUUID);
      }

      console.log(`[WhatsAppService] ✅ Message sent and persisted: ${msgId}`);

      // 5. Agenda follow-up
      if (senderName !== 'IA (FOLLOW-UP)') {
        await this.scheduleFollowUp(userId, to, 0);
      }

      return { success: true, messageId: msgId };
    } catch (err: any) {
      // API falhou — marca a mensagem temporária como 'failed'
      const info = parseProviderError(err);
      const failureStatus = info.is24hWindowClosed ? 'failed_24h_window' : 'failed';
      console.error(`[WhatsAppService] ❌ sendMessage to ${to} (${info.provider}): ${info.message}`);
      if (info.is24hWindowClosed) {
        console.warn(`[WhatsAppService] ⚠️ Meta 24h window closed for ${to}. Use an approved template to re-engage.`);
      }
      if (info.isAuthError) {
        console.error(`[WhatsAppService] 🔑 Auth error — credentials may be invalid/expired for user ${userId}.`);
      }
      await supabase.from('messages').update({ status: failureStatus }).eq('id', tempId);
      await logToDB(userId, 'error', 'send-message', info.message, info.raw || err);
      recordMetaError(userId, info, supabase);
      return { success: false, error: info.message, errorInfo: info };
    }

  }


  /**
   * Sends an approved Meta template. Required for re-engagement outside the 24h window.
   * Only works when the tenant's provider is meta_official.
   */
  async sendTemplate(
    userId: string,
    to: string,
    templateName: string,
    languageCode: string = 'pt_BR',
    components?: any[],
    bodyText?: string   // Corpo real do template (opcional) — usado para armazenar texto legível no chat
  ): Promise<{ success: boolean; messageId?: string; error?: string; errorInfo?: any; warnings?: Violation[] }> {
    if (!userId) return { success: false, error: 'userId is required' };

    const { data: prof } = await supabase
      .from('profiles')
      .select('whatsapp_provider')
      .eq('id', userId)
      .maybeSingle();
    if (prof?.whatsapp_provider !== 'meta_official') {
      return { success: false, error: 'Templates are only supported on the meta_official provider' };
    }

    const cleanTo = normalizePhone(to);
    const threadId = `${userId}_${cleanTo}`;
    const tempId = `tpl-sending-${Date.now()}-${cleanTo}`; // whatsapp_id temporário
    const tempUUID = randomUUID();                           // uuid real para messages.id
    const sendTimestamp = Date.now();

    // Template Defense — Camada 3: valida variáveis antes de chamar Meta
    const variables = extractBodyParameters(components);

    // Texto armazenado no chat: usa o corpo real do template com variáveis substituídas.
    // Se o caller não passou bodyText, busca na Meta (best-effort) para evitar o placeholder feio.
    let resolvedBodyText = bodyText;
    if (!resolvedBodyText) {
      try {
        const tplProvider = new MetaProvider(userId);
        const templates = await tplProvider.listTemplates(userId, { limit: 200 });
        const tpl = templates?.find((t: any) => t.name === templateName);
        const bodyComp = tpl?.components?.find((c: any) => c.type === 'BODY');
        resolvedBodyText = bodyComp?.text || undefined;
      } catch {
        // best-effort — segue para o fallback
      }
    }
    let previewText = `[Template: ${templateName}]`;
    if (resolvedBodyText) {
      previewText = resolvedBodyText;
      variables.forEach((val, idx) => {
        previewText = previewText.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g'), val);
      });
    }
    const { warnings, blocked } = validateTemplateVariables(variables);
    const variablesMasked = variables.map((v, i) => ({ idx: i + 1, value_masked: maskVariableValue(v) }));
    const variablesHash = hashVariables(variables);

    // Block hard violations (empty/too_long) — Meta rejeita do lado deles
    if (blocked.length > 0) {
      console.warn(`[WhatsAppService] 🛑 sendTemplate "${templateName}" blocked locally:`, blocked.map(b => b.message).join('; '));
      await supabase.from('template_send_log').insert({
        user_id: userId,
        template_name: templateName,
        language_code: languageCode,
        to_phone: cleanTo,
        variables_masked: variablesMasked,
        variables_hash: variablesHash,
        warnings: [...warnings, ...blocked],
        status: 'blocked_local',
        error_message: blocked[0].message,
      });
      return {
        success: false,
        error: blocked[0].message,
        errorInfo: { code: 'blocked_local', is24hWindowClosed: false, isAuthError: false },
        warnings: blocked,
      };
    }

    // Resolve contact name so the thread doesn't fall back to 'Lead WhatsApp'
    const [{ data: existingTplThread }, { data: contactExact }] = await Promise.all([
      supabase.from('threads').select('contact_name').eq('id', threadId).maybeSingle(),
      supabase.from('contacts').select('nome').eq('user_id', userId).ilike('telefone', `%${cleanTo.slice(-8)}`).maybeSingle(),
    ]);
    const isPhone = (s: string) => !/[a-zA-Z]/.test(s) && s.replace(/\D/g, '').length >= 8;
    const resolvedTplContactName =
      (contactExact?.nome && !isPhone(contactExact.nome)) ? contactExact.nome
      : (existingTplThread?.contact_name && !isPhone(existingTplThread.contact_name)) ? existingTplThread.contact_name
      : null;

    // Pre-persist with status='sending' so the UI reflects the outbound attempt immediately
    const tplThreadData: Record<string, any> = {
      id: threadId,
      user_id: userId,
      last_message: previewText,
      last_message_time: new Date(sendTimestamp).toISOString(),
      remote_jid: to.includes('@') ? to : `${cleanTo}@s.whatsapp.net`,
      display_phone: cleanTo,
      updated_at: new Date(sendTimestamp).toISOString(),
    };
    if (resolvedTplContactName) tplThreadData.contact_name = resolvedTplContactName;
    await supabase.from('threads').upsert(tplThreadData);
    await supabase.from('messages').insert({
      id: tempUUID,        // uuid válido como PK
      whatsapp_id: tempId, // tpl-sending-* apenas no campo text
      user_id: userId,
      thread_id: threadId,
      text: previewText,
      direction: 'outbound',
      message_type: 'template',
      status: 'sending',
      timestamp: sendTimestamp,
      created_at: new Date(sendTimestamp).toISOString(),
    });

    try {
      const provider = new MetaProvider(userId);
      const result = await provider.sendTemplate(userId, to, templateName, languageCode, components);
      const msgId = result.messageId || tempId;

      if (msgId !== tempId) {
        const { error: insErr } = await supabase.from('messages').insert({
          id: randomUUID(),   // uuid válido como PK
          whatsapp_id: msgId, // wamid real no campo text
          user_id: userId,
          thread_id: threadId,
          text: previewText,
          direction: 'outbound',
          message_type: 'template',
          status: 'sent',
          timestamp: sendTimestamp,
          created_at: new Date(sendTimestamp).toISOString(),
        });
        if (insErr && insErr.code === '23505') {
          await supabase.from('messages').update({ status: 'sent' }).eq('whatsapp_id', msgId).eq('user_id', userId);
        }
        await supabase.from('messages').delete().eq('id', tempUUID);
      } else {
        await supabase.from('messages').update({ status: 'sent' }).eq('id', tempUUID);
      }

      console.log(`[WhatsAppService] ✅ Template "${templateName}" sent to ${to}: ${msgId}${warnings.length ? ` (${warnings.length} warnings)` : ''}`);

      await supabase.from('template_send_log').insert({
        user_id: userId,
        template_name: templateName,
        language_code: languageCode,
        to_phone: cleanTo,
        variables_masked: variablesMasked,
        variables_hash: variablesHash,
        warnings: warnings.length > 0 ? warnings : null,
        status: 'sent',
        meta_message_id: msgId,
      });

      return { success: true, messageId: msgId, warnings: warnings.length > 0 ? warnings : undefined };
    } catch (err: any) {
      const info = parseProviderError(err);
      console.error(`[WhatsAppService] ❌ sendTemplate (${info.provider}) "${templateName}": ${info.message}`);
      await supabase.from('messages').update({ status: 'failed' }).eq('id', tempId);
      await logToDB(userId, 'error', 'send-template', info.message, info.raw || err);
      recordMetaError(userId, info, supabase);

      await supabase.from('template_send_log').insert({
        user_id: userId,
        template_name: templateName,
        language_code: languageCode,
        to_phone: cleanTo,
        variables_masked: variablesMasked,
        variables_hash: variablesHash,
        warnings: warnings.length > 0 ? warnings : null,
        status: 'failed',
        error_message: info.message,
      });

      return { success: false, error: info.message, errorInfo: info, warnings: warnings.length > 0 ? warnings : undefined };
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

      // 2. Se for outbound, tenta apagar no WhatsApp via Provider (para todos)
      if (msg.direction === 'outbound') {
         const { data: prof } = await supabase.from('profiles').select('whatsapp_instance_id').eq('id', userId).single();
         const instanceName = prof?.whatsapp_instance_id || `wppai_${userId.substring(0, 8)}`;
         const provider = await WhatsAppProviderFactory.getProvider(userId);
         
         // No WhatsApp, apagamos para todos (fromMe: true)
         const remoteJid = msg.thread_id.includes('_') 
           ? msg.thread_id.split('_')[1] + '@s.whatsapp.net' 
           : msg.thread_id;
         await provider.deleteMessage(instanceName, remoteJid, msg.whatsapp_id || messageId, true).catch(err => {
           console.warn('[WhatsAppService] Could not delete message from WhatsApp (already deleted or API error):', err?.message);
         });
      }

      // 3. Se houver mídia (URL do Storage), apaga o arquivo físico para economizar espaço
      for (const urlField of [msg.media_url, msg.audio_url]) {
        if (!urlField) continue;
        for (const bucket of ['chat-audios', 'whatsapp-sessions']) {
          if (urlField.includes(`${bucket}/`)) {
            try {
              const filePath = urlField.split(`${bucket}/`).pop();
              if (filePath) {
                await supabase.storage.from(bucket).remove([filePath]);
                console.log(`[WhatsAppService] 🗑️ Deleted physical file: ${bucket}/${filePath}`);
              }
            } catch (storageErr) {
              console.warn('[WhatsAppService] Failed to delete file from storage (ignoring):', storageErr);
            }
          }
        }
      }

      // 4. DELEÇÃO REAL DO REGISTRO NO BANCO (não apenas mascarar)
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('user_id', userId);

      if (error) throw error;
      console.log(`[WhatsAppService] 🗑️ Message ${messageId} permanently deleted from DB.`);
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
    let dbUserId = userId;
    try {
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
      const info = parseProviderError(err);
      console.error(`[WhatsAppService] sendReaction (${info.provider}) to ${messageId}: ${info.message}`);
      recordMetaError(dbUserId, info, supabase);
      return { success: false, error: info.message, errorInfo: info };
    }
  }

  async sendVoice(userId: string, to: string, audioBuffer: Buffer) {
    const instanceName = await this.getInstanceName(userId);
    const provider = await WhatsAppProviderFactory.getProvider(userId);

    // Upload primeiro: Meta exige URL pública. Evolution aceita ambos.
    const audioUrl = await this.uploadToStorage(userId, audioBuffer, `manual_${Date.now()}.ogg`);
    if (!audioUrl) {
      const errMsg = 'Failed to upload voice to storage';
      console.error(`[WhatsAppService] ❌ ${errMsg}`);
      return { success: false, error: errMsg };
    }

    try {
      const result = await provider.sendMedia(instanceName, to, audioUrl, undefined, 'audio');
      const cleanTo = normalizePhone(to);
      const threadId = `${userId}_${cleanTo}`;

      await agentService.persistMessage(
        threadId,
        userId,
        '[Áudio]',
        'outbound',
        result.messageId || `ai-${Date.now()}`,
        undefined,
        to,
        cleanTo,
        'Atendente',
        undefined,
        audioUrl,
        'audio',
        audioUrl
      );
      return { success: true, messageId: result.messageId };
    } catch (err: any) {
      const info = parseProviderError(err);
      console.error(`[WhatsAppService] ❌ sendVoice failed (${info.provider}): ${info.message}`);
      await logToDB(userId, 'error', 'send-voice', info.message, info.raw || err);
      recordMetaError(userId, info, supabase);
      return { success: false, error: info.message, errorInfo: info };
    }
  }

  async sendMedia(userId: string, to: string, buffer: Buffer, mimetype: string, filename: string, caption?: string) {
    const instanceName = await this.getInstanceName(userId);
    const provider = await WhatsAppProviderFactory.getProvider(userId);
    const type = mimetype.startsWith('image') ? 'image' : mimetype.startsWith('video') ? 'video' : 'document';

    // Upload primeiro: Meta Cloud API exige URL pública (link). Evolution
    // também aceita URL, então essa ordem é compatível com ambos os providers.
    const mediaUrl = await this.uploadToStorage(userId, buffer, filename);
    if (!mediaUrl) {
      const errMsg = 'Failed to upload media to storage';
      console.error(`[WhatsAppService] ❌ ${errMsg}`);
      return { success: false, error: errMsg };
    }

    try {
      const result = await provider.sendMedia(instanceName, to, mediaUrl, caption || filename, type);
      const cleanTo = normalizePhone(to);
      const threadId = `${userId}_${cleanTo}`;

      await agentService.persistMessage(
        threadId,
        userId,
        caption || `[Mídia]: ${filename}`,
        'outbound',
        result.messageId || `med-${Date.now()}`,
        undefined,
        to,
        cleanTo,
        'Atendente',
        undefined,
        undefined,
        type,
        mediaUrl,
        mimetype,
        filename,
        caption
      );
      return { success: true, messageId: result.messageId };
    } catch (err: any) {
      const info = parseProviderError(err);
      console.error(`[WhatsAppService] ❌ sendMedia failed (${info.provider}): ${info.message}`);
      await logToDB(userId, 'error', 'send-media', info.message, info.raw || err);
      recordMetaError(userId, info, supabase);
      return { success: false, error: info.message, errorInfo: info };
    }
  }


  // Novo método para ser chamado pelo Webhook (Agora via BullMQ)
  async triggerAIResponseViaWebhook(userId: string, from: string, body: string, contactName: string, cleanPhone: string, messageId: string, isAudio: boolean = false, mediaUrl?: string, mediaMimeType?: string, agentId?: string | null) {
    const jobId = `pending_ai:${userId}:${from}`;
    
    const cacheKey = `agent_config:${userId}`;
    let delaySeconds = 15;
    
    try {
      // 1. Sempre buscar do banco para garantir tempo real (ou cache curto)
      const { data: agent, error: agentErr } = await supabase
        .from('agents')
        .select('response_delay')
        .eq('user_id', userId)
        .eq('status_ativo', true)
        .limit(1)
        .maybeSingle();

      if (agentErr) {
        console.warn(`[WhatsAppService] ⚠️ Agent config query failed for ${userId}: ${agentErr.message}. Using default 15s delay.`);
      } else if (agent) {
        delaySeconds = agent.response_delay || 15;
        console.log(`[WhatsAppService] ⚙️ Config found for ${userId}: delay=${delaySeconds}s`);
      } else {
        console.warn(`[WhatsAppService] ⚠️ No active agent found for ${userId}, using default 15s delay.`);
      }
    } catch (e) {
      console.warn(`[WhatsAppService] DB error for agent config:`, e);
    }

    console.log(`[WhatsAppService] ⏳ Scheduling AI response for ${from} in ${delaySeconds}s (Node timer)`);

    // 🛑 Cancela follow-ups pendentes pois o cliente acabou de mandar uma mensagem
    try {
      await this.cancelFollowUp(userId, from);
    } catch (e: any) {
      console.warn(`[WhatsAppService] cancelFollowUp failed: ${e?.message || e}`);
    }

    // Buffer para agrupamento (mensagens em sequência são concatenadas)
    try {
      await redisService.pushToBuffer(userId, from, body);
    } catch (e: any) {
      console.warn(`[WhatsAppService] pushToBuffer failed: ${e?.message || e}`);
    }

    // Debounce em memoria: cancela qualquer timer anterior para este (userId, from).
    // Garante que apenas o ULTIMO timer dispara — mensagens em sequencia que chegam
    // antes do delay sao agrupadas via buffer (acima).
    const existingTimer = this.pendingAITimers.get(jobId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      console.log(`[WhatsAppService] 🔄 Reset timer for ${from} (debounce)`);
    }

    const jobData = {
      profileId: userId,
      userId,
      from,
      body,
      contactName,
      displayPhone: cleanPhone,
      messageId,
      isAudio,
      mediaUrl,
      mediaMimeType,
      agentId: agentId ?? null
    };

    // Processa diretamente quando o timer dispara — sem BullMQ no caminho.
    // O BullMQ Worker neste ambiente (Coolify/Redis com proxy) fica preso no
    // BRPOPLPUSH apos esvaziar a fila e nao recebe notificacao de novos jobs.
    // Chamando processAIResponse diretamente eliminamos o problema.
    const timer = setTimeout(async () => {
      this.pendingAITimers.delete(jobId);
      console.log(`[WhatsAppService] ▶️ Triggering AI response for ${from} (direct, after ${delaySeconds}s wait)`);
      try {
        await this.processAIResponse(jobData);
        console.log(`[WhatsAppService] ✅ AI response cycle completed for ${from}`);
      } catch (e: any) {
        console.error(`[WhatsAppService] ❌ AI response failed for ${from}: ${e?.message || e}`);
        if (e?.stack) console.error(e.stack);
      }
    }, delaySeconds * 1000);

    // Importante: Node nao mantem o processo vivo apenas por causa do timer
    timer.unref();
    this.pendingAITimers.set(jobId, timer);
  }

  // Método interno que processa a lógica de IA (chamado pelo Worker do BullMQ)
  private async processAIResponse(data: any) {
    const { userId, from, body, contactName, displayPhone, messageId, isAudio, mediaUrl, mediaMimeType, agentId } = data;
    const instanceName = `wppai_${userId.substring(0, 8)}`;

    try {
      console.log(`[WhatsAppService] 🚀 Processing AI response for ${from} (BullMQ Worker)`);

      // 🛑 Idempotência: Verifica se já houve uma resposta da IA outbound recente para esta thread (últimos 30s)
      // para evitar duplicatas por retentativa de webhook/job.
      // IMPORTANTE: Filtra apenas is_ai=true para não bloquear o agente quando o usuário
      // responde pouco após receber uma mensagem manual/template (disparo de teste, piloto automático etc.)
      const thirtySecondsAgo = Date.now() - 30000;
      const cleanPhone = normalizePhone(from);
      const threadId = `${userId}_${cleanPhone}`;

      const { data: recentReply } = await supabase
        .from('messages')
        .select('id')
        .eq('thread_id', threadId)
        .eq('direction', 'outbound')
        .eq('is_ai', true)
        .gte('timestamp', thirtySecondsAgo)
        .limit(1)
        .maybeSingle();

      if (recentReply) {
        console.log(`[WhatsAppService] 🛡️ Idempotency: AI response already sent recently for ${from}. Skipping.`);
        return;
      }

      // [FIX] Recupera todas as mensagens do buffer e concatena (Agrupamento)
      const bufferedMessages = await redisService.getAndClearBuffer(userId, from);
      let finalBody = body;
      
      if (bufferedMessages.length > 0) {
        // Remove duplicatas se houver (por segurança) e junta com \n
        const uniqueMessages = Array.from(new Set(bufferedMessages));
        finalBody = uniqueMessages.join('\n');
        console.log(`[WhatsAppService] 🧩 Grouped ${bufferedMessages.length} messages for ${from}`);
      }

      if (await this.isTrialExpired(userId)) {
        console.log(`[WhatsAppService] 🛑 Skipping AI response for ${from}: Trial expired for user ${userId}`);
        return;
      }

      const aiResponse = await agentService.processIncoming(userId, {
        from, body: finalBody, contactName, messageId,
        displayPhone: displayPhone,
        skipPersist: true,
        isAudioRequest: isAudio,
        mediaUrl,
        mediaMimeType,
        agentId: agentId ?? null
      });

      // 🛡️ PROTEÇÃO: Se a IA não retornou resposta (ex: modo humano ou ignorado), para por aqui sem quebrar
      if (!aiResponse || (typeof aiResponse === 'object' && (aiResponse as any).status === 'human')) {
        // Modo Humano: notificar operador pois é ele quem precisa responder
        // 🚀 DEDUPLICAÇÃO ATÔMICA: Garante que só enviamos 1 push por ID de mensagem do WhatsApp
        // Independente se é New Lead ou mensagem comum
        const wasFirstId = await redisService.markAsProcessed(`push_notified:${messageId}`, 3600);
        
        // 🛡️ Camada Extra: Deduplicação por conteúdo (evita spam se o ID falhar ou mudar)
        const bodyHash = Buffer.from(`${userId}:${from}:${finalBody.substring(0, 100)}`).toString('base64');
        const wasFirstBody = await redisService.markAsProcessed(`push_notified_body:${bodyHash}`, 5); // 5s lock para spam rápido
        
        if (wasFirstId && wasFirstBody) {
          // Detectar se é New Lead aqui dentro
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('thread_id', threadId)
            .eq('direction', 'inbound');

          const isNewLead = count === 1;
          const title = isNewLead 
            ? `🆕 Novo Lead: ${contactName || from.split('@')[0]}`
            : `🔔 ${contactName || 'Cliente'} enviou mensagem`;

          console.log(`[WhatsAppService] 🔔 Sending notification for msg ${messageId} | NewLead: ${isNewLead}`);
          
          await PushNotificationService.sendPushNotification(
            userId,
            title,
            finalBody,
            `/inbox?jid=${from}`
          );
        } else {
          console.log(`[WhatsAppService] 🛡️ Skipping duplicate notification for msg ${messageId}`);
        }

        return;
      }

      const aiResponseData = typeof aiResponse === 'string' ? { text: aiResponse } : aiResponse;
      const finalResponseText = (aiResponseData as any)?.text;
      const audioBuffer = (aiResponseData as any)?.audioBuffer;
      const usedVoiceMode = (aiResponseData as any)?.voiceMode || 'disabled';
      const aiMsgId = (aiResponseData as any)?.aiMsgId;

      if (!finalResponseText || finalResponseText.trim().length === 0) return;
 
      // [FIX] Lógica de Respostas Picadas (Human-like Split)
      const cleanMarkdown = (text: string) => {
        return text
          .replace(/\*\*(.*?)\*\*/g, '$1') // Remove negrito
          .replace(/\*(.*?)\*/g, '$1')   // Remove itálico
          .replace(/\[(.*?)\]\((.*?)\)/g, '$1') // Remove links
          .replace(/^#+\s+/gm, '')       // Remove headers
          .replace(/`(.*?)`/g, '$1')     // Remove code blocks
          .replace(/_{1,2}(.*?)_{1,2}/g, '$1'); // Remove underline
      };

      const cleanedText = cleanMarkdown(finalResponseText);
      
      // Divide a mensagem em partes (conforme lógica do n8n para humanização)
      // 1. Primeiro separa por quebras de linha explícitas
      // 2. Depois, se algum bloco for longo, quebra por sentenças (., !, ?) mantendo a pontuação
      const messageParts = cleanedText
        .split(/\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .flatMap(part => {
          // Se a parte for maior que 40 caracteres, tenta quebrar em frases menores
          if (part.length > 40) {
            // Quebra após ponto final, exclamação ou interrogação que seja seguido por espaço e letra maiúscula
            return part.split(/(?<=[.?!])\s+(?=[A-ZÀ-Ÿ])/).filter(p => p.length > 0);
          }
          return [part];
        })
        .map(p => p.trim())
        .filter(p => p.length > 0);

      // Busca dados do agente para usar o nome correto no chat
      const { data: agentData } = await supabase.from('agents').select('nome').eq('user_id', userId).eq('status_ativo', true).maybeSingle();
 
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
        // Envia cada parte da mensagem sequencialmente (Picado)
        for (let i = 0; i < messageParts.length; i++) {
          const part = messageParts[i];
          
          await this.sendMessage(userId, from, part, agentData?.nome || 'Sofia', 'IA');
          
          // Se houver mais partes, calcula um delay dinâmico (simulação de tempo de digitação)
          if (i < messageParts.length - 1) {
            const nextPart = messageParts[i + 1];
            // 1 segundo base + 30ms por caractere da próxima mensagem (máximo 6 segundos)
            const dynamicDelay = Math.min(Math.max(1000 + (nextPart.length * 30), 1500), 6000);
            
            console.log(`[WhatsAppService] ⏳ Typing simulation: waiting ${dynamicDelay}ms for next part`);
            await new Promise(resolve => setTimeout(resolve, dynamicDelay));
          }
        }

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
   * Processa a execução do Follow-up (Níveis configurados ou Manual)
   */
  private async processFollowUp(data: any) {
    const { userId, from, level, config, message, isAi, isManual } = data;
    const cleanPhone = normalizePhone(from);
    const threadId = `${userId}_${cleanPhone}`;

    console.log(`[FollowUp] 🚀 Starting processFollowUp for ${from} (Manual: ${isManual}, Level: ${level || 0})`);

    try {
      // Idempotencia: BullMQ deste ambiente as vezes marca jobs como 'stalled'
      // e reexecuta, causando follow-up duplicado no banco e (as vezes) no lead.
      // Chave Redis com TTL de 1h impede dupla execucao para o mesmo (thread, level).
      const idemKey = `followup_done:${threadId}:${isManual ? 'manual' : `auto-${level || 0}`}`;
      const isFirst = await redisService.markAsProcessed(idemKey, 3600);
      if (!isFirst) {
        console.log(`[FollowUp] 🛡️ Idempotency: follow-up already sent for ${threadId} (key=${idemKey}). Skipping duplicate.`);
        return;
      }

      // 1. Verificar status da thread
      const { data: thread } = await supabase
        .from('threads')
        .select('status, pending_followup')
        .eq('id', threadId)
        .maybeSingle();

      if (!thread || (thread.status !== 'ia' && !isManual)) {
        console.log(`[FollowUp] 🛑 Skipping for ${from}: Thread is in human mode and job is not manual.`);
        return;
      }

      // 1.5. Verificar se o contato já agendou ou se tornou cliente/resolvido
      const [{ data: contact }, { data: appointment }] = await Promise.all([
        supabase
          .from('contacts')
          .select('status_funil')
          .eq('user_id', userId)
          .eq('telefone', cleanPhone)
          .maybeSingle(),
        supabase
          .from('appointments')
          .select('id')
          .eq('user_id', userId)
          .eq('client_phone', cleanPhone)
          .eq('status', 'confirmed')
          .maybeSingle()
      ]);

      if (appointment && !isManual) {
        console.log(`[FollowUp] 🛑 Skipping auto follow-up for ${from} because they have a confirmed appointment.`);
        return;
      }

      if (contact && (contact.status_funil === 'Cliente' || contact.status_funil === 'Resolvido') && !isManual) {
        console.log(`[FollowUp] 🛑 Skipping auto follow-up for ${from} because contact status is ${contact.status_funil}.`);
        return;
      }

      // 2. Definir a mensagem
      let finalMessage = message || config?.message;

      if (isAi || (config?.type === 'ai')) {
        console.log(`[FollowUp] 🧠 Generating AI message (Manual: ${!!isManual})...`);
        
        const aiResponse = await agentService.processIncoming(userId, {
          from,
          body: isManual 
            ? `[SISTEMA: O cliente parou de responder. Envie um follow-up de reengajamento agora. Instrução do humano: ${message || 'Seja amigável'}]`
            : `[SISTEMA: O cliente parou de responder. Envie um follow-up de reengajamento seguindo esta instrução: ${config.extraPrompt}]`,
          contactName: undefined,
          messageId: `followup-gen-${Date.now()}`,
          displayPhone: cleanPhone,
          skipPersist: true
        });

        const aiResponseData = typeof aiResponse === 'string' ? { text: aiResponse } : aiResponse;
        finalMessage = aiResponseData?.text;
      }

      if (!finalMessage) {
        console.warn(`[FollowUp] ⚠️ No message generated/found for ${from}. Skipping.`);
        return;
      }

      // 3. Enviar
      await this.sendMessage(userId, from, finalMessage, isManual ? 'Follow-up' : 'IA (FOLLOW-UP)', 'IA');

      // 4. Limpar banco e agendar próximo nível se for automático
      if (isManual) {
        await supabase.from('threads').update({ pending_followup: null }).eq('id', threadId);
      } else {
        await this.scheduleFollowUp(userId, from, level + 1);
      }

    } catch (err) {
      console.error(`[FollowUp] Error processing for ${from}:`, err);
      throw err;
    }
  }

  async initializeAllSessions() {
    console.log('[WhatsAppService] 🚀 initializeAllSessions: Forcing immediate sync...');
    
    // Roda a manutenção/sincronização uma vez agora (sem esperar o interval)
    this.runMaintenanceSync().catch(err => {
       console.error('[WhatsAppService] Initial sync failed:', err);
    });

    this.startMaintenanceWorker();

    // Rodar limpeza de storage uma vez ao dia (ou a cada 24h)
    setInterval(() => this.cleanupOldStorageFiles(), 86400000);
    // Rodar uma vez agora no boot
    this.cleanupOldStorageFiles();

    // Meta quality monitoring — probe a cada 30 min cada tenant em meta_official
    // e detecta degradação de qualidade do número OU token inválido/expirado.
    setInterval(() => this.runMetaQualitySync().catch(() => {}), 30 * 60 * 1000);
    setTimeout(() => this.runMetaQualitySync().catch(() => {}), 60_000);

    // Template quality snapshots — registra quality_score a cada 6h para histórico
    // de tendência. Só insere nova linha quando o score muda (sem duplicatas).
    import('../services/templateQualityWorker.js').then(({ runTemplateQualitySnapshot }) => {
      setInterval(() => runTemplateQualitySnapshot().catch(() => {}), 6 * 60 * 60 * 1000);
      setTimeout(() => runTemplateQualitySnapshot().catch(() => {}), 5 * 60 * 1000);
    }).catch(() => {});
  }

  /**
   * Verifica a saúde de cada tenant em meta_official: faz um GET no
   * /{phone_id} e compara quality_rating com o que estava registrado.
   * Se mudar para YELLOW/RED ou se o token falhar, registra o erro no
   * profile (meta_last_error) e dispara notificação push aos admins.
   */
  async runMetaQualitySync() {
    try {
      const axios = (await import('axios')).default;
      const { notifyAdminOfMetaIncident } = await import('../lib/metaIncidentNotifier.js');
      const META_BASE = 'https://graph.facebook.com/v19.0';

      const { data: tenants } = await supabase
        .from('profiles')
        .select('id, email, meta_phone_id, meta_access_token')
        .eq('whatsapp_provider', 'meta_official')
        .not('meta_access_token', 'is', null)
        .not('meta_phone_id', 'is', null);

      if (!tenants || tenants.length === 0) return;
      console.log(`[MetaQualitySync] 🔍 Probing ${tenants.length} Meta tenants...`);

      for (const t of tenants) {
        try {
          const { data } = await axios.get(`${META_BASE}/${t.meta_phone_id}`, {
            params: { fields: 'quality_rating,name_status,code_verification_status' },
            headers: { Authorization: `Bearer ${t.meta_access_token}` },
            timeout: 10000,
          });
          const q = (data?.quality_rating || '').toUpperCase();
          // Persist current quality so the AdminPanel can show it (overrides
          // last_error when probe succeeded)
          await supabase.from('profiles').update({
            meta_last_error: q === 'RED' || q === 'YELLOW' ? `phone_quality: ${q}` : null,
            meta_last_error_at: q === 'RED' || q === 'YELLOW' ? new Date().toISOString() : null,
          }).eq('id', t.id);

          if (q === 'RED') {
            notifyAdminOfMetaIncident({ tenantUserId: t.id, tenantEmail: t.email, kind: 'quality_red', detail: data.name_status });
          } else if (q === 'YELLOW') {
            notifyAdminOfMetaIncident({ tenantUserId: t.id, tenantEmail: t.email, kind: 'quality_yellow' });
          }
        } catch (err: any) {
          const status = err?.response?.status;
          const code = err?.response?.data?.error?.code;
          const errorMsg = `[Meta ${code || status || '?'}] ${err?.response?.data?.error?.message || err.message}`;
          await supabase.from('profiles').update({
            meta_last_error: errorMsg,
            meta_last_error_at: new Date().toISOString(),
          }).eq('id', t.id);

          if (code === 190 || status === 401) {
            notifyAdminOfMetaIncident({ tenantUserId: t.id, tenantEmail: t.email, kind: 'token_expired', detail: errorMsg });
          } else if (code === 100 || status === 400) {
            notifyAdminOfMetaIncident({ tenantUserId: t.id, tenantEmail: t.email, kind: 'token_invalid', detail: errorMsg });
          }
        }
      }
    } catch (err: any) {
      console.error('[MetaQualitySync] Error:', err.message || err);
    }
  }

  /**
   * Lógica central de manutenção: Sincroniza status, webhooks e limpa órfãos.
   */
  async runMaintenanceSync() {
    try {
      // Sincronização aplica-se apenas a tenants Evolution. Tenants Meta não
      // têm "instance" para sincronizar — webhook + cache de credenciais
      // tomam conta do estado. Ignorá-los aqui evita poluição de logs com
      // chamadas falhas ao Evolution para esses tenants.
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, whatsapp_instance_id, whatsapp_status, whatsapp_provider')
        .not('whatsapp_instance_id', 'is', null)
        .or('whatsapp_provider.is.null,whatsapp_provider.neq.meta_official');

      if (!profiles) return;

      console.log(`[Maintenance] 🔄 Syncing ${profiles.length} Evolution profiles (Meta tenants skipped)...`);

      // --- PARTE A: Sincronização de Status e Webhooks ---
      for (const profile of profiles) {
        const instanceName = profile.whatsapp_instance_id!;
        try {
          const realStatus = await EvolutionApiService.getInstanceStatus(instanceName);
          const mappedStatus = realStatus.state === 'open' ? 'connected' : (realStatus.state === 'connecting' ? 'connecting' : 'disconnected');
          
          if (mappedStatus !== profile.whatsapp_status) {
            await this.updateProfileStatus(profile.id, { status: mappedStatus });
          }

          // SEMPRE tenta setar o webhook para garantir que o token da URL esteja atualizado com o Coolify
          if (mappedStatus === 'connected') {
            await EvolutionApiService.setWebhook(instanceName).catch(() => {});
          }
        } catch (err) {}
      }

      // --- PARTE B: Reconexão de instâncias órfãs ---
      const allEvolutionInstances = await EvolutionApiService.fetchInstances();
      if (allEvolutionInstances && Array.isArray(allEvolutionInstances)) {
        for (const instance of allEvolutionInstances) {
          const name = instance.instanceName;
          if (!name || !name.startsWith('wppai_')) continue;

          const isLinked = profiles.some(p => p.whatsapp_instance_id === name);
          if (isLinked) continue;

          // Tenta reconectar pelo prefixo do userId no nome da instância
          const userIdPrefix = name.replace('wppai_', '');
          const { data: matchProfile } = await supabase
            .from('profiles')
            .select('id, whatsapp_status')
            .ilike('id', `${userIdPrefix}%`)
            .maybeSingle();

          if (matchProfile) {
            try {
              const realStatus = await EvolutionApiService.getInstanceStatus(name);
              const mappedStatus = realStatus.state === 'open' ? 'connected'
                : realStatus.state === 'connecting' ? 'connecting' : 'disconnected';
              await supabase.from('profiles').update({
                whatsapp_instance_id: name,
                whatsapp_status: mappedStatus,
              }).eq('id', matchProfile.id);
              console.log(`[Maintenance] 🔗 Instância ${name} reconectada ao perfil ${matchProfile.id} (${mappedStatus})`);
            } catch { /* instância inacessível — não deleta, só ignora */ }
          } else {
            console.log(`[Maintenance] 🧹 Deletando instância órfã sem perfil: ${name}`);
            await EvolutionApiService.deleteInstance(name).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('[Maintenance] Sync Error:', err);
    }
  }

  async startMaintenanceWorker() {
    console.log('[WhatsAppService] 🛠️ Maintenance Worker scheduled (30 min cycle)');
    setInterval(() => this.runMaintenanceSync(), 1800000);
  }

  async destroyAll() {
    console.log('[WhatsAppService] destroyAll called (No-op for Evolution)');
  }

  /**
   * Atalho para verificar idempotência via Redis
   */
  async markEventAsProcessed(eventId: string, ttlSeconds: number = 3600): Promise<boolean> {
    try {
      return await redisService.markAsProcessed(eventId, ttlSeconds);
    } catch (e) {
      console.error('[WhatsAppService] Idempotency check failed:', e);
      return true; // Fallback: processa se o Redis falhar
    }
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
        alwaysOnline: false,
        readMessages: false,
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

