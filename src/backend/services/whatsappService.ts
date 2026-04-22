import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { supabase } from '../lib/supabaseClient.js';
import { agentService } from './agentService.js';
import { EvolutionApiService } from './evolutionApiService.js';
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
  private isWorkerRunning = false;

  constructor() {
    this.startResponseWorker();
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
      if (status.state === 'open') {
        dbStatus = 'connected';
        const now = Date.now();
        const lastSync = this.lastWebhookSync.get(instanceName) || 0;
        if (now - lastSync > 3600000) {
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
      return { status: dbStatus, qr };
    } catch (error) {
      return { status: 'disconnected' };
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

  async sendMessage(userId: string, to: string, message: string) {
    const instanceName = `wppai_${userId.substring(0, 8)}`;
    const result = await EvolutionApiService.sendMessage(instanceName, to, message);
    try {
      const cleanTo = to.split('@')[0].replace(/\D/g, '');
      await agentService.persistMessage(`${userId}_${cleanTo}`, userId, message, 'outbound', result.key?.id || `out-${Date.now()}`, 'Cliente', to, cleanTo, 'Atendente');
    } catch (err) {}
    return { success: true, messageId: result.key?.id };
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


  // Novo método para ser chamado pelo Webhook
  async triggerAIResponseViaWebhook(userId: string, from: string, body: string, contactName: string, cleanPhone: string, messageId: string, isAudio: boolean = false) {
    const timerKey = `pending_ai:${userId}:${from}`;
    
    let delaySeconds = 15;
    try {
      const { data: agent } = await supabase
        .from('agents')
        .select('response_delay')
        .eq('user_id', userId)
        .eq('status_ativo', true)
        .maybeSingle();
      
      if (agent?.response_delay) delaySeconds = agent.response_delay;
    } catch (e) {}

    // Salvar metadados da mensagem para o worker usar depois
    await redisService.set(`metadata:${timerKey}`, {
      userId, from, body, contactName, cleanPhone, messageId, isAudio,
      timestamp: Date.now()
    }, 300); // 5 min TTL

    // Adicionar à fila de processamento (Sorted Set)
    // Se o cliente mandar outra msg, o ZADD atualiza o tempo de processamento (debounce automático!)
    await redisService.addToQueue('ai_response_queue', timerKey, delaySeconds);
    console.log(`[WhatsAppService] ⏳ Scheduled AI response for ${from} in ${delaySeconds}s (Redis Queue)`);
  }

  private async startResponseWorker() {
    if (this.isWorkerRunning) return;
    this.isWorkerRunning = true;
    console.log('[WhatsAppService] 🤖 AI Response Worker started (Redis-based)');

    setInterval(async () => {
      try {
        const dueJobs = await redisService.getDueJobs('ai_response_queue');
        
        for (const timerKey of dueJobs) {
          // 1. Remover da fila IMEDIATAMENTE para evitar processamento duplo
          await redisService.removeFromQueue('ai_response_queue', timerKey);
          
          // 2. Buscar metadados
          const metadata = await redisService.get(`metadata:${timerKey}`);
          if (!metadata) continue;

          // 3. Verificar se é a última mensagem (Debounce check)
          // Se o timestamp nos metadados for diferente do que agendou, ignoramos
          // (Mas o ZADD já resolve isso naturalmente ao sobrescrever o score)

          const { userId, from, body, contactName, cleanPhone, messageId, isAudio } = metadata;
          const instanceName = `wppai_${userId.substring(0, 8)}`;

          try {
            console.log(`[WhatsAppService] 🚀 Processing AI response for ${from} (via Queue Worker)`);
            const aiResponse = await agentService.processIncoming(userId, {
              from, body, contactName, messageId,
              displayPhone: cleanPhone,
              skipPersist: true,
              isAudioRequest: isAudio
            });

            const aiResponseData = typeof aiResponse === 'string' ? { text: aiResponse } : aiResponse;
            const finalResponseText = aiResponseData?.text;
            const audioBuffer = aiResponseData?.audioBuffer;

            if (!finalResponseText || finalResponseText.trim().length === 0) continue;

            // Enviar Texto via Evolution
            await EvolutionApiService.sendMessage(instanceName, from, finalResponseText);
            
            // Persistir Texto no Banco (Outbound)
            const aiMsgId = `ai-${Date.now()}`;
            await agentService.persistMessage(
              `${userId}_${cleanPhone}`, userId, finalResponseText,
              'outbound', aiMsgId, contactName, from, cleanPhone,
              'Atendente'
            );
            
            // Se houver áudio, envia também
            if (audioBuffer) {
              const aiAudioUrl = await this.uploadToStorage(userId, audioBuffer, `ai_resp_${Date.now()}.ogg`);
              // Atualiza a mensagem com o áudio ou cria uma nova de áudio
              await agentService.persistMessage(
                `${userId}_${cleanPhone}`, userId, '[Áudio]',
                'outbound', `${aiMsgId}-audio`, contactName, from, cleanPhone,
                'Atendente', undefined, aiAudioUrl || undefined
              );
              await EvolutionApiService.sendVoice(instanceName, from, audioBuffer.toString('base64'));
            }
            
            // Limpar metadados
            await redisService.del(`metadata:${timerKey}`);
          } catch (err) {
            console.error(`[WhatsAppService] Worker processing error for ${from}:`, err);
          }
        }
      } catch (err) {
        console.error('[WhatsAppService] Worker loop error:', err);
      }
    }, 3000); // Checa a cada 3 segundos
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
    console.log('[WhatsAppService] initializeAllSessions called');
  }
}


export const whatsappService = new WhatsAppService();
// Inicia o worker de manutenção ao carregar o serviço
whatsappService.startMaintenanceWorker();

