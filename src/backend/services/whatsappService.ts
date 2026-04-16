import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { supabase } from '../lib/supabaseClient.js';
import { RedisRemoteAuthStore } from '../lib/redisRemoteAuthStore.js';
import { agentService } from './agentService.js';
import { transcribeAudio } from './aiService.js';

const DEBUG_LOG = path.join(process.cwd(), 'audio_debug.log');
function logDebug(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(DEBUG_LOG, line);
}

console.log('[WhatsAppService] Module loaded at top level');

interface Session {
  client: any;
  qr?: string;
  readyTimestamp?: number;
}

class WhatsAppService {
  private sessions: Map<string, Session> = new Map();
  private initializing: Map<string, Promise<string>> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private Client: any = null;
  private LocalAuth: any = null;
  private RemoteAuth: any = null;
  private MessageMedia: any = null;

  private async loadClient() {
    if (this.Client) return;
    try {
      console.log('[WhatsAppService] Loading whatsapp-web.js...');
      const pkg = await import('whatsapp-web.js');
      this.Client = pkg.default?.Client || pkg.Client;
      this.LocalAuth = pkg.default?.LocalAuth || pkg.LocalAuth;
      this.RemoteAuth = pkg.default?.RemoteAuth || pkg.RemoteAuth;
      this.MessageMedia = pkg.default?.MessageMedia || pkg.MessageMedia;
      console.log('[WhatsAppService] whatsapp-web.js loaded successfully');

      // Iniciar limpeza de áudios (a cada 24h)
      this.startAudioCleanup();
    } catch (e) {
      console.error('[WhatsAppService] Failed to load whatsapp-web.js:', e);
      throw new Error('Failed to load WhatsApp library. Please check server logs.');
    }
  }

  private async uploadToStorage(userId: string, buffer: Buffer, filename: string): Promise<string | null> {
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

  private startAudioCleanup() {
    if (this.cleanupInterval) return;
    
    // Rodar imediatamente na inicialização
    this.cleanupAudios();
    
    // Rodar a cada 24 horas
    this.cleanupInterval = setInterval(() => this.cleanupAudios(), 24 * 60 * 60 * 1000);
  }

  private async cleanupAudios() {
    console.log('[WhatsAppService] 🧹 Iniciando limpeza de áudios antigos (7 dias)...');
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // 1. Buscar mensagens com áudio antigas
      const { data: oldMessages } = await supabase
        .from('messages')
        .select('id, audio_url')
        .not('audio_url', 'is', null)
        .lt('created_at', sevenDaysAgo.toISOString());

      if (!oldMessages || oldMessages.length === 0) {
        console.log('[WhatsAppService] ✅ Nenhum áudio antigo para remover.');
        return;
      }

      console.log(`[WhatsAppService] Removendo ${oldMessages.length} áudios...`);

      for (const msg of oldMessages) {
        if (msg.audio_url) {
          try {
            // Extrair o path do Storage a partir da URL pública
            // Ex: https://.../chat-audios/user_id/timestamp_name.ogg -> user_id/timestamp_name.ogg
            const parts = msg.audio_url.split('/chat-audios/');
            if (parts.length > 1) {
              const storagePath = parts[1];
              await supabase.storage.from('chat-audios').remove([storagePath]);
            }
            
            // Limpar URL no banco para não tentar baixar novamente
            await supabase.from('messages').update({ audio_url: null }).eq('id', msg.id);
          } catch (e) {
            console.error(`[WhatsAppService] Erro ao limpar áudio ${msg.id}:`, e);
          }
        }
      }
      console.log('[WhatsAppService] ✅ Limpeza concluída.');
    } catch (err) {
      console.error('[WhatsAppService] Falha na limpeza de áudios:', err);
    }
  }

