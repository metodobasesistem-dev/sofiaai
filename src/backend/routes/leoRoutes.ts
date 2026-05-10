import { Router } from 'express';
import { leoInstagramService } from '../services/leoInstagramService.js';
import { leoMetaService } from '../services/leoMetaService.js';
import { AuthenticatedRequest, requireAdmin, requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// --- INSTAGRAM OAUTH ---

router.get('/instagram/auth-url', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

router.get('/instagram/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const status = await leoInstagramService.getStatus(req.userId!);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/instagram/disconnect', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    await leoInstagramService.disconnect(req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/instagram/refresh-token', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    await leoInstagramService.refreshToken(req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/instagram/insights', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const insights = await leoInstagramService.getInsights(req.userId!);
    res.json(insights);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/instagram/history', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const history = await leoInstagramService.getHistory(req.userId!);
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/instagram/settings', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    await leoInstagramService.updateSettings(req.userId!, req.body);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/instagram/triggers', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const triggers = await leoInstagramService.getTriggers(req.userId!);
    res.json(triggers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/instagram/triggers', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const trigger = await leoInstagramService.addTrigger(req.userId!, req.body);
    res.json(trigger);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/instagram/triggers/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    await leoInstagramService.deleteTrigger(req.userId!, req.params.id);
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

  // Log temporário para depuração
  console.log('[Leo Webhook] Verificação recebida:', { mode, token, challenge });

  if (mode === 'subscribe' && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
    console.log('[Leo Webhook] ✅ Verificação aprovada!');
    res.status(200).send(challenge);
  } else {
    console.warn('[Leo Webhook] ❌ Verificação falhou. Token recebido:', token);
    res.status(403).send('Forbidden');
  }
});

router.post('/instagram/webhook', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const rawBody = JSON.stringify(req.body);
  const isValid = leoInstagramService.validateWebhookSignature(rawBody, signature);

  if (!signature || !isValid) {
    console.warn('[Leo Webhook] ❌ Assinatura inválida. Rejeitando requisição.');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  // Processar em background
  leoInstagramService.processWebhookEvent(req.body).catch(err => {
    console.error('[LeoWebhook] Erro ao processar evento:', err);
  });

  res.sendStatus(200);
});

// --- OUTRAS ROTAS ---

router.get('/campanhas', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  const campaigns = await leoMetaService.fetchCampaigns(userId!);
  res.json(campaigns);
});

export default router;
