import { Request, Response } from 'express';
import { whatsappService } from '../services/whatsappService.js';

class SessionController {
  async createSession(req: Request, res: Response) {
    console.log('--- [SessionController] createSession start (non-blocking) ---');
    console.log('Request body:', JSON.stringify(req.body));
    
    let { userId } = req.body;
    if (!userId) {
      console.warn('[SessionController] Missing userId in request body');
      return res.status(400).json({ 
        success: false, 
        error: 'Missing userId' 
      });
    }

    console.log(`[SessionController] Triggering session initialization for userId: ${userId}`);

    try {
      // Trigger/Get session (WhatsAppService now handles existing session validation)
      const result = await whatsappService.createSession(userId);
      
      console.log(`[SessionController] Session generated for ${userId}`);
      
      if (result === 'connected') {
        res.json({ success: true, status: 'connected' });
      } else {
        res.json({ success: true, status: 'waiting', qr: result });
      }
    } catch (error: any) {
      const errMsg = error.message || '';
      if (errMsg.includes('The browser is already running')) {
        console.log(`[SessionController] Browser already running for ${userId}. Returning success status.`);
        return res.json({ success: true, status: 'connected' });
      }

      console.error(`[SessionController] Error triggering session for ${userId}:`, error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to trigger session' 
      });
    } finally {
      console.log('--- [SessionController] createSession end ---');
    }
  }

  async getStatus(req: Request, res: Response) {
    let { userId } = req.params;
    try {
      const data = await whatsappService.getSessionStatus(userId);
      res.json({ ...data, debug_version: 'v2-logging-active' });
    } catch (error: any) {
      console.error('Error getting status:', error);
      res.status(500).json({ error: error.message || 'Failed to get status' });
    }
  }

  async sendMessage(req: Request, res: Response) {
    let { userId, to, message } = req.body;
    console.log(`[SessionController] 📩 sendMessage request: User=${userId}, To=${to}, Msg=${message.substring(0, 20)}...`);
    if (!userId || !to || !message) {
      return res.status(400).json({ error: 'Missing userId, to, or message' });
    }

    try {
      const result = await whatsappService.sendMessage(userId, to, message);
      res.json(result);
    } catch (error: any) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: error.message || 'Failed to send message' });
    }
  }

  async restoreSession(req: Request, res: Response) {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }
    try {
      // Only reads status — never creates or destroys anything
      const data = await whatsappService.getSessionStatus(userId);
      console.log(`[SessionController] Restore check for ${userId}: ${data.status}`);
      res.json(data);
    } catch (error: any) {
      console.error('Error restoring session:', error);
      res.status(500).json({ error: error.message || 'Failed to restore session' });
    }
  }

  async disconnectSession(req: Request, res: Response) {
    let { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    try {
      console.log(`[SessionController] Disconnecting session (logout) for ${userId}`);
      await whatsappService.logout(userId);
      res.json({ success: true, message: 'Session logged out successfully (instance kept)' });
    } catch (error: any) {
      console.error('Error disconnecting session:', error);
      res.status(500).json({ error: error.message || 'Failed to disconnect session' });
    }
  }

  async deleteSession(req: Request, res: Response) {
    let { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    try {
      console.log(`[SessionController] PERMANENTLY DELETING session and instance for ${userId}`);
      await whatsappService.deleteInstance(userId);
      res.json({ success: true, message: 'Session and instance deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting session:', error);
      res.status(500).json({ error: error.message || 'Failed to delete session' });
    }
  }

  async deleteMessage(req: Request, res: Response) {
    let { userId, messageId } = req.body;
    if (!userId || !messageId) {
      return res.status(400).json({ error: 'Missing userId or messageId' });
    }

    try {
      const result = await whatsappService.deleteMessage(userId, messageId);
      res.json(result);
    } catch (error: any) {
      console.error('Error in controller deleteMessage:', error);
      res.status(500).json({ error: error.message || 'Failed to delete message' });
    }
  }

  async reactToMessage(req: Request, res: Response) {
    let { userId, messageId, reaction, remoteJid } = req.body;
    if (!userId || !messageId || !reaction || !remoteJid) {
      return res.status(400).json({ error: 'Missing userId, messageId, reaction or remoteJid' });
    }

    try {
      const result = await whatsappService.sendReaction(userId, remoteJid, messageId, reaction);
      res.json(result);
    } catch (error: any) {
      console.error('Error in controller reactToMessage:', error);
      res.status(500).json({ error: error.message || 'Failed to react to message' });
    }
  }
}

export const sessionController = new SessionController();
