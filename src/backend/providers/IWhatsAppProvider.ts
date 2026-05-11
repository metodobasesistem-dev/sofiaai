/**
 * IWhatsAppProvider - Standard Port for WhatsApp Communication
 * Following the Ports and Adapters (Hexagonal Architecture) pattern.
 */

export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  contactName?: string;
  isGroup: boolean;
  fromMe: boolean;
  timestamp: number;
  type?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
  reaction?: string;
  reactionTargetId?: string;
  quotedId?: string;
  quotedText?: string;
  raw?: any;
  contactJid?: string;
}

export interface WhatsAppStatus {
  status: 'connected' | 'disconnected' | 'connecting' | 'qrcode';
  qrcode?: string;
}

export interface WhatsAppConfig {
  apiKey?: string;
  url?: string;
  token?: string;
  [key: string]: any;
}

export interface IWhatsAppProvider {
  /**
   * Initializes and connects to the WhatsApp instance
   */
  connect(instanceId: string, config: WhatsAppConfig): Promise<void>;

  /**
   * Gracefully disconnects the instance
   */
  disconnect(instanceId: string): Promise<void>;

  /**
   * Checks current connection status
   */
  getStatus(instanceId: string): Promise<WhatsAppStatus>;

  /**
   * Sends a simple text message
   */
  sendMessage(instanceId: string, to: string, message: string, quoted?: { id: string, fromMe: boolean, text?: string }): Promise<{ messageId: string }>;

  /**
   * Sends media (image, video, document)
   */
  sendMedia(instanceId: string, to: string, mediaUrl: string, caption?: string, type?: 'image' | 'video' | 'document' | 'audio'): Promise<{ messageId: string }>;

  /**
   * Fetches profile picture URL for a contact
   */
  fetchProfilePictureUrl(instanceId: string, number: string): Promise<string | null>;

  /**
   * Fetches base64 content from a media message
   */
  getMediaBase64(instanceId: string, messageKey: any, messageContent: any): Promise<string | null>;

  /**
   * Requests a pairing code for phone-number based connection
   */
  requestPairingCode(instanceId: string, phoneNumber: string): Promise<string>;

  /**
   * Sets up the webhook handler for incoming messages
   */
  onMessageReceived(handler: (message: WhatsAppMessage) => Promise<void>): void;

  /**
   * Transforms provider-specific payload to generic WhatsAppMessage
   */
  transformPayload(payload: any): WhatsAppMessage | null;

  /**
   * Sends a reaction (emoji) to a specific message
   */
  sendReaction(instanceId: string, remoteJid: string, messageId: string, emoji: string, fromMe: boolean): Promise<boolean>;

  /**
   * Deletes a message for everyone (if possible) or just for the user
   */
  deleteMessage(instanceId: string, remoteJid: string, messageId: string, fromMe: boolean): Promise<boolean>;
}
