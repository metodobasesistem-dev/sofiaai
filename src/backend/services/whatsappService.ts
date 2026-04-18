import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { supabase } from '../lib/supabaseClient.js';
import { agentService } from './agentService.js';
import { EvolutionApiService } from './evolutionApiService.js';

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
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

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
      // 1. Create instance (or connect to existing)
      await EvolutionApiService.createInstance(instanceName);
      
      // 2. Try to get QR code with retries
      let qrData = null;
      for (let i = 0; i < 3; i++) {
        console.log(`[WhatsAppService] Attempt ${i + 1} to get QR code for ${instanceName}...`);
        qrData = await EvolutionApiService.getQrCode(instanceName);
        if (qrData && qrData.base64) break;
        // Wait 2 seconds between retries
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      if (qrData && qrData.base64) {
        await this.updateProfileStatus(userId, { status: 'connecting', qr: qrData.base64 });
        return qrData.base64;
      }
      
      // 3. If no QR, check if already connected
      const status = await EvolutionApiService.getInstanceStatus(instanceName);
      if (status.state === 'open') {
        await this.updateProfileStatus(userId, { status: 'connected' });
        return 'connected';
      }

      // 4. Default to connecting status
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
      // 1. Buscar o ID real da instância no banco
      const { data: prof } = await supabase
        .from('profiles')
        .select('whatsapp_status, whatsapp_qr, whatsapp_instance_id')
        .eq('id', userId)
        .single();
      
      const instanceName = prof?.whatsapp_instance_id || `wppai_${userId.substring(0, 8)}`;
      const status = await EvolutionApiService.getInstanceStatus(instanceName);
      let dbStatus = 'disconnected';
      
      if (status.state === 'open') {
        dbStatus = 'connected';
        // Auto-healing: Garantir que o webhook esteja ativo se estiver conectado
        EvolutionApiService.setWebhook(instanceName).catch(() => {});
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
    const instanceName = `wppai_${userId.substring(0, 8)}`;
    try {
      console.log(`[WhatsAppService] Requesting pairing code for ${instanceName}`);
      await EvolutionApiService.createInstance(instanceName);
      
      const data = await EvolutionApiService.getPairingCode(instanceName, phoneNumber);
      if (!data || !data.code) {
        throw new Error('Não foi possível gerar o código. Verifique se o servidor Evolution está estável.');
      }
      
      await this.updateProfileStatus(userId, { status: 'connecting' });
      return data.code;
    } catch (error: any) {
      console.error(`[WhatsAppService] Pairing code error for ${instanceName}:`, error.message);
      throw error;
    }
  }

  async logout(userId: string) {
    try {
      // 1. Buscar o ID real da instância no banco antes de apagar
      const { data: prof } = await supabase
        .from('profiles')
        .select('whatsapp_instance_id')
        .eq('id', userId)
        .single();

      const instanceName = prof?.whatsapp_instance_id || `wppai_${userId.substring(0, 8)}`;
      
      console.log(`[WhatsAppService] Logging out instance ${instanceName} for user ${userId}`);
      
      // 2. Tentar deletar na Evolution
      await EvolutionApiService.logout(instanceName);
      
      // 3. Limpar no Supabase (Importante: define ID como null para evitar loops)
      await supabase
        .from('profiles')
        .update({ 
          whatsapp_status: 'disconnected', 
          whatsapp_qr: null, 
          whatsapp_instance_id: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      console.log(`[WhatsAppService] Instance ${instanceName} cleared successfully.`);
    } catch (error) {
      console.error(`[WhatsAppService] Error during logout for ${userId}:`, error);
      // Mesmo com erro, tentamos resetar o status local
      await this.updateProfileStatus(userId, { status: 'disconnected' });
    }
  }

  async destroySession(userId: string) {
    await this.logout(userId);
  }

  async sendMessage(userId: string, to: string, message: string) {
    const instanceName = `wppai_${userId.substring(0, 8)}`;
    console.log(`[WhatsAppService] Sending message via Evolution ${instanceName} to ${to}`);
    const result = await EvolutionApiService.sendMessage(instanceName, to, message);
    
    // Persist manual message
    try {
      const cleanTo = to.split('@')[0].replace(/\D/g, '');
      const threadId = `${userId}_${cleanTo}`;
      await agentService.persistMessage(
        threadId,
        userId,
        message,
        'outbound',
        result.key?.id || `out-${Date.now()}`,
        'Cliente',
        to,
        cleanTo,
        'Atendente'
      );
    } catch (err) {}

    return { success: true, messageId: result.key?.id };
  }

  async sendVoice(userId: string, to: string, audioBuffer: Buffer) {
    const instanceName = `wppai_${userId.substring(0, 8)}`;
    console.log(`[WhatsAppService] Sending voice via Evolution ${instanceName} to ${to}`);
    const base64 = audioBuffer.toString('base64');
    const result = await EvolutionApiService.sendVoice(instanceName, to, base64);
    
    const audioUrl = await this.uploadToStorage(userId, audioBuffer, `manual_${Date.now()}.ogg`);

    try {
      const cleanTo = to.split('@')[0].replace(/\D/g, '');
      const threadId = `${userId}_${cleanTo}`;
      await agentService.persistMessage(
        threadId,
        userId,
        '[Áudio enviado pelo atendente]',
        'outbound',
        result.key?.id || `ai-${Date.now()}`,
        'Cliente',
        to,
        cleanTo,
        'Atendente',
        undefined,
        audioUrl || undefined
      );
    } catch (err) {}

    return { success: true, messageId: result.key?.id };
  }

  async sendMedia(userId: string, to: string, buffer: Buffer, mimetype: string, filename: string) {
    const instanceName = `wppai_${userId.substring(0, 8)}`;
    console.log(`[WhatsAppService] Sending media via Evolution ${instanceName} to ${to}`);
    const base64 = buffer.toString('base64');
    const result = await EvolutionApiService.sendMedia(instanceName, to, base64, mimetype, filename);
    
    try {
      const cleanTo = to.split('@')[0].replace(/\D/g, '');
      const threadId = `${userId}_${cleanTo}`;
      await agentService.persistMessage(
        threadId,
        userId,
        `[Documento/Mídia]: ${filename}`,
        'outbound',
        result.key?.id || `med-${Date.now()}`,
        'Cliente',
        to,
        cleanTo,
        'Atendente'
      );
    } catch (err) {}

    return { success: true, messageId: result.key?.id };
  }

  // Novo método para ser chamado pelo Webhook
  async triggerAIResponseViaWebhook(userId: string, from: string, body: string, contactName: string, cleanPhone: string, messageId: string, isAudio: boolean = false) {
    const instanceName = `wppai_${userId.substring(0, 8)}`;
    const timerKey = `${userId}_${from}`;

    if (this.debounceTimers.has(timerKey)) {
      clearTimeout(this.debounceTimers.get(timerKey)!);
    }

    let delayMs = 15000;
    try {
      const { data: agent } = await supabase
        .from('agents')
        .select('response_delay')
        .eq('user_id', userId)
        .eq('status_ativo', true)
        .maybeSingle();
      
      if (agent?.response_delay) delayMs = agent.response_delay * 1000;
    } catch (e) {}

    const timeout = setTimeout(async () => {
      this.debounceTimers.delete(timerKey);
      
      try {
        console.log(`[WhatsAppService] 🚀 Triggering AI response for ${from} via ${instanceName} (via Webhook)`);
        const aiResponse = await agentService.processIncoming(userId, {
          from: from,
          body: body, 
          contactName: contactName,
          messageId: messageId,
          displayPhone: cleanPhone,
          skipPersist: true,
          isAudioRequest: isAudio
        });

        const aiResponseData = typeof aiResponse === 'string' ? { text: aiResponse } : aiResponse;
        const finalResponseText = aiResponseData?.text;
        const audioBuffer = aiResponseData?.audioBuffer;

        if (!finalResponseText || finalResponseText.trim().length === 0) return;

        // Enviar Texto via Evolution
        await EvolutionApiService.sendMessage(instanceName, from, finalResponseText);
        
        // Enviar Áudio via Evolution se houver
        if (audioBuffer) {
          const aiAudioUrl = await this.uploadToStorage(userId, audioBuffer, `ai_resp_${Date.now()}.ogg`);
          const aiMsgId = `ai-${Date.now()}`;
          
          await agentService.persistMessage(
            `${userId}_${cleanPhone}`,
            userId,
            finalResponseText,
            'outbound',
            aiMsgId,
            contactName,
            from,
            cleanPhone,
            undefined,
            undefined,
            aiAudioUrl || undefined
          );

          await EvolutionApiService.sendVoice(instanceName, from, audioBuffer.toString('base64'));
        }
      } catch (err) {
        console.error(`[WhatsAppService] AI trigger error:`, err);
      }
    }, delayMs);

    this.debounceTimers.set(timerKey, timeout);
  }

  async destroyAll() {
    // No-op for Evolution API (managed externally)
    console.log('[WhatsAppService] destroyAll called (No-op for Evolution)');
  }

  async initializeAllSessions() {
    // No-op (webhook driven)
    console.log('[WhatsAppService] initializeAllSessions called (No-op)');
  }
}

export const whatsappService = new WhatsAppService();