  private async updateProfileStatus(userId: string, data: { status: string; qr?: string }) {
    try {
      // Map internal status to Supabase column value
      let dbStatus: string;
      if (data.status === 'connected') dbStatus = 'connected';
      else if (data.status === 'connecting') dbStatus = 'connecting';
      else dbStatus = 'disconnected';

      console.log(`[WhatsAppService] Updating Supabase profile for user ${userId}:`, JSON.stringify({ status: dbStatus }));

      const { error } = await supabase
        .from('profiles')
        .update({
          whatsapp_status: dbStatus,
          whatsapp_qr: (dbStatus === 'connected' || dbStatus === 'disconnected') ? null : data.qr,
          whatsapp_instance_id: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        console.error(`[WhatsAppService] Error updating profile:`, error.message);
      }
    } catch (error) {
      console.error(`[WhatsAppService] Exception updating Supabase:`, error);
    }
  }

  async destroySession(userId: string) {
    console.log(`[WhatsAppService] Destroying session for ${userId}`);
    const session = this.sessions.get(userId);
    if (session && session.client) {
      try {
        await session.client.destroy();
      } catch (e) {
        console.error(`[WhatsAppService] Error destroying client for ${userId}:`, e);
      }
    }
    this.sessions.delete(userId);
    this.initializing.delete(userId);
  }

  async createSession(userId: string): Promise<string> {
    console.log(`--- [WhatsAppService] createSession start for ${userId} ---`);
    if (!userId) {
      throw new Error('userId is required');
    }

    // Fix: If we are already initializing, return the existing promise instead of resetting.
    // This prevents double-clicks or race conditions from killing the QR generation.
    if (this.initializing.has(userId)) {
      console.log(`[WhatsAppService] Session for ${userId} is already initializing. Returning existing promise.`);
      return this.initializing.get(userId)!;
    }

    // Fix: If session exists, check its REAL state
    const existing = this.sessions.get(userId);
    if (existing && existing.client) {
      try {
        const state = await existing.client.getState().catch(() => null);
        if (state === 'CONNECTED' && existing.readyTimestamp) {
          console.log(`[WhatsAppService] Session for ${userId} is ALREADY connected and healthy.`);
          return 'connected';
        }
        // If state is OPENING, LocalAuth may be restoring from disk — give it time
        if (state === 'OPENING') {
          console.log(`[WhatsAppService] Session for ${userId} is OPENING (LocalAuth restore in progress). Returning 'connecting'.`);
          return 'connecting';
        }
        // If it exists but NOT connected and NOT opening, destroy and recreate
        console.log(`[WhatsAppService] Session for ${userId} exists but state is ${state}. Destroying and starting over.`);
        await this.destroySession(userId);
      } catch (err) {
        console.warn(`[WhatsAppService] Error checking existing session state for ${userId}:`, err);
        await this.destroySession(userId);
      }
    }

    await this.loadClient();

    const initPromise = new Promise<string>((resolve, reject) => {
      let resolved = false;
      
      // Standardize session naming: Using userId directly as recommended
      const clientId = userId;
      
      // AÇÃO 1: Corrigir dataPath Duplicado (Sempre usar caminho relativo './sessions' para evitar aninhamento no Docker)
      const sessionsDataPath = './sessions';

      // Ensure local sessions folder exists (used by RemoteAuth as temp workspace)
      if (!fs.existsSync(sessionsDataPath)) {
        fs.mkdirSync(sessionsDataPath, { recursive: true });
      }

      // Clean stale lock files that could prevent Puppeteer from starting
      // [CRITICAL] Search recursively in the session folder to find SingletonLock
      const sessionFolder = path.join(sessionsDataPath, 'RemoteAuth', `session-${clientId}`);
      const possibleLockPaths = [
        path.join(sessionsDataPath, 'RemoteAuth', 'SingletonLock'),
        path.join(sessionFolder, 'SingletonLock'),
        path.join(sessionFolder, 'Default', 'SingletonLock')
      ];

      for (const lp of possibleLockPaths) {
        if (fs.existsSync(lp)) {
          try {
            fs.unlinkSync(lp);
            console.log(`[WhatsAppService] 🧹 Cleaned stale lock file at: ${lp}`);
          } catch (err) {
            console.warn(`[WhatsAppService] ⚠️ Could not remove lock file at ${lp}:`, err);
          }
        }
      }

      const store = new RedisRemoteAuthStore(sessionsDataPath);

      const client = new this.Client({
        authStrategy: new this.RemoteAuth({
          clientId: clientId,
          dataPath: sessionsDataPath,
          store: store,
          backupSyncIntervalMs: 60000, // Sync to Redis every 60s
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--no-first-run',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--safebrowsing-disable-auto-update',
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            '--ignore-certificate-errors-spki-list',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
            '--js-flags=--max_old_space_size=512',
            '--no-zygote'
          ],
          executablePath: (() => {
            const paths = [
              process.env.PUPPETEER_EXECUTABLE_PATH,
              process.env.WHATSAPP_EXECUTABLE_PATH,
              '/usr/bin/chromium',
              '/usr/bin/chromium-browser',
              '/usr/bin/google-chrome-stable'
            ];
            for (const p of paths) {
              if (p && fs.existsSync(p)) return p;
            }
            return undefined; // Let Puppeteer try its default
          })()
        }
      });

      // Heartbeat moved to 'ready' event for stability

      client.on('qr', async (qr) => {
        try {
          const qrDataUrl = await qrcode.toDataURL(qr);
          this.sessions.set(userId, { client, qr: qrDataUrl });
          await this.updateProfileStatus(userId, { status: 'connecting', qr: qrDataUrl });

          if (!resolved) {
            resolved = true;
            this.initializing.delete(userId);
            resolve(qrDataUrl);
          }
        } catch (err) {
          console.error('[WhatsAppService] QR Error:', err);
        }
      });

      client.on('ready', async () => {
        console.log(`[WhatsAppService] Client is READY for user ${userId}`);
        const session = this.sessions.get(userId) || { client };
        session.readyTimestamp = Math.floor(Date.now() / 1000);
        this.sessions.set(userId, session);
        this.initializing.delete(userId);

        await this.updateProfileStatus(userId, { status: 'connected' });

        if (!resolved) {
          resolved = true;
          resolve('connected');
        }

        // --- Start Heartbeat NOW that it's connected ---
        const heartbeatInterval = setInterval(async () => {
          const currentSess = this.sessions.get(userId);
          if (!currentSess || !currentSess.client) {
            clearInterval(heartbeatInterval);
            return;
          }

          try {
            const state = await currentSess.client.getState().catch(() => null);
            if (state === 'CONFLICT') {
              console.warn(`[WhatsAppService] Conflict detected for ${userId}. Restarting session...`);
              await this.createSession(userId).catch(() => {});
            } else if (state === 'CONNECTED') {
              await this.updateProfileStatus(userId, { status: 'connected' });
            }
          } catch (e) {}
        }, 60000); // Check every 1m
      });

      // RemoteAuth backup confirmation
      client.on('remote_session_saved', () => {
        console.log(`[WhatsAppService] ✅ Session backup saved to Redis for ${userId}`);
      });
      client.on('message', async (msg) => {
        if (msg.from.includes('@g.us') || msg.from === 'status@broadcast') return;
        
        console.log(`[WhatsAppService] 📥 MESSAGE RECEIVED from ${msg.from}: "${msg.body.substring(0, 20)}..."`);
        
        // EMERGENCY TEST: If the user sends "TESTE", reply immediately
        if (msg.body.toUpperCase() === 'TESTE') {
          await msg.reply('✅ CONEXÃO OK! O robô está ouvindo e consegue responder.');
          return;
        }

        try {
          const contact = await msg.getContact();
          
          // 1.5 Handle Audio Transcription (Evolution Phase 1)
          if (msg.hasMedia && (msg.type === 'audio' || msg.type === 'ptt' || msg.body.includes('[Audio]'))) {
            logDebug(`AUDIO DETECTED: from=${msg.from} type=${msg.type} body=${msg.body} hasMedia=${msg.hasMedia}`);
            try {
              console.log(`[WhatsAppService] Downloading audio from ${msg.from}...`);
              const media = await msg.downloadMedia();
              if (media && media.data) {
                logDebug(`MEDIA DOWNLOADED: size=${media.data.length}`);
                const buffer = Buffer.from(media.data, 'base64');
                const transcription = await transcribeAudio(buffer, `audio_${Date.now()}.ogg`);
                if (transcription) {
                  console.log(`[WhatsAppService] Transcription for ${msg.from}: ${transcription}`);
                  
                  // UPLOAD AUDIO TO STORAGE
                  const audioUrl = await this.uploadToStorage(userId, buffer, `inbound_${Date.now()}.ogg`);
                  
                  // PERSIST WITH AUDIO URL
                  const contactName = contact.pushname || contact.name || msg.from;
                  const cleanNumber = msg.from.split('@')[0].replace(/\D/g, '');
                  const realPhone = (contact.number || contact.id.user || msg.from).split('@')[0].replace(/\D/g, '');
                  const threadId = `${userId}_${cleanNumber}`;

                  await agentService.persistMessage(
                    threadId, 
                    userId, 
                    `[Áudio]: ${transcription}`, 
                    'inbound', 
                    msg.id.id || `in-${Date.now()}`, 
                    contactName, 
                    msg.from, 
                    realPhone,
                    undefined,
                    undefined,
                    audioUrl || undefined
                  );

                  this.triggerAIResponse(userId, msg, contact, transcription, true);
                  return;
                } else {
                   await msg.reply('Não consegui entender o seu áudio. Poderia digitar ou enviar novamente?');
                }
              }
            } catch (err) {
              console.error('[WhatsAppService] Transcription failed:', err);
              await msg.reply('Houve um erro ao processar seu áudio. Por favor, tente novamente ou digite sua mensagem.');
            }
            return; // ALWAYS stop for audio messages
          }

          const contactName = contact.pushname || contact.name || msg.from;
          const cleanNumber = msg.from.split('@')[0].replace(/\D/g, '');
          const realPhone = (contact.number || contact.id.user || msg.from).split('@')[0].replace(/\D/g, '');
          const threadId = `${userId}_${cleanNumber}`;
          
          // 1. INSTANT PERSISTENCE (CRM visibility)
          console.log(`[WhatsAppService] Persisting instant message from ${msg.from}`);
          await agentService.persistMessage(
            threadId, 
            userId, 
            msg.body, 
            'inbound', 
            msg.id.id || `in-${Date.now()}`, 
            contactName, 
            msg.from, 
            realPhone
          );

          // 2. DEBOUNCE LOGIC (Delay AI response by 30s)
          this.triggerAIResponse(userId, msg, contact, msg.body, false);

        } catch (error) {
          console.error(`[WhatsAppService] message processing error:`, error);
        }
      });

      client.on('disconnected', async (reason) => {
        console.log(`[WhatsAppService] ⚠️ Client DISCONNECTED for ${userId}. Reason: ${reason}`);
        
        // Anti-flicker: if we were JUST initializing, ignore quick disconnections 
        // that often happen when puppeteer restarts for the first time
        if (this.initializing.has(userId)) {
          console.warn(`[WhatsAppService] Ignoring disconnection event during initialization for ${userId}`);
          return;
        }

        this.sessions.delete(userId);
        await this.updateProfileStatus(userId, { status: 'disconnected' });
      });

      client.initialize().catch(async (err) => {
        const errMsg = err.message || '';
        console.error(`[WhatsAppService] Initialization failed for ${userId}:`, err);
        
        if (errMsg.includes('The browser is already running')) {
          console.log(`[WhatsAppService] Browser already running for ${userId}. Attempting to recover by destroying client.`);
          await this.destroySession(userId);
          // Don't recursive call here to avoid infinite loop, just return error to let user retry
        }

        this.initializing.delete(userId);
        await this.updateProfileStatus(userId, { status: 'disconnected' });
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      setTimeout(async () => {
        if (!resolved) {
          resolved = true;
          this.initializing.delete(userId);
          console.error(`[WhatsAppService] ❌ TIMEOUT: QR failed to generate within 120s for ${userId}`);
          reject(new Error('Timeout waiting for QR code'));
        }
      }, 120000); // 120s
    });

    this.initializing.set(userId, initPromise);
    return initPromise;
  }

  private async triggerAIResponse(userId: string, msg: any, contact: any, body: string, isAudio: boolean = false) {
    const contactName = contact.name || contact.pushname || msg.from.split('@')[0];
    const realPhone = (contact.number || msg.from).split('@')[0].replace(/\D/g, '');
    const timerKey = `${userId}_${msg.from}`;

    if (this.debounceTimers.has(timerKey)) {
      clearTimeout(this.debounceTimers.get(timerKey)!);
    }

    const timeout = setTimeout(async () => {
      this.debounceTimers.delete(timerKey);
      console.log(`[WhatsAppService] Timer expired. Triggering AI response for ${msg.from}`);

      try {
        const sess = this.sessions.get(userId);
        if (sess) {
          const chat = await msg.getChat().catch(() => null);
          
          if (chat) {
            // Removed unsupported presence calls to prevent crashes
            try { await chat.sendSeen(); } catch (e) {}
          }

          console.log(`[WhatsAppService] 🚀 DISPARANDO AGENTE para ${msg.from}...`);
          const aiResponse = await agentService.processIncoming(userId, {
            from: msg.from,
            body: body, 
            contactName: contactName,
            messageId: msg.id.id || `trig-${Date.now()}`,
            displayPhone: realPhone,
            skipPersist: true,
            isAudioRequest: isAudio
          });

          const aiResponseData = typeof aiResponse === 'string' ? { text: aiResponse } : aiResponse;
          const finalResponseText = aiResponseData?.text;
          const audioBuffer = aiResponseData?.audioBuffer;

          console.log(`[WhatsAppService] AI Response check for ${msg.from}: text="${finalResponseText?.substring(0, 30)}", hasAudio=${!!audioBuffer}`);

          if (!finalResponseText || finalResponseText.trim().length === 0) {
            console.log('[WhatsAppService] AI response is empty or thread is in HUMAN mode. Skipping send.');
            return;
          }

          // Send Text
          await msg.reply(finalResponseText);
          
          // Send Voice if returned
          if (audioBuffer) {
            console.log(`[WhatsAppService] 🎙️ DETECTED AUDIO BUFFER! Sending voice response to ${msg.from}...`);
            
            // Upload AI Voice to Storage
            const aiAudioUrl = await this.uploadToStorage(userId, audioBuffer, `ai_resp_${Date.now()}.ogg`);
            
            // Re-persist outbound message with audioUrl
            const aiMsgId = `ai-${Date.now()}`;
            await agentService.persistMessage(
              `${userId}_${realPhone}`,
              userId,
              aiResponseData.text,
              'outbound',
              aiMsgId,
              contactName,
              msg.from,
              realPhone,
              undefined,
              undefined,
              aiAudioUrl || undefined
            );

            await this.sendVoice(userId, msg.from, audioBuffer);
          } else {
            console.log(`[WhatsAppService] No audio buffer returned from AgentService. VoiceMode might be disabled or generation failed.`);
          }
        }
      } catch (err) {
        console.error(`[WhatsAppService] AI trigger error:`, err);
      }
    }, 2000); // 2s debounce for faster feeling

    this.debounceTimers.set(timerKey, timeout);
  }

  async destroyAll() {
    for (const userId of this.sessions.keys()) {
      try {
        await this.logout(userId);
      } catch (err) {}
    }
  }

  async getSessionStatus(userId: string): Promise<string> {
    const session = this.sessions.get(userId);

    // AÇÃO 2: Se não existe em memória, tenta restaurar do Redis se houver backup
    if (!session) {
      // Se já estamos tentando inicializar esta sessão, não dispare outra restauração
      if (this.initializing.has(userId)) {
        console.log(`[WhatsAppService] Session ${userId} is already being initialized/restored. Returning 'connecting'.`);
        return 'connecting';
      }
      
      console.log(`[WhatsAppService] No memory session for ${userId}. Checking Redis for restoration...`);
      return this.restoreSessionIfExists(userId);
    }

    try {
      const state = await session.client.getState().catch(() => null);
      console.log(`[WhatsAppService] Current state for ${userId}: ${state}`);

      if (state === 'CONNECTED') {
        await this.updateProfileStatus(userId, { status: 'connected' });
        return 'connected';
      }

      if (state === 'OPENING' || state === 'PAIRING' || state === null) {
        return 'connecting';
      }

      // Se estiver em estado de conflito ou desconectado, limpa e retorna desconectado
      if (state === 'CONFLICT' || state === 'DISCONNECTED') {
        console.warn(`[WhatsAppService] Session ${userId} is in state ${state}. Marking as disconnected.`);
        await this.updateProfileStatus(userId, { status: 'disconnected' });
        return 'disconnected';
      }

      // Se estiver UNLAUNCHED ou NULL mas o objeto de sessão existe, significa que ainda está carregando o navegador
      if (state === 'UNLAUNCHED' || state === null) {
        console.log(`[WhatsAppService] Session ${userId} state is ${state} (still warming up). Returning 'connecting'.`);
        return 'connecting';
      }

      return 'disconnected';
    } catch (e) {
      if (session.qr) return 'connecting';
      return 'disconnected';
    }
  }

  // AÇÃO 2: Implementar restauração automática se a sessão existir no Redis
  async restoreSessionIfExists(userId: string): Promise<string> {
    const clientId = userId; // Standardized: No prefix
    const sessionsDataPath = './sessions';
    const store = new RedisRemoteAuthStore(sessionsDataPath);

    try {
      const exists = await store.sessionExists({ session: clientId });
      if (exists) {
        console.log(`[WhatsAppService] Found Redis session for ${userId}. Restoring...`);
        // Trigger initialization in background - we return 'connecting' so frontend waits
        this.createSession(userId).catch(err => {
          console.error(`[WhatsAppService] Background restoration failed for ${userId}:`, err.message);
        });
        return 'connecting';
      }
    } catch (err) {
      console.error(`[WhatsAppService] Error checking Redis session for ${userId}:`, err);
    }

    return 'disconnected';
  }

  async logout(userId: string) {
    const session = this.sessions.get(userId);
    await this.updateProfileStatus(userId, { status: 'disconnected' });

    if (!session) return;

    try {
      await session.client.logout();
      await session.client.destroy();
    } catch (error) {
    } finally {
      this.sessions.delete(userId);
      this.initializing.delete(userId);

      // Delete session from Redis and clean up local temp files
      const clientId = userId; // Standardized: No prefix
      const sessionsDataPath = './sessions';
      const store = new RedisRemoteAuthStore(sessionsDataPath);

      try {
        await store.delete({ session: clientId });
      } catch (e) {
        console.warn('[WhatsAppService] Could not delete session from Supabase:', e);
      }

      // Clean up local temp folder used by RemoteAuth
      setTimeout(() => {
        const remoteAuthPath = path.join(sessionsDataPath, 'RemoteAuth');
        if (fs.existsSync(remoteAuthPath)) {
          try {
            fs.rmSync(remoteAuthPath, { recursive: true, force: true });
            console.log(`[WhatsAppService] Local RemoteAuth folder cleaned up`);
          } catch (e) {
            console.warn(`[WhatsAppService] Could not delete local folder (locked):`, e);
          }
        }
      }, 2000);
    }
  }

  async sendMessage(userId: string, to: string, message: string) {
    const session = this.sessions.get(userId);
    if (!session) throw new Error('WhatsApp session not found or not connected');
    
    const result = await session.client.sendMessage(to, message);
    
    // PERSISTENCE: Save manual message to CRM
    try {
      const threadId = `${userId}_${to.split('@')[0].replace(/\D/g, '')}`;
      await agentService.persistMessage(
        threadId,
        userId,
        message,
        'outbound',
        result.id.id,
        'Cliente', // Generic, persistMessage handles fetching contact name
        to,
        to.split('@')[0].replace(/\D/g, ''),
        'Atendente' // Mark as human agent
      );
    } catch (err) {
      console.error('[WhatsAppService] Fail to persist manual message:', err);
    }

    return { success: true, messageId: result.id.id };
  }

  async sendVoice(userId: string, to: string, audioBuffer: Buffer) {
    const session = this.sessions.get(userId);
    if (!session) throw new Error('WhatsApp session not found or not connected');
    
    const media = new this.MessageMedia('audio/ogg; codecs=opus', audioBuffer.toString('base64'));
    const result = await session.client.sendMessage(to, media, { sendAudioAsVoice: true });

    // Upload manual audio to Storage
    const manualAudioUrl = await this.uploadToStorage(userId, audioBuffer, `manual_${Date.now()}.ogg`);

    // PERSISTENCE: Save manual audio to CRM
    try {
      const threadId = `${userId}_${to.split('@')[0].replace(/\D/g, '')}`;
      await agentService.persistMessage(
        threadId,
        userId,
        '[Áudio enviado pelo atendente]',
        'outbound',
        result.id.id,
        'Cliente',
        to,
        to.split('@')[0].replace(/\D/g, ''),
        'Atendente',
        undefined,
        manualAudioUrl || undefined
      );
    } catch (err) {
      console.error('[WhatsAppService] Fail to persist manual audio message:', err);
    }

    return { success: true, messageId: result.id.id };
  }

  async sendMedia(userId: string, to: string, buffer: Buffer, mimetype: string, filename: string) {
    const session = this.sessions.get(userId);
    if (!session) throw new Error('WhatsApp session not found or not connected');
    
    const media = new this.MessageMedia(mimetype, buffer.toString('base64'), filename);
    const result = await session.client.sendMessage(to, media);

    // PERSISTENCE: Save manual media to CRM
    try {
      const threadId = `${userId}_${to.split('@')[0].replace(/\D/g, '')}`;
      await agentService.persistMessage(
        threadId,
        userId,
        `[Documento/Mídia]: ${filename}`,
        'outbound',
        result.id.id,
        'Cliente',
        to,
        to.split('@')[0].replace(/\D/g, ''),
        'Atendente'
      );
    } catch (err) {
      console.error('[WhatsAppService] Fail to persist manual media:', err);
    }

    return { success: true, messageId: result.id.id };
  }

  async initializeAllSessions() {
    // DESATIVADO: A inicialização automática está causando o bug de "Já Conectado"
    // O usuário deve clicar manualmente em "Conectar" ou "Gerar QR Code".
    console.log('[WhatsAppService] Auto-initialization is DISABLED to prevent phantom connections.');
    return;
  }
}

export const whatsappService = new WhatsAppService();
