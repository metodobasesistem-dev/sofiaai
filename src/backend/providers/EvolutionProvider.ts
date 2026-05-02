import axios, { AxiosInstance } from 'axios';
import { IWhatsAppProvider, WhatsAppMessage, WhatsAppStatus, WhatsAppConfig } from './IWhatsAppProvider.js';

export class EvolutionProvider implements IWhatsAppProvider {
  private api: AxiosInstance;
  private messageHandler: ((message: WhatsAppMessage) => Promise<void>) | null = null;

  constructor() {
    const API_URL = process.env.EVOLUTION_API_URL;
    const GLOBAL_API_KEY = process.env.EVOLUTION_API_KEY;

    if (!API_URL) {
      throw new Error('EVOLUTION_API_URL is not defined');
    }

    this.api = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
        'apikey': GLOBAL_API_KEY || ''
      }
    });
  }

  async connect(instanceId: string, config: WhatsAppConfig): Promise<void> {
    const INSTANCE_TOKEN = process.env.EVOLUTION_AUTH_BASE64 || 'WppAI@2024#Secure123';
    
    try {
      await this.api.post('/instance/create', {
        instanceName: instanceId,
        token: INSTANCE_TOKEN,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true
      });
      
      await this.setWebhook(instanceId);
    } catch (error: any) {
      if (error.response?.status === 403 || error.response?.status === 400 || error.response?.status === 409) {
        await this.setWebhook(instanceId).catch(() => {});
        return;
      }
      throw error;
    }
  }

  private async setWebhook(instanceId: string): Promise<void> {
    const WEBHOOK_URL = process.env.BACKEND_WEBHOOK_URL || '';
    if (!WEBHOOK_URL) return;

    await this.api.post(`/webhook/set/${instanceId}`, {
      webhook: {
        enabled: true,
        url: WEBHOOK_URL,
        webhookByEvents: false,
        events: [
          'MESSAGES_UPSERT',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE'
        ]
      }
    });
  }

  async disconnect(instanceId: string): Promise<void> {
    await this.api.post(`/instance/logout/${instanceId}`).catch(() => {});
    await this.api.delete(`/instance/delete/${instanceId}`).catch(() => {});
  }

  async getStatus(instanceId: string): Promise<WhatsAppStatus> {
    try {
      const { data } = await this.api.get(`/instance/connectionState/${instanceId}`);
      const state = data.instance.state;
      
      if (state === 'open' || state === 'connected') {
        return { status: 'connected' };
      }
      
      if (state === 'connecting' || state === 'close' || state === 'refused') {
        // Se estiver desconectado/conectando, tentamos pegar o QR Code
        try {
          const { data: qrData } = await this.api.get(`/instance/connect/${instanceId}`);
          if (qrData && qrData.base64) {
            return { 
              status: 'qrcode', 
              qrcode: qrData.base64.startsWith('data:') ? qrData.base64 : `data:image/png;base64,${qrData.base64}` 
            };
          }
        } catch (e) {}
        return { status: 'connecting' };
      }
      
      return { status: 'disconnected' };
    } catch (error) {
      return { status: 'disconnected' };
    }
  }

  async sendMessage(instanceId: string, to: string, message: string): Promise<{ messageId: string }> {
    const cleanNumber = to.replace(/\D/g, '');
    const { data } = await this.api.post(`/message/sendText/${instanceId}`, {
      number: cleanNumber,
      text: message,
      options: { delay: 1200, presence: 'composing' }
    });
    return { messageId: data.key?.id || data.id || '' };
  }

  async sendMedia(instanceId: string, to: string, mediaUrl: string, caption?: string, type: 'image' | 'video' | 'document' | 'audio' = 'image'): Promise<{ messageId: string }> {
    const cleanNumber = to.replace(/\D/g, '');
    
    let endpoint = `/message/sendMedia/${instanceId}`;
    let payload: any = {
      number: cleanNumber,
      media: mediaUrl,
      mediatype: type === 'audio' ? 'audio' : type,
      caption: caption,
      options: { delay: 1200 }
    };

    if (type === 'audio') {
      endpoint = `/message/sendWhatsAppAudio/${instanceId}`;
      payload = {
        number: cleanNumber,
        audio: mediaUrl,
        options: { delay: 1200, presence: 'recording', encoding: true }
      };
    }

    const { data } = await this.api.post(endpoint, payload);
    return { messageId: data.key?.id || data.id || '' };
  }

  async fetchProfilePictureUrl(instanceId: string, number: string): Promise<string | null> {
    try {
      const cleanNumber = number.split('@')[0].replace(/\D/g, '');
      const { data } = await this.api.post(`/chat/fetchProfilePictureUrl/${instanceId}`, { 
        number: cleanNumber
      });
      return data.profilePictureUrl || null;
    } catch (error) {
      return null;
    }
  }

  async getMediaBase64(instanceId: string, messageKey: any, messageContent: any): Promise<string | null> {
    try {
      const { data } = await this.api.post(`/chat/getBase64FromMediaMessage/${instanceId}`, {
        message: {
          key: messageKey,
          message: messageContent
        }
      });
      return data.base64 || data;
    } catch (error) {
      return null;
    }
  }

  async requestPairingCode(instanceId: string, phoneNumber: string): Promise<string> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const { data } = await this.api.get(`/instance/connect/pairing-code/${instanceId}?number=${cleanPhone}`);
    return data.code;
  }

  onMessageReceived(handler: (message: WhatsAppMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  transformPayload(payload: any): WhatsAppMessage | null {
    if (payload.event !== 'messages.upsert') return null;
    
    const message = payload.data?.message;
    if (!message) return null;

    const from = message.key?.remoteJid || '';
    const body = message.message?.conversation || 
                 message.message?.extendedTextMessage?.text || 
                 message.message?.imageMessage?.caption || '';

    return {
      id: message.key?.id || '',
      from: from,
      to: payload.instanceId || '',
      body: body,
      contactName: payload.data?.pushName,
      isGroup: from.includes('@g.us'),
      fromMe: !!payload.data?.key?.fromMe,
      timestamp: message.messageTimestamp || Date.now()
    };
  }
}
