import { Router } from 'express';
import { sofiaService } from '../services/sofiaService';
import { AuthenticatedRequest, requireAuth } from '../middleware/authMiddleware';

const router = Router();

/**
 * Get chat history with Sofia
 */
router.get('/history', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // No Wppai, o próprio ID do usuário atua como o tenant_id principal para armazenamento de memória
    const tenantId = req.userId!;
    const history = await sofiaService.getHistory(tenantId);
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: `Sofia API History Error: ${error.message}` });
  }
});

/**
 * Send a message to Sofia
 */
router.post('/chat', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    // No Wppai, o próprio ID do usuário atua como o tenant_id principal
    const tenantId = req.userId!;
    const response = await sofiaService.chat(req.userId!, tenantId, message);
    res.json({ response });
  } catch (error: any) {
    res.status(500).json({ error: `Sofia API Chat Error: ${error.message}` });
  }
});

export default router;
