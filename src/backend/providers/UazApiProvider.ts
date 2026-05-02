import { IWhatsAppProvider, WhatsAppMessage, WhatsAppStatus, WhatsAppConfig } from './IWhatsAppProvider.js';

export class UazApiProvider implements IWhatsAppProvider {
  async connect(): Promise<void> {
    throw new Error('UazApiProvider: Method not implemented.');
  }

  async disconnect(): Promise<void> {
    throw new Error('UazApiProvider: Method not implemented.');
  }

  async getStatus(): Promise<WhatsAppStatus> {
    throw new Error('UazApiProvider: Method not implemented.');
  }

  async sendMessage(): Promise<{ messageId: string }> {
    throw new Error('UazApiProvider: Method not implemented.');
  }

  async sendMedia(): Promise<{ messageId: string }> {
    throw new Error('UazApiProvider: Method not implemented.');
  }

  async fetchProfilePictureUrl(): Promise<string | null> {
    throw new Error('UazApiProvider: Method not implemented.');
  }

  async getMediaBase64(): Promise<string | null> {
    throw new Error('UazApiProvider: Method not implemented.');
  }

  onMessageReceived(): void {
    // Stub
  }

  transformPayload(): WhatsAppMessage | null {
    return null;
  }
}
