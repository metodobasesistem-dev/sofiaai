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
    } catch (e) {
      console.error('[WhatsAppService] Failed to load whatsapp-web.js:', e);
      throw new Error('Failed to load WhatsApp library. Please check server logs.');
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

    // Fix: If we are already initializing this user, return the existing promise
    if (this.initializing.has(userId)) {
      console.warn(`[WhatsAppService] Session for ${userId} is already initializing. Attempting to force reset to avoid hang.`);
      this.initializing.delete(userId);
      await this.destroySession(userId);
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
      
      // v5_RECOMECO: O golpe final para acabar com as pastas travadas
      // AÇÃO 1: Corrigir dataPath Duplicado (Sempre usar caminho relativo './sessions' para evitar aninhamento no Docker)
      const sessionsDataPath = './sessions';

      // Ensure local sessions folder exists (used by RemoteAuth as temp workspace)
      if (!fs.existsSync(sessionsDataPath)) {
        fs.mkdirSync(sessionsDataPath, { recursive: true });
      }

      // Clean stale lock files that could prevent Puppeteer from starting
      const userDataDir = path.join(sessionsDataPath, 'RemoteAuth');
      const lockFile = path.join(userDataDir, 'SingletonLock');
      if (fs.existsSync(lockFile)) {
        try {
          fs.unlinkSync(lockFile);
          console.log(`[WhatsAppService] Cleaned stale lock file for ${clientId}`);
        } catch (err) {
          console.warn(`[WhatsAppService] Could not remove lock file:`, err);
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
            '--js-flags=--max_old_space_size=512'
          ],
          executablePath:
            process.env.PUPPETEER_EXECUTABLE_PATH ||
            process.env.WHATSAPP_EXECUTABLE_PATH ||
            '/usr/bin/google-chrome-stable' // Fallback para Railway
        }
      });

      // --- Heartbeat & Auto-Reconnect Logic ---
      const heartbeatInterval = setInterval(async () => {
        const currentSess = this.sessions.get(userId);
        if (!currentSess || !currentSess.client) {
          clearInterval(heartbeatInterval);
          return;
        }

        try {
          const state = await currentSess.client.getState().catch(() => null);
          console.log(`[WhatsAppService] Heartbeat for ${userId}: ${state}`);

          if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
            console.warn(`[WhatsAppService] Critical state "${state}" for ${userId}. Attempting auto-reconnect...`);
            await this.createSession(userId).catch(() => {});
          } else if (state === 'CONNECTED') {
            await this.updateProfileStatus(userId, { status: 'connected' });
          }
        } catch (e) {
          console.error(`[WhatsAppService] Heartbeat error for ${userId}:`, e);
        }
      }, 30000); // Check every 30s

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
                  await msg.reply(`Transcrição do áudio: "${transcription}"`);
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

      client.on('disconnected', async () => {
        this.sessions.delete(userId);
        this.initializing.delete(userId);
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
          reject(new Error('Timeout waiting for QR code'));
        }
      }, 60000);
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

          console.log(`[WhatsAppService] Triggering AgentService.processIncoming for ${msg.from}`);
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
      if (state === 'CONFLICT' || state === 'UNLAUNCHED' || state === 'DISCONNECTED') {
        console.warn(`[WhatsAppService] Session ${userId} is in state ${state}. Marking as disconnected.`);
        await this.updateProfileStatus(userId, { status: 'disconnected' });
        // Don't destroy here to avoid race conditions with reconnect heartbeat
        return 'disconnected';
      }

      return 'disconnected';
    } catch (e) {
      if (session.qr) return 'connecting';
      return 'disconnected';
    }
  }

  // AÇÃO 2: Implementar restauração automática se a sessão existir no Redis
  async restoreSessionIfExists(userId: string): Promise<string> {
    const clientId = userId.startsWith('v5_RECOMECO-') ? userId : `v5_RECOMECO-${userId}`;
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
      const clientId = userId.startsWith('v5_RECOMECO-') ? userId : `v5_RECOMECO-${userId}`;
      const sessionsDataPath = path.join(process.cwd(), 'sessions');
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
    return { success: true, messageId: result.id.id };
  }

  async sendVoice(userId: string, to: string, audioBuffer: Buffer) {
    const session = this.sessions.get(userId);
    if (!session) throw new Error('WhatsApp session not found or not connected');
    
    const media = new this.MessageMedia('audio/mp3', audioBuffer.toString('base64'));
    const result = await session.client.sendMessage(to, media, { sendAudioAsVoice: true });
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
