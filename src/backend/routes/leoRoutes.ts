import { Router } from 'express';
import { leoInstagramService } from '../services/leoInstagramService.js';
import { leoService } from '../services/leoService.js';
import { leoMetaService } from '../services/leoMetaService.js';
import { AuthenticatedRequest, requireAdmin, requireAuth } from '../middleware/authMiddleware.js';
import { supabase } from '../lib/supabaseClient.js';

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

/**
 * POST /api/leo/instagram/resubscribe
 * Re-inscreve a Página e a Conta IG nos webhooks com os campos corretos.
 * Necessário após a correção do bug de subscribed_fields para contas já conectadas.
 */
router.post('/instagram/resubscribe', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    await leoInstagramService.subscribeWebhooks(req.userId!);
    res.json({ success: true, message: 'Webhook re-inscrito com sucesso (comments, messages, mentions, instagram)' });
  } catch (error: any) {
    console.error('[LeoRoutes] Erro ao re-inscrever webhook:', error);
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

router.get('/instagram/media', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const media = await leoInstagramService.getMedia(req.userId!);
    res.json(media);
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

  // Enfileira no BullMQ para processamento com retry automático
  await leoService.enqueueWebhookEvent(req.body);

  res.sendStatus(200);
});

// --- CONFIGURAÇÕES GERAIS LEO ---

router.get('/config', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { data: config } = await supabase
      .from('leo_config')
      .select('mensagem_inicial, perguntas_qualificacao, score_minimo')
      .eq('company_id', req.userId!)
      .maybeSingle();
    
    res.json(config || { 
      mensagem_inicial: '', 
      perguntas_qualificacao: ['Qual o volume médio de leads atual?', 'Já utiliza algum CRM?', 'Qual o seu orçamento mensal para Ads?'], 
      score_minimo: 70 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/config', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { mensagem_inicial, perguntas_qualificacao, score_minimo } = req.body;
    await supabase
      .from('leo_config')
      .update({ mensagem_inicial, perguntas_qualificacao, score_minimo })
      .eq('company_id', req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/leo/instagram/resubscribe-all  (admin)
 * Re-inscreve TODAS as contas IG conectadas nos webhooks corretos.
 */
router.post('/instagram/resubscribe-all', requireAuth, requireAdmin, async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await leoService.resubscribeAllAccounts();
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[LeoRoutes] Erro ao re-inscrever todas as contas:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- OUTRAS ROTAS ---

router.get('/campanhas', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  const campaigns = await leoMetaService.fetchCampaigns(userId!);
  res.json(campaigns);
});

export default router;
