import axios, { AxiosInstance } from 'axios';
import { IWhatsAppProvider, WhatsAppMessage, WhatsAppStatus, WhatsAppConfig } from './IWhatsAppProvider.js';

export class MetaProvider implements IWhatsAppProvider {
  private messageHandler: ((message: WhatsAppMessage) => Promise<void>) | null = null;
  private readonly baseUrl = 'https://graph.facebook.com/v19.0';

  private async getClient(instanceId: string): Promise<AxiosInstance> {
    // In a real implementation, you'd fetch the user's token based on instanceId
    // which maps to their user_id or profile in the database.
    // For this stub, we'll assume the token is passed or fetched.
    const token = process.env.META_ACCESS_TOKEN || 'TODO_FETCH_FROM_DB';
    
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async connect(instanceId: string, config: WhatsAppConfig): Promise<void> {
    // Meta API doesn't have a dynamic "connect" step via QR code.
    // The connection is established by providing valid tokens in the CRM UI.
    console.log(`[MetaProvider] "Connected" meta configuration for instance: ${instanceId}`);
  }

  async disconnect(instanceId: string): Promise<void> {
    // Disconnection is simply clearing the tokens from the DB in the UI.
    console.log(`[MetaProvider] Disconnected meta configuration for instance: ${instanceId}`);
  }

  async getStatus(instanceId: string): Promise<WhatsAppStatus> {
    // If we have tokens, we're connected.
    return { status: 'connected' };
  }

  async sendMessage(instanceId: string, to: string, message: string, quotedMessageId?: string): Promise<{ messageId: string }> {
    const api = await this.getClient(instanceId);
    const phoneId = process.env.META_PHONE_ID || 'TODO_FETCH_FROM_DB';
    
    const { data } = await api.post(`/${phoneId}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/\D/g, ''),
      type: "text",
      text: {
        preview_url: false,
        body: message
      },
      ...(quotedMessageId ? { context: { message_id: quotedMessageId } } : {})
    });
    
    return { messageId: data.messages?.[0]?.id || '' };
  }

  async sendMedia(instanceId: string, to: string, mediaUrl: string, caption?: string, type: 'image' | 'video' | 'document' | 'audio' = 'image'): Promise<{ messageId: string }> {
    const api = await this.getClient(instanceId);
    const phoneId = process.env.META_PHONE_ID || 'TODO_FETCH_FROM_DB';
    
    const payload: any = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/\D/g, ''),
      type: type,
    };
    
    payload[type] = { link: mediaUrl };
    if (caption && type !== 'audio') {
      payload[type].caption = caption;
    }
    
    const { data } = await api.post(`/${phoneId}/messages`, payload);
    return { messageId: data.messages?.[0]?.id || '' };
  }

  async fetchProfilePictureUrl(instanceId: string, number: string): Promise<string | null> {
    // Meta API doesn't provide an easy way to fetch a user's profile picture.
    return null;
  }

  async getMediaBase64(instanceId: string, messageKey: any, messageContent: any): Promise<string | null> {
    const api = await this.getClient(instanceId);
    try {
      // 1. Fetch media URL using the media ID (messageContent is the media ID here)
      const { data: mediaData } = await api.get(`/${messageContent}`);
      
      // 2. Download the media
      const response = await api.get(mediaData.url, { responseType: 'arraybuffer' });
      return Buffer.from(response.data, 'binary').toString('base64');
    } catch (error) {
      console.error(`[MetaProvider] Error fetching media:`, error);
      return null;
    }
  }

  async requestPairingCode(instanceId: string, phoneNumber: string): Promise<string> {
    throw new Error('Pairing codes are not supported on Meta Official API.');
  }

  onMessageReceived(handler: (message: WhatsAppMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  transformPayload(payload: any): WhatsAppMessage | null {
    // Implementation to convert Meta's webhook payload to our generic WhatsAppMessage format.
    try {
      if (payload.object !== 'whatsapp_business_account') return null;
      
      const entry = payload.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      if (!change || !change.messages || change.messages.length === 0) return null;
      
      const message = change.messages[0];
      const contact = change.contacts?.[0];
      
      let body = '';
      let type = message.type;
      let mediaId = undefined;
      let mimeType = undefined;
      
      if (type === 'text') {
        body = message.text.body;
      } else if (type === 'image') {
        body = '[Imagem]';
        mediaId = message.image.id;
        mimeType = message.image.mime_type;
      } else if (type === 'audio') {
        body = '[Áudio]';
        mediaId = message.audio.id;
        mimeType = message.audio.mime_type;
      } else if (type === 'document') {
        body = '[Documento]';
        mediaId = message.document.id;
        mimeType = message.document.mime_type;
      }
      
      return {
        id: message.id,
        from: message.from, // Customer's phone number
        to: change.metadata.display_phone_number, // Business phone number
        body: body,
        contactName: contact?.profile?.name || '',
        isGroup: false, // Meta API doesn't support groups
        fromMe: false, // Webhooks from Meta are only inbound
        timestamp: parseInt(message.timestamp),
        type,
        raw: message, // Store mediaId here for later fetching if needed
      };
    } catch (e) {
      return null;
    }
  }

  async deleteMessage(instanceId: string, remoteJid: string, messageId: string, fromMe: boolean): Promise<boolean> {
    console.warn('[MetaProvider] Deleting messages is not supported via Meta Cloud API.');
    return false;
  }

  async sendReaction(instanceId: string, remoteJid: string, messageId: string, emoji: string, fromMe: boolean): Promise<boolean> {
    const api = await this.getClient(instanceId);
    const phoneId = process.env.META_PHONE_ID || 'TODO_FETCH_FROM_DB';
    
    try {
      await api.post(`/${phoneId}/messages`, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: remoteJid.replace(/\D/g, ''),
        type: "reaction",
        reaction: {
          message_id: messageId,
          emoji: emoji
        }
      });
      return true;
    } catch (error) {
      console.error(`[MetaProvider] Error sending reaction:`, error);
      return false;
    }
  }
}
