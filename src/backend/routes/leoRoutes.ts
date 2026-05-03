import { Router } from 'express';
import { leoInstagramService } from '../services/leoInstagramService.js';
import { leoMetaService } from '../services/leoMetaService.js';
import { AuthenticatedRequest, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();

// --- INSTAGRAM OAUTH ---

router.get('/instagram/auth-url', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const url = await leoInstagramService.generateAuthUrl(req.userId!);
    res.json({ url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/instagram/callback', async (req, res) => {
  const { code, state } = req.query;
  try {
    await leoInstagramService.handleCallback(code as string, state as string);
    res.redirect('/leo/instagram?connected=true');
  } catch (error: any) {
    console.error('[LeoRoutes] OAuth Callback Error:', error);
    res.redirect('/leo/instagram?error=true');
  }
});

router.get('/instagram/status', async (req: AuthenticatedRequest, res) => {
  try {
    const status = await leoInstagramService.getStatus(req.userId!);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/instagram/disconnect', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    await leoInstagramService.disconnect(req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/instagram/refresh-token', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    await leoInstagramService.refreshToken(req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- WEBHOOKS (Público) ---

router.get('/instagram/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/instagram/webhook', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature || !leoInstagramService.validateWebhookSignature(JSON.stringify(req.body), signature)) {
    return res.sendStatus(403);
  }

  // Processar em background
  leoInstagramService.processWebhookEvent(req.body).catch(err => {
    console.error('[LeoWebhook] Error processing event:', err);
  });

  res.sendStatus(200);
});

// --- OUTRAS ROTAS ---

router.get('/campanhas', async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  const campaigns = await leoMetaService.fetchCampaigns(userId!);
  res.json(campaigns);
});

export default router;
