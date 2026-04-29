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
        integration: 'WHATSAPP-BAILEYS', // Required in Evolution API v2
        qrcode: true
      });
      
      await this.setWebhook(userId);
      return data;
    } catch (error: any) {
      const errorData = error.response?.data || {};
      const errorMessage = errorData.message || error.message || '';
      
      console.error(`[EvolutionAPI] Error creating instance (Status ${error.response?.status}):`, JSON.stringify(errorData));
      
      // Handle 400, 403 or 409 as potential "already exists" cases
      const isAlreadyExists = 
        error.response?.status === 403 || 
        error.response?.status === 400 ||
        error.response?.status === 409 ||
        errorMessage.toLowerCase().includes('already exists') ||
        (errorData.error && errorData.error.toLowerCase().includes('already exists'));

      if (isAlreadyExists) {
        console.log(`[EvolutionAPI] Instance ${userId} already exists or was detected as conflict. Proceeding...`);
        try { await this.setWebhook(userId); } catch (e) { } // Set webhook again just in case
        return { instance: { instanceName: userId } };
      }
      
      if (error.response?.status === 401) {
        console.error('[EvolutionAPI] Authentication failed. Please verify your EVOLUTION_API_KEY in the dashboard.');
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
      console.log(`[EvolutionAPI] Webhook set for ${userId}`);
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error setting webhook:`, error.response?.data || error.message);
    }
  }

  static async getWebhook(userId: string) {
    const api = getApi();
    try {
      const { data } = await api.get(`/webhook/find/${userId}`);
      return data;
    } catch (error) {
      return null;
    }
  }

  static async getQrCode(userId: string) {
    const api = getApi();
    try {
      const { data } = await api.get(`/instance/connect/${userId}`);
      if (data && data.base64 && !data.base64.startsWith('data:')) {
        data.base64 = `data:image/png;base64,${data.base64}`;
      }
      console.log(`[EvolutionAPI] QR Code fetched for ${userId} (Length: ${data?.base64?.length || 0})`);
      return data;
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error getting QR:`, error.response?.data || error.message);
      return null;
    }
  }

  static async getPairingCode(instanceName: string, phoneNumber: string) {
    const api = getApi();
    try {
      // Remove everything except numbers
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      console.log(`[EvolutionAPI] Requesting pairing code for ${instanceName} and number ${cleanPhone}...`);
      const { data } = await api.get(`/instance/connect/pairing-code/${instanceName}?number=${cleanPhone}`);
      return data; // returns { code: "ABC-DEF-GH" }
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error getting pairing code:`, error.response?.data || error.message);
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
      // Tentamos o logout (fecha a sessão no Baileys), mas ignoramos erros se já estiver deslogado
      await api.post(`/instance/logout/${userId}`).catch(() => {});
      // Deletamos a instância permanentemente da Evolution
      await api.delete(`/instance/delete/${userId}`).catch((err) => {
         console.warn(`[EvolutionAPI] Delete failed for ${userId}:`, err.response?.data || err.message);
      });
    } catch (error: any) {
      console.error(`[EvolutionAPI] Critical error during logout:`, error.response?.data || error.message);
    }
  }

  static async sendMessage(userId: string, to: string, text: string) {
    const api = getApi();
    try {
      const { data } = await api.post(`/message/sendText/${userId}`, {
        number: to,
        text: text,
        options: {
          delay: 1200,
          presence: 'composing',
          linkPreview: false
        }
      });
      return data;
    } catch (error: any) {
      const errorBody = error.response?.data;
      console.error(`[EvolutionAPI] Error sending text to ${to}:`, JSON.stringify(errorBody || error.message));
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

  static async getMediaBase64(instanceName: string, messageKey: any, messageContent: any) {
    const api = getApi();
    try {
      const { data } = await api.post(`/chat/getBase64FromMediaMessage/${instanceName}`, {
        message: {
          key: messageKey,
          message: messageContent
        }
      });
      return data.base64 || data;
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error fetching media base64 for ${instanceName}:`, error.response?.data || error.message);
      return null;
    }
  }

  static async fetchMessages(instanceName: string) {
    const api = getApi();
    try {
      // O endpoint /chat/findMessages agora é um POST na v2
      // Ele serve como redundância caso o webhook falhe
      const { data } = await api.post(`/chat/findMessages/${instanceName}`, { 
        read: false, // Opcional: apenas não lidas
        limit: 10
      });
      return data;
    } catch (error: any) {
      console.error(`[EvolutionAPI] Error fetching messages for ${instanceName}:`, error.response?.data || error.message);
      return [];
    }
  }

  static async fetchProfilePictureUrl(instanceName: string, number: string) {
    const api = getApi();
    try {
      const cleanNumber = number.split('@')[0].replace(/\D/g, '');
      const { data } = await api.post(`/chat/fetchProfilePictureUrl/${instanceName}`, { 
        number: cleanNumber
      });
      // Retorna { profilePictureUrl: "https://..." }
      return data.profilePictureUrl || null;
    } catch (error: any) {
      // Se não tiver foto, a API costuma retornar 404 ou erro, tratamos como nulo
      return null;
    }
  }
}
