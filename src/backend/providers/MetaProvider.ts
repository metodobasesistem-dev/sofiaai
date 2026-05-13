import axios, { AxiosInstance } from 'axios';
import { IWhatsAppProvider, WhatsAppMessage, WhatsAppStatus, WhatsAppConfig } from './IWhatsAppProvider.js';
import { supabase } from '../lib/supabaseClient.js';

interface MetaCredentials {
  accessToken: string;
  phoneId: string;
  wabaId: string | null;
}

interface CachedCredentials {
  creds: MetaCredentials;
  expiresAt: number;
}

const CREDENTIALS_CACHE = new Map<string, CachedCredentials>();
const CREDENTIALS_TTL_MS = 60 * 1000;

export class MetaProvider implements IWhatsAppProvider {
  private messageHandler: ((message: WhatsAppMessage) => Promise<void>) | null = null;
  private readonly baseUrl = 'https://graph.facebook.com/v19.0';
  private readonly tenantUserId: string | undefined;

  constructor(userId?: string) {
    this.tenantUserId = userId;
  }

  /**
   * Resolves the tenant userId from either the constructor injection or the
   * instanceId argument (which the factory may pass through as userId).
   */
  private resolveTenantId(instanceId: string): string {
    return this.tenantUserId || instanceId;
  }

  private async getCredentials(instanceId: string): Promise<MetaCredentials> {
    const tenantId = this.resolveTenantId(instanceId);
    const cached = CREDENTIALS_CACHE.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.creds;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('meta_access_token, meta_phone_id, meta_waba_id')
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      throw new Error(`[MetaProvider] Failed to load credentials for ${tenantId}: ${error.message}`);
    }
    if (!profile?.meta_access_token || !profile?.meta_phone_id) {
      throw new Error(`[MetaProvider] Missing Meta credentials for tenant ${tenantId}. Configure meta_access_token and meta_phone_id in profile.`);
    }

