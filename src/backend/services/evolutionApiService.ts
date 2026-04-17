import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const API_URL = process.env.EVOLUTION_API_URL || '';
const GLOBAL_API_KEY = process.env.EVOLUTION_API_KEY || '';
const INSTANCE_TOKEN = process.env.EVOLUTION_AUTH_BASE64 || 'WppAI@2024#Secure123';
const WEBHOOK_URL = process.env.BACKEND_WEBHOOK_URL || '';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'apikey': GLOBAL_API_KEY
  }
});

export class EvolutionApiService {
  static async createInstance(userId: string) {
    console.log(`[EvolutionAPI] Creating instance for ${userId}...`);
    try {
      const { data } = await api.post('/instance/create', {
        instanceName: userId,
        token: INSTANCE_TOKEN, // Usar token fixo para todas as instâncias por simplicidade
        qrcode: true
      });
      
      // Configurar Webhook para esta instância
      await this.setWebhook(userId);
      
      return data;
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error creating instance:`, error.response?.data || error.message);
      // Se já existir, apenas retorna sucesso ou tenta recuperar
      if (error.response?.status === 403 || error.response?.data?.message?.includes('already exists')) {
        console.log(`[EvolutionAPI] Instance ${userId} already exists.`);
        return { instance: { instanceName: userId } };
      }
      throw error;
    }
  }

  static async setWebhook(userId: string) {
    if (!WEBHOOK_URL || WEBHOOK_URL.includes('your-backend-url')) {
      console.warn('[EvolutionAPI] BACKEND_WEBHOOK_URL not properly configured. Skipping webhook setup.');
      return;
    }
    
    try {
      await api.post(`/webhook/set/${userId}`, {
        url: WEBHOOK_URL,
        enabled: true,
        webhook_by_events: false,
        events: [
          'MESSAGES_UPSERT',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE'
        ]
      });
      console.log(`[EvolutionAPI] Webhook set for ${userId}`);
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error setting webhook:`, error.response?.data || error.message);
    }
  }

  static async getQrCode(userId: string) {
    try {
      const { data } = await api.get(`/instance/connect/${userId}`);
      return data; // Retorna { base64: "...", code: "..." }
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error getting QR:`, error.response?.data || error.message);
      return null;
    }
  }

  static async getInstanceStatus(userId: string) {
    try {
      const { data } = await api.get(`/instance/connectionState/${userId}`);
      return data.instance; // { state: "open" | "close" | "connecting" }
    } catch (error: any) {
      // Se der 404, assume que não existe
      return { state: 'disconnected' };
    }
  }

  static async logout(userId: string) {
    try {
      await api.post(`/instance/logout/${userId}`);
      await api.delete(`/instance/delete/${userId}`);
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error logout:`, error.response?.data || error.message);
    }
  }

  static async sendMessage(userId: string, to: string, text: string) {
    try {
      const { data } = await api.post(`/message/sendText/${userId}`, {
        number: to,
        options: {
          delay: 1200,
          presence: 'composing',
          linkPreview: false
        },
        textMessage: {
          text: text
        }
      });
      return data;
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error sending text:`, error.response?.data || error.message);
      throw error;
    }
  }

  static async sendVoice(userId: string, to: string, base64Audio: string) {
    try {
      const { data } = await api.post(`/message/sendWhatsAppAudio/${userId}`, {
        number: to,
        options: {
          delay: 1200,
          presence: 'recording',
          encoding: true
        },
        audio: base64Audio
      });
      return data;
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error sending voice:`, error.response?.data || error.message);
      throw error;
    }
  }

  static async sendMedia(userId: string, to: string, base64Media: string, mimetype: string, filename: string) {
    try {
      const { data } = await api.post(`/message/sendMedia/${userId}`, {
        number: to,
        options: {
          delay: 1200,
          presence: 'composing'
        },
        media: base64Media,
        mediatype: mimetype.startsWith('image') ? 'image' : mimetype.startsWith('video') ? 'video' : 'document',
        mimetype: mimetype,
        caption: filename
      });
      return data;
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error sending media:`, error.response?.data || error.message);
      throw error;
    }
  }
}
