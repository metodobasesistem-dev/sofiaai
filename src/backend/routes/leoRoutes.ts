import { Router } from 'express';
import { leoInstagramService } from '../services/leoInstagramService.js';
import { leoMetaService } from '../services/leoMetaService.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

const router = Router();

// Webhook para Instagram (Público ou validado via secret do IG)
router.post('/webhook/instagram', async (req, res) => {
  await leoInstagramService.handleWebhook(req.body);
  res.sendStatus(200);
});

// Listar campanhas
router.get('/campanhas', async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  const campaigns = await leoMetaService.fetchCampaigns(userId);
  res.json(campaigns);
});

// Configurações
router.get('/config', async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  res.json({});
});

export default router;
