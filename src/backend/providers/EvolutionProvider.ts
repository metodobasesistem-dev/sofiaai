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
    const INSTANCE_TOKEN = process.env.EVOLUTION_AUTH_BASE64;
    if (!INSTANCE_TOKEN) throw new Error('EVOLUTION_AUTH_BASE64 env var is not set');
    
    try {
      await this.api.post('/instance/create', {
        instanceName: instanceId,
        token: INSTANCE_TOKEN,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        clientName: 'Sofia - Assistente Virtual',
        browser: ['Sofia', 'Chrome', '3.0']
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
    let WEBHOOK_URL = process.env.BACKEND_WEBHOOK_URL || '';
    if (!WEBHOOK_URL) return;

    const SECRET = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (SECRET && !WEBHOOK_URL.includes('token=')) {
      const separator = WEBHOOK_URL.includes('?') ? '&' : '?';
      WEBHOOK_URL = `${WEBHOOK_URL}${separator}token=${SECRET}`;
    }

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

  async getStatus(instanceId: string, forceQRCode: boolean = false): Promise<WhatsAppStatus> {
    try {
      const { data } = await this.api.get(`/instance/connectionState/${instanceId}`);
      const state = data.instance.state;
      
      if (state === 'open' || state === 'connected') {
        return { status: 'connected' };
      }
      
      if (state === 'connecting' || state === 'close' || state === 'refused') {
        if (forceQRCode) {
          try {
            const { data: qrData } = await this.api.get(`/instance/connect/${instanceId}`);
            if (qrData && qrData.base64) {
              return { 
                status: 'qrcode', 
                qrcode: qrData.base64.startsWith('data:') ? qrData.base64 : `data:image/png;base64,${qrData.base64}` 
              };
            }
          } catch (e) {}
        }
        // NÃO DEVEMOS fazer GET /instance/connect repetidamente para evitar Loop de QR Code.
        // A geração do QR Code inicial é feita se forceQRCode for true (na criação da sessão), e os updates via webhook.
        return { status: 'connecting' };
      }
      
      return { status: 'disconnected' };
    } catch (error) {
      return { status: 'disconnected' };
    }
  }

  async sendMessage(instanceId: string, to: string, message: string, quoted?: { id: string, fromMe: boolean, text?: string }): Promise<{ messageId: string }> {
    const cleanNumber = to.replace(/\D/g, '');
    const remoteJid = cleanNumber.includes('@') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;
    
    const payload: any = {
      number: cleanNumber,
      text: message,
      options: { 
        delay: 1200, 
        presence: 'composing'
      }
    };

    if (quoted) {
      payload.quoted = {
        key: {
          id: quoted.id,
          fromMe: quoted.fromMe,
          remoteJid: remoteJid
        },
        message: {
          conversation: quoted.text || "..."
        }
      };
    }

    const { data } = await this.api.post(`/message/sendText/${instanceId}`, payload);
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

  /**
   * Presença avulsa — usada enquanto o ATENDENTE digita no painel. O envio de
   * mensagem já leva presence junto; isto é para o intervalo antes disso.
   *
   * O WhatsApp expira o "digitando" sozinho depois de alguns segundos, então
   * o chamador reenvia enquanto houver digitação e manda 'paused' ao parar.
   */
  async sendPresence(instanceId: string, to: string, presence: 'composing' | 'recording' | 'paused'): Promise<void> {
    const cleanNumber = to.split('@')[0].replace(/D/g, '');
    try {
      await this.api.post(`/chat/sendPresence/${instanceId}`, {
        number: cleanNumber,
        presence,
        delay: presence === 'paused' ? 0 : 3000,
      });
    } catch (error: any) {
      // Sinal cosmético: um erro aqui não pode aparecer para o atendente nem
      // interromper o que ele está escrevendo.
      console.warn('[EvolutionProvider] sendPresence falhou:', error?.response?.status || error?.message);
    }
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

      let base64: string | null = null;
      if (typeof data === 'string' && data.length > 0) {
        base64 = data;
      } else if (data && typeof data.base64 === 'string' && data.base64.length > 0) {
        base64 = data.base64;
      } else {
        console.warn('[EvolutionProvider] getBase64FromMediaMessage: resposta inesperada:', JSON.stringify(data)?.slice(0, 200));
        return null;
      }

      // Strip data URL prefix if Evolution returns "data:image/jpeg;base64,..."
      if (base64.includes(';base64,')) {
        base64 = base64.split(';base64,')[1];
      }

      return base64 || null;
    } catch (error: any) {
      console.error('[EvolutionProvider] getBase64FromMediaMessage falhou:', error.response?.status, JSON.stringify(error.response?.data || error.message)?.slice(0, 300));
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
    const event = (payload.event || '').toLowerCase().replace(/_/g, '.');
    if (event !== 'messages.upsert' && event !== 'send.message') return null;
    
    let messageData = payload.data;
    if (!messageData) return null;

    // Evolution as vezes manda um objeto direto, as vezes um array em data.messages
    if (Array.isArray(messageData.messages)) {
      messageData = messageData.messages[0];
    } else if (Array.isArray(messageData)) {
       messageData = messageData[0];
    }

    if (!messageData || !messageData.key) return null;

    const from = messageData.key?.remoteJid || '';
    
    // Suporte para estrutura aninhada ou direta
    let messageContent = messageData.message || messageData;
    
    // Se for um wrapper com messageContextInfo, tenta pegar o conteúdo real
    if (messageContent.messageContextInfo && Object.keys(messageContent).length > 1) {
        // O conteúdo real está junto com o messageContextInfo
    }

    // Extract Context Info (Quoted Message)
    let quotedId = undefined;
    let quotedText = undefined;
    const contextInfo = messageContent.extendedTextMessage?.contextInfo || 
                        messageContent.imageMessage?.contextInfo || 
                        messageContent.videoMessage?.contextInfo || 
                        messageContent.audioMessage?.contextInfo || 
                        messageContent.documentMessage?.contextInfo || 
                        messageContent.contextInfo;

    if (contextInfo?.quotedMessage) {
      quotedId = contextInfo.stanzaId || contextInfo.quotedMessage.key?.id;
      const qm = contextInfo.quotedMessage;
      quotedText = qm.conversation || qm.extendedTextMessage?.text || 
                   (qm.imageMessage ? '[Imagem]' : qm.videoMessage ? '[Vídeo]' : qm.audioMessage ? '[Áudio]' : qm.documentMessage ? '[Documento]' : '[Mídia]');
    }

    let body = '';
    let type = 'text';
    let mediaUrl = undefined;
    let mediaBase64 = undefined;
    let mimeType = undefined;
    let fileName = undefined;
    let caption = undefined;
    let contactJid = undefined;

    // Extract content based on message type
    const reactionMsg = messageContent.reactionMessage || messageData.reactionMessage || (messageData.message && messageData.message.reactionMessage);

    if (reactionMsg) {
      body = `[Reação]: ${reactionMsg.text || ''}`;
      type = 'reaction';
    } else if (messageContent.conversation) {
      body = messageContent.conversation;
      type = 'text';
    } else if (messageContent.extendedTextMessage) {
      body = messageContent.extendedTextMessage.text || '';
      type = 'text';
    } else if (messageContent.imageMessage) {
      body = '[Imagem]';
      type = 'image';
      caption = messageContent.imageMessage.caption;
      mimeType = messageContent.imageMessage.mimetype;
      mediaBase64 = messageContent.imageMessage.base64 || undefined;
    } else if (messageContent.videoMessage) {
      body = '[Vídeo]';
      type = 'video';
      caption = messageContent.videoMessage.caption;
      mimeType = messageContent.videoMessage.mimetype;
      mediaBase64 = messageContent.videoMessage.base64 || undefined;
    } else if (messageContent.audioMessage) {
      body = '[Áudio]';
      type = 'audio';
      mimeType = messageContent.audioMessage.mimetype;
      mediaBase64 = messageContent.audioMessage.base64 || undefined;
    } else if (messageContent.documentMessage) {
      body = `[Documento]: ${messageContent.documentMessage.fileName || 'arquivo'}`;
      type = 'document';
      fileName = messageContent.documentMessage.fileName;
      mimeType = messageContent.documentMessage.mimetype;
      mediaBase64 = messageContent.documentMessage.base64 || undefined;
    } else if (messageContent.stickerMessage) {
      body = '[Figurinha]';
      type = 'sticker';
      mimeType = messageContent.stickerMessage.mimetype;
      mediaBase64 = messageContent.stickerMessage.base64 || undefined;
    } else if (messageContent.contactMessage) {
      body = `[Contato]: ${messageContent.contactMessage.displayName || ''}`;
      type = 'contact';
      
      // Extrair JID do vCard
      const vcard = messageContent.contactMessage.vcard || '';
      const waidMatch = vcard.match(/waid=([^:;]+)/);
      if (waidMatch && waidMatch[1]) {
        contactJid = `${waidMatch[1]}@s.whatsapp.net`;
      } else {
        const telMatch = vcard.match(/TEL.*:([^\n\r]+)/);
        if (telMatch && telMatch[1]) {
          const num = telMatch[1].replace(/\D/g, '');
          if (num) contactJid = `${num}@s.whatsapp.net`;
        }
      }
    } else if (messageContent.locationMessage) {
      body = `[Localização]: ${messageContent.locationMessage.degreesLatitude}, ${messageContent.locationMessage.degreesLongitude}`;
      type = 'location';
    } else if (messageContent.templateMessage) {
      body = '[Mensagem de Template]';
      type = 'template';
    } else if (messageContent.interactiveMessage) {
      body = '[Mensagem Interativa/Botão]';
      type = 'interactive';
    } else if (messageContent.buttonsMessage) {
      body = '[Mensagem com Botões]';
      type = 'buttons';
    } else if (messageContent.listMessage) {
      body = '[Lista de Opções]';
      type = 'list';
    } else if (messageContent.pollCreationMessage) {
      body = `[Enquete]: ${messageContent.pollCreationMessage.name || ''}`;
      type = 'poll';
    } else {
      // Fallback for unknown types - Pega a primeira chave que não seja metadado
      const ignoredKeys = ['messageContextInfo', 'senderKeyDistributionMessage', 'key', 'messageTimestamp', 'pushName', 'status'];
      const messageType = Object.keys(messageContent).find(k => !ignoredKeys.includes(k)) || Object.keys(messageContent)[0];
      body = `[Mensagem não suportada: ${messageType}]`;
      type = 'unknown';
    }

    return {
      id: messageData.key?.id || '',
      from: from,
      to: payload.instance || '',
      body: body,
      contactName: !messageData.key?.fromMe ? messageData.pushName : undefined,
      isGroup: from.includes('@g.us'),
      fromMe: !!messageData.key?.fromMe,
      timestamp: messageData.messageTimestamp || Math.floor(Date.now() / 1000),
      type,
      mediaUrl,
      mediaBase64,
      mimeType,
      fileName,
      caption,
      reaction: reactionMsg ? reactionMsg.text : undefined,
      reactionTargetId: reactionMsg ? reactionMsg.key?.id : undefined,
      quotedId,
      quotedText,
      raw: messageData,
      contactJid
    };
  }

  async deleteMessage(instanceId: string, remoteJid: string, messageId: string, fromMe: boolean): Promise<boolean> {
    try {
      await this.api.post(`/chat/deleteMessage/${instanceId}`, {
        key: {
          remoteJid: remoteJid,
          fromMe: fromMe,
          id: messageId
        }
      });
      return true;
    } catch (error) {
      console.error(`[EvolutionProvider] Error deleting message ${messageId}:`, error);
      return false;
    }
  }

  async sendReaction(instanceId: string, remoteJid: string, messageId: string, emoji: string, fromMe: boolean): Promise<boolean> {
    try {
      await this.api.post(`/message/sendReaction/${instanceId}`, {
        reaction: emoji,
        key: {
          remoteJid: remoteJid,
          fromMe: fromMe,
          id: messageId
        }
      });
      return true;
    } catch (error) {
      console.error(`[EvolutionProvider] Error sending reaction to ${messageId}:`, error);
      return false;
    }
  }
}
