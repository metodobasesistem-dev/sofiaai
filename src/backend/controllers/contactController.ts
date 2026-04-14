import { Request, Response } from 'express';
import { agentService } from '../services/agentService.js';

class ContactController {
  async syncContacts(req: Request, res: Response) {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing userId' 
      });
    }

    try {
      console.log(`[ContactController] Triggering sync for userId: ${userId}`);
      const result = await agentService.syncContactsFromThreads(userId);
      res.json(result);
    } catch (error: any) {
      console.error(`[ContactController] Error syncing contacts for ${userId}:`, error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to sync contacts' 
      });
    }
  }
}

export const contactController = new ContactController();
