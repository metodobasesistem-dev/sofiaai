import { Client, LocalAuth, Message, Events } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

// Initialize Firestore (assuming it's already initialized in server.ts)
const db = admin.firestore();

interface Session {
  client: Client;
  userId: string;
  status: 'waiting' | 'connected' | 'disconnected';
}

class WhatsAppWebJsManager {
  private sessions: Map<string, Session> = new Map();

  constructor() {
    // Ensure sessions directory exists for LocalAuth
    const sessionsDir = path.join(process.cwd(), '.wwebjs_auth');
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
  }

  async createSession(userId: string) {
    if (this.sessions.has(userId)) {
      const session = this.sessions.get(userId)!;
      if (session.status === 'connected') {
        return { status: 'connected', message: 'Already connected' };
      }
      // If disconnected or waiting, we might want to re-init or just return current status
      return { status: session.status, message: 'Session already exists' };
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: userId,
        dataPath: path.join(process.cwd(), '.wwebjs_auth')
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ],
      }
    });

    this.sessions.set(userId, { client, userId, status: 'waiting' });

    client.on('qr', async (qr) => {
      console.log(`QR received for user ${userId}`);
      const qrDataUrl = await qrcode.toDataURL(qr);
      
      await db.collection('sessions').doc(userId).set({
        userId,
        qr: qrDataUrl,
        status: 'waiting',
        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    client.on('ready', async () => {
      console.log(`Client is ready for user ${userId}`);
      this.sessions.get(userId)!.status = 'connected';
      
      await db.collection('sessions').doc(userId).set({
        qr: null,
        status: 'connected',
        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    client.on('disconnected', async (reason) => {
      console.log(`Client was logged out for user ${userId}:`, reason);
      this.sessions.get(userId)!.status = 'disconnected';
      
      await db.collection('sessions').doc(userId).set({
        status: 'disconnected',
        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    client.on('message', async (msg: Message) => {
      console.log(`Message received from ${msg.from} for user ${userId}`);
      
      // Save message to Firestore
      const threadId = `${userId}_${msg.from.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const threadRef = db.collection('threads').doc(threadId);
      
      const messageData = {
        userId,
        text: msg.body,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        direction: 'inbound',
        messageId: msg.id.id,
        channel: 'whatsapp-webjs',
        from: msg.from,
        contactName: msg.author || msg.from
      };

      await threadRef.collection('messages').doc(msg.id.id).set(messageData);
      
      await threadRef.set({
        userId,
        remoteJid: msg.from,
        lastMessage: msg.body,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        unreadCount: admin.firestore.FieldValue.increment(1)
      }, { merge: true });
    });

    try {
      await client.initialize();
      return { status: 'initializing', message: 'Client initializing' };
    } catch (error) {
      console.error(`Error initializing client for user ${userId}:`, error);
      this.sessions.delete(userId);
      throw error;
    }
  }

  async sendMessage(userId: string, to: string, text: string) {
    const session = this.sessions.get(userId);
    if (!session || session.status !== 'connected') {
      throw new Error('Session not connected');
    }

    const response = await session.client.sendMessage(to, text);
    return response;
  }

  async getStatus(userId: string) {
    const session = this.sessions.get(userId);
    return session ? session.status : 'disconnected';
  }
}

export const whatsappWebJsManager = new WhatsAppWebJsManager();
