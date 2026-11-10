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

  async sendMedia(instanceId: string, to: string, mediaUrl: string, caption?: string, type: 'image' | 'video' | 'document' | 'audio' = 'image', mimetype?: string, filename?: string): Promise<{ messageId: string }> {
    const cleanNumber = to.replace(/\D/g, '');
    
    // Se a mídia vier com prefixo data URL (ex: "data:video/mp4;base64,AAAA..."),
    // remove o prefixo para que a Evolution API receba a string Base64 pura,
    // evitando o erro "Owned media must be a url or base64 - Bad Request"
    let cleanMedia = mediaUrl;
    if (cleanMedia && cleanMedia.includes(';base64,')) {
      cleanMedia = cleanMedia.split(';base64,')[1];
    }

    let endpoint = `/message/sendMedia/${instanceId}`;
    let payload: any = {
      number: cleanNumber,
      media: cleanMedia,
      mediatype: type === 'audio' ? 'audio' : type,
      options: { delay: 1200 }
    };

    if (caption && caption.trim()) {
      payload.caption = caption.trim();
    }

    if (mimetype) {
      payload.mimetype = mimetype;
    }
    if (filename) {
      payload.fileName = filename;
    }

    if (type === 'audio') {
      endpoint = `/message/sendWhatsAppAudio/${instanceId}`;
      payload = {
        number: cleanNumber,
        audio: cleanMedia,
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
    const cleanNumber = to.split('@')[0].replace(/\D/g, '');
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

  async fetchMediaForMessage(instanceId: string, whatsappId: string): Promise<string | null> {
    try {
      let messageKey: any = { id: whatsappId };
      let messageContent: any = null;

      try {
        const findRes = await this.api.post(`/chat/findMessages/${instanceId}`, {
          where: {
            id: whatsappId
          }
        });
        const records = Array.isArray(findRes.data) ? findRes.data : (findRes.data?.records || [findRes.data]);
        const msgObj = records.find((m: any) => m?.key?.id === whatsappId || m?.id === whatsappId) || records[0];
        if (msgObj) {
          if (msgObj.key) messageKey = msgObj.key;
          if (msgObj.message) messageContent = msgObj.message;
        }
      } catch (findErr: any) {
        console.warn(`[EvolutionProvider] findMessages fallback para ${whatsappId}:`, findErr?.message);
      }

      const payload: any = {
        message: {
          key: messageKey
        },
        convertToMp4: false
      };
      if (messageContent) {
        payload.message.message = messageContent;
      }

      const { data } = await this.api.post(`/chat/getBase64FromMediaMessage/${instanceId}`, payload);

      let base64: string | null = null;
      if (typeof data === 'string' && data.length > 0) {
        base64 = data;
      } else if (data && typeof data.base64 === 'string' && data.base64.length > 0) {
        base64 = data.base64;
      }

      if (base64 && base64.includes(';base64,')) {
        base64 = base64.split(';base64,')[1];
      }

      return base64 || null;
    } catch (error: any) {
      console.error(`[EvolutionProvider] fetchMediaForMessage falhou para ${whatsappId}:`, error.response?.status, error.message);
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
    
    // Desembrulha containers comuns do Baileys/WhatsApp Webhook
    let unwrapped = true;
    while (unwrapped && messageContent) {
      unwrapped = false;
      if (messageContent.ephemeralMessage?.message) {
        messageContent = messageContent.ephemeralMessage.message;
        unwrapped = true;
      } else if (messageContent.viewOnceMessage?.message) {
        messageContent = messageContent.viewOnceMessage.message;
        unwrapped = true;
      } else if (messageContent.viewOnceMessageV2?.message) {
        messageContent = messageContent.viewOnceMessageV2.message;
        unwrapped = true;
      } else if (messageContent.viewOnceMessageV2Extension?.message) {
        messageContent = messageContent.viewOnceMessageV2Extension.message;
        unwrapped = true;
      } else if (messageContent.documentWithCaptionMessage?.message) {
        messageContent = messageContent.documentWithCaptionMessage.message;
        unwrapped = true;
      }
    }

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
      type = 'template';
      const tm = messageContent.templateMessage;
      const hydrated = tm.hydratedTemplate || tm.hydratedFourRowTemplate;
      const fourRow = tm.fourRowTemplate;
      const interactive = tm.interactiveMessageTemplate;

      const parts: string[] = [];
      const buttonsList: string[] = [];

      if (hydrated) {
        const titleText = hydrated.hydratedTitleText || hydrated.title?.contentText;
        if (titleText && typeof titleText === 'string') parts.push(`*${titleText.trim()}*`);

        if (hydrated.imageMessage) {
          mediaUrl = hydrated.imageMessage.url;
          mimeType = hydrated.imageMessage.mimetype || 'image/jpeg';
          mediaBase64 = hydrated.imageMessage.base64 || undefined;
          if (hydrated.imageMessage.caption) parts.push(hydrated.imageMessage.caption.trim());
        } else if (hydrated.documentMessage) {
          fileName = hydrated.documentMessage.fileName;
          mimeType = hydrated.documentMessage.mimetype;
          mediaUrl = hydrated.documentMessage.url;
          mediaBase64 = hydrated.documentMessage.base64 || undefined;
        } else if (hydrated.videoMessage) {
          mediaUrl = hydrated.videoMessage.url;
          mimeType = hydrated.videoMessage.mimetype || 'video/mp4';
          mediaBase64 = hydrated.videoMessage.base64 || undefined;
          if (hydrated.videoMessage.caption) parts.push(hydrated.videoMessage.caption.trim());
        }

        if (hydrated.hydratedContentText) {
          parts.push(hydrated.hydratedContentText.trim());
        }

        if (hydrated.hydratedFooterText) {
          parts.push(hydrated.hydratedFooterText.trim());
        }

        if (Array.isArray(hydrated.hydratedButtons)) {
          for (const btn of hydrated.hydratedButtons) {
            if (btn.urlButton?.displayText) {
              const url = btn.urlButton.url ? ` (${btn.urlButton.url})` : '';
              buttonsList.push(`[🔗 ${btn.urlButton.displayText}${url}]`);
            } else if (btn.quickReplyButton?.displayText) {
              buttonsList.push(`[🔘 ${btn.quickReplyButton.displayText}]`);
            } else if (btn.callButton?.displayText) {
              const phone = btn.callButton.phoneNumber ? ` (${btn.callButton.phoneNumber})` : '';
              buttonsList.push(`[📞 ${btn.callButton.displayText}${phone}]`);
            }
          }
        }
      } else if (fourRow) {
        const title = fourRow.title?.contentText || fourRow.title;
        if (typeof title === 'string' && title.trim()) parts.push(`*${title.trim()}*`);

        const content = fourRow.content?.contentText || fourRow.contentText;
        if (typeof content === 'string' && content.trim()) parts.push(content.trim());

        const footer = fourRow.footer?.contentText || fourRow.footerText;
        if (typeof footer === 'string' && footer.trim()) parts.push(footer.trim());

        if (Array.isArray(fourRow.buttons)) {
          for (const btn of fourRow.buttons) {
            const txt = btn.buttonText?.displayText || btn.displayText || btn.buttonId;
            if (txt) buttonsList.push(`[🔘 ${txt}]`);
          }
        }
      } else if (interactive) {
        const headerText = interactive.header?.title || interactive.header?.text || interactive.header?.subtitle;
        if (headerText && typeof headerText === 'string') parts.push(`*${headerText.trim()}*`);

        if (interactive.header?.imageMessage) {
          mediaUrl = interactive.header.imageMessage.url;
          mimeType = interactive.header.imageMessage.mimetype || 'image/jpeg';
          mediaBase64 = interactive.header.imageMessage.base64 || undefined;
        }

        if (interactive.body?.text) parts.push(interactive.body.text.trim());
        if (interactive.footer?.text) parts.push(interactive.footer.text.trim());

        if (Array.isArray(interactive.nativeFlowMessage?.buttons)) {
          for (const btn of interactive.nativeFlowMessage.buttons) {
            let label = btn.name || 'Opção';
            try {
              const params = typeof btn.buttonParamsJson === 'string' ? JSON.parse(btn.buttonParamsJson) : btn.buttonParamsJson;
              if (params?.display_text) {
                label = params.url ? `🔗 ${params.display_text} (${params.url})` : `🔘 ${params.display_text}`;
              }
            } catch {}
            buttonsList.push(`[${label}]`);
          }
        }
      }

      if (buttonsList.length > 0) {
        parts.push(buttonsList.join('\n'));
      }

      body = parts.filter(Boolean).join('\n\n') || '[Mensagem de Template]';
    } else if (messageContent.interactiveMessage) {
      type = 'interactive';
      const im = messageContent.interactiveMessage;
      const parts: string[] = [];
      const buttonsList: string[] = [];

      const headerText = im.header?.title || im.header?.text || im.header?.subtitle;
      if (headerText && typeof headerText === 'string') parts.push(`*${headerText.trim()}*`);

      if (im.header?.imageMessage) {
        mediaUrl = im.header.imageMessage.url;
        mimeType = im.header.imageMessage.mimetype || 'image/jpeg';
        mediaBase64 = im.header.imageMessage.base64 || undefined;
      }

      if (im.body?.text) parts.push(im.body.text.trim());
      if (im.footer?.text) parts.push(im.footer.text.trim());

      if (Array.isArray(im.nativeFlowMessage?.buttons)) {
        for (const btn of im.nativeFlowMessage.buttons) {
          let label = btn.name || 'Opção';
          try {
            const params = typeof btn.buttonParamsJson === 'string' ? JSON.parse(btn.buttonParamsJson) : btn.buttonParamsJson;
            if (params?.display_text) {
              label = params.url ? `🔗 ${params.display_text} (${params.url})` : `🔘 ${params.display_text}`;
            }
          } catch {}
          buttonsList.push(`[${label}]`);
        }
      }

      if (buttonsList.length > 0) {
        parts.push(buttonsList.join('\n'));
      }

      body = parts.filter(Boolean).join('\n\n') || '[Mensagem Interativa]';
    } else if (messageContent.buttonsMessage) {
      type = 'buttons';
      const bm = messageContent.buttonsMessage;
      const parts: string[] = [];
      const buttonsList: string[] = [];

      const header = bm.headerText || (typeof bm.header === 'string' ? bm.header : '');
      if (header) parts.push(`*${header.trim()}*`);
      if (bm.contentText) parts.push(bm.contentText.trim());
      if (bm.footerText) parts.push(bm.footerText.trim());

      if (Array.isArray(bm.buttons)) {
        for (const btn of bm.buttons) {
          const txt = btn.buttonText?.displayText || btn.buttonId;
          if (txt) buttonsList.push(`[🔘 ${txt}]`);
        }
      }

      if (buttonsList.length > 0) {
        parts.push(buttonsList.join('\n'));
      }

      body = parts.filter(Boolean).join('\n\n') || '[Mensagem com Botões]';
    } else if (messageContent.listMessage) {
      type = 'list';
      const lm = messageContent.listMessage;
      const parts: string[] = [];

      if (lm.title) parts.push(`*${lm.title.trim()}*`);
      if (lm.description) parts.push(lm.description.trim());
      if (lm.footerText) parts.push(lm.footerText.trim());

      if (Array.isArray(lm.sections)) {
        for (const sec of lm.sections) {
          if (sec.title) parts.push(`*${sec.title}*`);
          if (Array.isArray(sec.rows)) {
            for (const row of sec.rows) {
              const rowDesc = row.description ? ` - ${row.description}` : '';
              parts.push(`• ${row.title || ''}${rowDesc}`);
            }
          }
        }
      }

      if (lm.buttonText) parts.push(`[📋 ${lm.buttonText}]`);

      body = parts.filter(Boolean).join('\n\n') || '[Lista de Opções]';
    } else if (messageContent.templateButtonReplyMessage) {
      body = messageContent.templateButtonReplyMessage.selectedDisplayText || messageContent.templateButtonReplyMessage.selectedId || '[Resposta a botão]';
      type = 'text';
    } else if (messageContent.buttonsResponseMessage) {
      body = messageContent.buttonsResponseMessage.selectedDisplayText || messageContent.buttonsResponseMessage.selectedButtonId || '[Resposta a botão]';
      type = 'text';
    } else if (messageContent.listResponseMessage) {
      body = messageContent.listResponseMessage.title || messageContent.listResponseMessage.description || messageContent.listResponseMessage.singleSelectReply?.selectedRowId || '[Opção selecionada]';
      type = 'text';
    } else if (messageContent.interactiveResponseMessage) {
      const irm = messageContent.interactiveResponseMessage;
      body = irm.body?.text || irm.nativeFlowResponseMessage?.name || '[Resposta interativa]';
      type = 'text';
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
