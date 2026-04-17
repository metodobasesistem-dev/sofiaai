import axios, { AxiosInstance } from 'axios';
import { supabase } from '../lib/supabaseClient.js';

let apiInstance: AxiosInstance | null = null;

function getApi() {
  if (apiInstance) return apiInstance;

  const API_URL = process.env.EVOLUTION_API_URL;
  const GLOBAL_API_KEY = process.env.EVOLUTION_API_KEY;

  console.log('[EvolutionAPI] Diagnostic Info:');
  console.log(` - URL: ${API_URL}`);
  console.log(` - API_KEY Present: ${!!GLOBAL_API_KEY}`);
  if (GLOBAL_API_KEY) {
    console.log(` - API_KEY (start/end): ${GLOBAL_API_KEY.substring(0, 3)}...${GLOBAL_API_KEY.substring(GLOBAL_API_KEY.length - 3)}`);
  }

  if (!API_URL) {
    throw new Error('EVOLUTION_API_URL is not defined in environment variables');
  }

  // We send the key in multiple headers to cover all possible Evolution API v2 configurations
  apiInstance = axios.create({
    baseURL: API_URL,
    headers: {
      'Content-Type': 'application/json',
      'apikey': GLOBAL_API_KEY || '',
      'apiKey': GLOBAL_API_KEY || '', // Variant for some proxies
      'Authorization': GLOBAL_API_KEY ? `Bearer ${GLOBAL_API_KEY}` : '' // Global tokens often work as Bearer
    }
  });

  return apiInstance;
}

export class EvolutionApiService {
  static async createInstance(userId: string) {
    const api = getApi();
    const INSTANCE_TOKEN = process.env.EVOLUTION_AUTH_BASE64 || 'WppAI@2024#Secure123';
    
    console.log(`[EvolutionAPI] Creating instance for ${userId}...`);
    try {
      const { data } = await api.post('/instance/create', {
        instanceName: userId,
        token: INSTANCE_TOKEN,
        qrcode: true
      });
      
      await this.setWebhook(userId);
      return data;
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error creating instance (Status ${error.response?.status}):`, error.response?.data || error.message);
      
      // If 401, it's a key issue
      if (error.response?.status === 401) {
        console.error('[EvolutionAPI] Authentication failed. Please verify your EVOLUTION_API_KEY in the dashboard.');
      }

      if (error.response?.status === 403 || error.response?.data?.message?.includes('already exists')) {
        console.log(`[EvolutionAPI] Instance ${userId} already exists.`);
        return { instance: { instanceName: userId } };
      }
      throw error;
    }
  }

  static async setWebhook(userId: string) {
    const api = getApi();
    const WEBHOOK_URL = process.env.BACKEND_WEBHOOK_URL || '';

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
    const api = getApi();
    try {
      const { data } = await api.get(`/instance/connect/${userId}`);
      return data;
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error getting QR:`, error.response?.data || error.message);
      return null;
    }
  }

  static async getInstanceStatus(userId: string) {
    const api = getApi();
    try {
      const { data } = await api.get(`/instance/connectionState/${userId}`);
      return data.instance;
    } catch (error: any) {
      return { state: 'disconnected' };
    }
  }

  static async logout(userId: string) {
    const api = getApi();
    try {
      await api.post(`/instance/logout/${userId}`);
      await api.delete(`/instance/delete/${userId}`);
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error logout:`, error.response?.data || error.message);
    }
  }

  static async sendMessage(userId: string, to: string, text: string) {
    const api = getApi();
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
    const api = getApi();
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
    const api = getApi();
    try {
      const { data } = await api.post(`/message/sendMedia/${userId}`, {
        number: to,
        options: { delay: 1200, presence: 'composing' },
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
