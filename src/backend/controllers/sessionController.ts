import { Response } from 'express';
import { whatsappService } from '../services/whatsappService.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

class SessionController {
  async createSession(req: AuthenticatedRequest, res: Response) {
    console.log('--- [SessionController] createSession start (non-blocking) ---');

    const userId = req.userId!;
    console.log(`[SessionController] Triggering session initialization for userId: ${userId}`);

    try {
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

  async getStatus(req: AuthenticatedRequest, res: Response) {
    const userId = req.userId!;
    try {
      const data = await whatsappService.getSessionStatus(userId);
      res.json({ ...data, debug_version: 'v2-logging-active' });
    } catch (error: any) {
      console.error('Error getting status:', error);
      res.status(500).json({ error: error.message || 'Failed to get status' });
    }
  }

  async sendMessage(req: AuthenticatedRequest, res: Response) {
    const userId = req.userId!;
    const { to, message, quotedMessageId } = req.body;
    console.log(`[SessionController] 📩 sendMessage request: User=${userId}, To=${to}, Msg=${message.substring(0, 20)}..., Quoted=${quotedMessageId || 'None'}`);
    if (!to || !message) {
      return res.status(400).json({ error: 'Missing to or message' });
    }

    try {
      const result = await whatsappService.sendMessage(userId, to, message, 'Atendente', 'Atendente', quotedMessageId);
      res.json(result);
    } catch (error: any) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: error.message || 'Failed to send message' });
    }
  }

  async restoreSession(req: AuthenticatedRequest, res: Response) {
    const userId = req.userId!;
    try {
      const data = await whatsappService.getSessionStatus(userId);
      console.log(`[SessionController] Restore check for ${userId}: ${data.status}`);
      res.json(data);
    } catch (error: any) {
      console.error('Error restoring session:', error);
      res.status(500).json({ error: error.message || 'Failed to restore session' });
    }
  }

  async disconnectSession(req: AuthenticatedRequest, res: Response) {
    const userId = req.userId!;
    try {
      console.log(`[SessionController] Disconnecting session (logout) for ${userId}`);
      await whatsappService.logout(userId);
      res.json({ success: true, message: 'Session logged out successfully (instance kept)' });
    } catch (error: any) {
      console.error('Error disconnecting session:', error);
      res.status(500).json({ error: error.message || 'Failed to disconnect session' });
    }
  }

  async deleteSession(req: AuthenticatedRequest, res: Response) {
    const userId = req.userId!;
    try {
      console.log(`[SessionController] PERMANENTLY DELETING session and instance for ${userId}`);
      await whatsappService.deleteInstance(userId);
      res.json({ success: true, message: 'Session and instance deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting session:', error);
      res.status(500).json({ error: error.message || 'Failed to delete session' });
    }
  }

  async deleteMessage(req: AuthenticatedRequest, res: Response) {
    const userId = req.userId!;
    const { messageId } = req.body;
    if (!messageId) {
      return res.status(400).json({ error: 'Missing messageId' });
    }

    try {
      const result = await whatsappService.deleteMessage(userId, messageId);
      res.json(result);
    } catch (error: any) {
      console.error('Error in controller deleteMessage:', error);
      res.status(500).json({ error: error.message || 'Failed to delete message' });
    }
  }

  async reactToMessage(req: AuthenticatedRequest, res: Response) {
    const userId = req.userId!;
    const { messageId, reaction, remoteJid } = req.body;
    if (!messageId || !reaction || !remoteJid) {
      return res.status(400).json({ error: 'Missing messageId, reaction or remoteJid' });
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
