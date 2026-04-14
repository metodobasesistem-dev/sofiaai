import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { supabase } from '../lib/supabaseClient.js';
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
  private MessageMedia: any = null;

  private async loadClient() {
    if (this.Client) return;
    try {
      console.log('[WhatsAppService] Loading whatsapp-web.js...');
      const pkg = await import('whatsapp-web.js');
      this.Client = pkg.default?.Client || pkg.Client;
      this.LocalAuth = pkg.default?.LocalAuth || pkg.LocalAuth;
      this.MessageMedia = pkg.default?.MessageMedia || pkg.MessageMedia;
      console.log('[WhatsAppService] whatsapp-web.js loaded successfully');
    } catch (e) {
      console.error('[WhatsAppService] Failed to load whatsapp-web.js:', e);
      throw new Error('Failed to load WhatsApp library. Please check server logs.');
    }
  }

  private async updateProfileStatus(userId: string, data: any) {
    try {
      console.log(`[WhatsAppService] Updating Supabase profile for user ${userId}:`, JSON.stringify(data));
      
      const { error } = await supabase
        .from('profiles')
        .update({
          whatsapp_status: data.status === 'connected' ? 'connected' : 'disconnected',
          whatsapp_instance_id: userId, // Using userId as instance ID for now
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        console.error(`[WhatsAppService] Error updating profile:`, error);
        // Fallback: If profile doesn't exist, we might need to handle it, 
        // but normally the user should have a profile after signing up.
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
      console.log(`[WhatsAppService] Session for ${userId} is already initializing. Returning promise.`);
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
        // If it exists but NOT connected, we should destroy and recreate to be safe
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
      const clientId = userId.startsWith('v5_RECOMECO-') ? userId : `v5_RECOMECO-${userId}`;
      const sessionPath = path.join(process.cwd(), 'sessions', `session-${clientId}`, 'Default');
      
      try {
        const lockFile = path.join(sessionPath, 'SingletonLock');
        if (fs.existsSync(lockFile)) {
          console.log(`[WhatsAppService] Found stale lock file for client ${clientId}. Cleaning up...`);
          fs.unlinkSync(lockFile);
        }
      } catch (err) {
        console.warn(`[WhatsAppService] Could not clean up lock file for client ${clientId}:`, err);
      }

      const client = new this.Client({
        authStrategy: new this.LocalAuth({
          clientId: clientId,
          dataPath: path.join(process.cwd(), 'sessions')
        }),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          executablePath: 
            process.env.PUPPETEER_EXECUTABLE_PATH || 
            process.env.WHATSAPP_EXECUTABLE_PATH || 
            undefined
        }
      });

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

  async getSessionStatus(userId: string) {
    const session = this.sessions.get(userId);
    if (!session) return 'disconnected';
    try {
      const state = await session.client.getState();
      const status = state === 'CONNECTED' ? 'connected' : 'disconnected';
      await this.updateProfileStatus(userId, { status });
      return status;
    } catch {
      return 'disconnected';
    }
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
      
      // Aggressively try to delete the session folder to avoid "phantom" connections
      setTimeout(() => {
        const clientId = userId.startsWith('v5_RECOMECO-') ? userId : `v5_RECOMECO-${userId}`;
        const sessionPath = path.join(process.cwd(), 'sessions', `session-${clientId}`);
        if (fs.existsSync(sessionPath)) {
          console.log(`[WhatsAppService] Aggressively cleaning up folder after logout: ${sessionPath}`);
          try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log(`[WhatsAppService] Folder deleted.`);
          } catch (e) {
            console.warn(`[WhatsAppService] Could not delete folder (locked):`, e);
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