    const creds: MetaCredentials = {
      accessToken: profile.meta_access_token,
      phoneId: profile.meta_phone_id,
      wabaId: profile.meta_waba_id || null,
    };
    CREDENTIALS_CACHE.set(tenantId, { creds, expiresAt: Date.now() + CREDENTIALS_TTL_MS });
    return creds;
  }

  /**
   * Invalidates the cached credentials for a tenant. Call after admin updates
   * Meta tokens to force a refresh on next API call.
   */
  static invalidateCredentialCache(userId: string): void {
    CREDENTIALS_CACHE.delete(userId);
  }

  private async getClient(instanceId: string): Promise<{ api: AxiosInstance; creds: MetaCredentials }> {
    const creds = await this.getCredentials(instanceId);
    const api = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    return { api, creds };
  }

  async connect(instanceId: string, config: WhatsAppConfig): Promise<void> {
    // Meta Official API does not require a "connect" handshake. Sessions are
    // authenticated via long-lived access tokens stored in profiles. We just
    // validate the credentials exist.
    await this.getCredentials(instanceId);
    console.log(`[MetaProvider] Credentials validated for tenant: ${this.resolveTenantId(instanceId)}`);
  }

  async disconnect(instanceId: string): Promise<void> {
    MetaProvider.invalidateCredentialCache(this.resolveTenantId(instanceId));
    console.log(`[MetaProvider] Disconnected (cache cleared) for tenant: ${this.resolveTenantId(instanceId)}`);
  }

  async getStatus(instanceId: string): Promise<WhatsAppStatus> {
    try {
      const { api, creds } = await this.getClient(instanceId);
      await api.get(`/${creds.phoneId}?fields=verified_name`);
      return { status: 'connected' };
    } catch {
      return { status: 'disconnected' };
    }
  }

  async sendMessage(instanceId: string, to: string, message: string, quoted?: { id: string, fromMe: boolean, text?: string }): Promise<{ messageId: string }> {
    const { api, creds } = await this.getClient(instanceId);
    const recipient = to.replace(/\D/g, '');

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: {
        preview_url: false,
        body: message,
      },
    };
    if (quoted?.id) {
      payload.context = { message_id: quoted.id };
    }

    const { data } = await api.post(`/${creds.phoneId}/messages`, payload);
    return { messageId: data.messages?.[0]?.id || '' };
  }

  async sendMedia(instanceId: string, to: string, mediaUrl: string, caption?: string, type: 'image' | 'video' | 'document' | 'audio' = 'image'): Promise<{ messageId: string }> {
    const { api, creds } = await this.getClient(instanceId);
    const recipient = to.replace(/\D/g, '');

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type,
    };
    payload[type] = { link: mediaUrl };
    if (caption && type !== 'audio') {
      payload[type].caption = caption;
    }

    const { data } = await api.post(`/${creds.phoneId}/messages`, payload);
    return { messageId: data.messages?.[0]?.id || '' };
  }

  async fetchProfilePictureUrl(_instanceId: string, _number: string): Promise<string | null> {
    // Meta Cloud API does not expose contact profile pictures.
    return null;
  }

  async getMediaBase64(instanceId: string, _messageKey: any, messageContent: any): Promise<string | null> {
    // Meta media fetch is a 2-step flow:
    //   1) GET /{media_id} -> returns a short-lived signed URL
    //   2) GET <signed_url> -> downloads the binary
    const { api, creds } = await this.getClient(instanceId);

    // messageContent in our pipeline carries the raw Meta message — extract id by type
    const mediaId = messageContent?.image?.id
      || messageContent?.video?.id
      || messageContent?.audio?.id
      || messageContent?.document?.id
      || messageContent?.sticker?.id
      || (typeof messageContent === 'string' ? messageContent : null);

    if (!mediaId) {
      console.warn('[MetaProvider] No media id found in message content');
      return null;
    }

    try {
      const { data: lookup } = await api.get(`/${mediaId}`);
      if (!lookup?.url) return null;

      const download = await axios.get(lookup.url, {
        headers: { 'Authorization': `Bearer ${creds.accessToken}` },
        responseType: 'arraybuffer',
        timeout: 60000,
      });
      return Buffer.from(download.data).toString('base64');
    } catch (error: any) {
      console.error(`[MetaProvider] Error fetching media ${mediaId}:`, error.response?.data || error.message);
      return null;
    }
  }

  async requestPairingCode(_instanceId: string, _phoneNumber: string): Promise<string> {
    throw new Error('Pairing codes are not supported on Meta Official API. Use access tokens instead.');
  }

  onMessageReceived(handler: (message: WhatsAppMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  transformPayload(payload: any): WhatsAppMessage | null {
    try {
      if (payload?.object !== 'whatsapp_business_account') return null;

      const change = payload.entry?.[0]?.changes?.[0]?.value;
      if (!change) return null;

      // Status updates (delivery/read receipts) are handled by webhook router,
      // not as message ingestion. We return null here so the router can branch
      // on the raw payload separately.
      if (change.statuses && !change.messages) return null;

      const message = change.messages?.[0];
      if (!message) return null;

      const contact = change.contacts?.[0];
      const businessNumber = change.metadata?.display_phone_number || '';
      const type = message.type as string;

      let body = '';
      let caption: string | undefined;
      let mimeType: string | undefined;
      let fileName: string | undefined;
      let quotedId: string | undefined;
      let quotedText: string | undefined;

      // Quoted message context
      if (message.context?.id) {
        quotedId = message.context.id;
        quotedText = message.context.body || undefined;
      }

      switch (type) {
        case 'text':
          body = message.text?.body || '';
          break;
        case 'image':
          body = '[Imagem]';
          caption = message.image?.caption;
          mimeType = message.image?.mime_type;
          break;
        case 'video':
          body = '[Vídeo]';
          caption = message.video?.caption;
          mimeType = message.video?.mime_type;
          break;
        case 'audio':
          body = '[Áudio]';
          mimeType = message.audio?.mime_type;
          break;
        case 'document':
          fileName = message.document?.filename;
          body = `[Documento]: ${fileName || 'arquivo'}`;
          caption = message.document?.caption;
          mimeType = message.document?.mime_type;
          break;
        case 'sticker':
          body = '[Figurinha]';
          mimeType = message.sticker?.mime_type;
          break;
        case 'location':
          body = `[Localização]: ${message.location?.latitude}, ${message.location?.longitude}`;
          break;
        case 'contacts':
          body = `[Contato]: ${message.contacts?.[0]?.name?.formatted_name || ''}`;
          break;
        case 'reaction':
          return {
            id: message.id,
            from: message.from,
            to: businessNumber,
            body: '[Reação]',
            contactName: contact?.profile?.name || '',
            isGroup: false,
            fromMe: false,
            timestamp: parseInt(message.timestamp, 10) || Math.floor(Date.now() / 1000),
            type: 'reaction',
            reaction: message.reaction?.emoji,
            reactionTargetId: message.reaction?.message_id,
            raw: message,
          };
        case 'button':
          body = message.button?.text || '[Botão]';
          break;
        case 'interactive':
          body = message.interactive?.button_reply?.title
              || message.interactive?.list_reply?.title
              || '[Interativo]';
          break;
        default:
          body = `[Mensagem não suportada: ${type}]`;
      }

      return {
        id: message.id,
        from: message.from,
        to: businessNumber,
        body,
        contactName: contact?.profile?.name || '',
        isGroup: false,
        fromMe: false,
        timestamp: parseInt(message.timestamp, 10) || Math.floor(Date.now() / 1000),
        type,
        mimeType,
        fileName,
        caption,
        quotedId,
        quotedText,
        raw: message,
      };
    } catch (e) {
      console.error('[MetaProvider] transformPayload error:', e);
      return null;
    }
  }

  async deleteMessage(_instanceId: string, _remoteJid: string, _messageId: string, _fromMe: boolean): Promise<boolean> {
    // Meta Cloud API does not support deleting messages after they're sent.
    return false;
  }

  /**
   * Lists message templates approved on the tenant's WABA.
   * Requires meta_waba_id to be configured. Returns name/status/category/language/components.
   */
  async listTemplates(instanceId: string, opts: { limit?: number; status?: string } = {}): Promise<any[]> {
    const { api, creds } = await this.getClient(instanceId);
    if (!creds.wabaId) {
      throw new Error('[MetaProvider] meta_waba_id is not configured for this tenant');
    }
    const params: any = { limit: opts.limit || 100, fields: 'name,status,category,language,components,quality_score' };
    if (opts.status) params.status = opts.status;

    const out: any[] = [];
    let url = `/${creds.wabaId}/message_templates`;
    let pageParams = params;
    // Walk paginated results (Meta returns paging.next as absolute URL)
    while (url) {
      const { data } = await api.get(url, { params: pageParams });
      if (Array.isArray(data?.data)) out.push(...data.data);
      const next = data?.paging?.next;
      if (!next || out.length >= (opts.limit || 100)) break;
      url = next.replace(this.baseUrl, '');
      pageParams = undefined; // next URL already contains params
    }
    return out;
  }

  /**
   * Sends an approved template message. Required for re-engagement (>24h window).
   * components: array of { type: 'header'|'body'|'button', parameters: [...] }
   */
  async sendTemplate(
    instanceId: string,
    to: string,
    templateName: string,
    languageCode: string,
    components?: any[]
  ): Promise<{ messageId: string }> {
    const { api, creds } = await this.getClient(instanceId);
    const recipient = to.replace(/\D/g, '');

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };
    if (components && components.length > 0) {
      payload.template.components = components;
    }

    const { data } = await api.post(`/${creds.phoneId}/messages`, payload);
    return { messageId: data.messages?.[0]?.id || '' };
  }

  async sendReaction(instanceId: string, remoteJid: string, messageId: string, emoji: string, _fromMe: boolean): Promise<boolean> {
    try {
      const { api, creds } = await this.getClient(instanceId);
      await api.post(`/${creds.phoneId}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: remoteJid.replace(/\D/g, ''),
        type: 'reaction',
        reaction: {
          message_id: messageId,
          emoji,
        },
      });
      return true;
    } catch (error: any) {
      console.error('[MetaProvider] Error sending reaction:', error.response?.data || error.message);
      return false;
    }
  }
}
