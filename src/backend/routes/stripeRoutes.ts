import express from 'express';
import { stripeService } from '../services/stripeService.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Rota para criar sessão de checkout
 * POST /api/v2/stripe/create-checkout
 */
router.post('/create-checkout', requireAuth, async (req, res) => {
  try {
    const { priceId } = req.body;
    const userId = (req as any).userId;
    const protocol = req.protocol;
    const host = req.get('host');
    const origin = `${protocol}://${host}`;

    if (!priceId) {
      return res.status(400).json({ error: 'Price ID is required' });
    }

    const session = await stripeService.createCheckoutSession(
      userId,
      priceId,
      `${origin}/dashboard?success=true`,
      `${origin}/dashboard/settings?tab=subscription&canceled=true`
    );

    res.json({ url: session.url });
  } catch (error: any) {
    console.error('[StripeRoutes] Error creating checkout:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Webhook do Stripe (Não requer Auth, o Stripe autentica via assinatura)
 * POST /api/v2/stripe/webhook
 */
router.post('/webhook', async (req, res) => {
  try {
    // Como o express.json() já está ativo no server.ts, o req.body já é um objeto
    const event = req.body;

    console.log(`[StripeWebhook] Received event type: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      await stripeService.handleCheckoutCompleted(session);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('[StripeWebhook] Error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

export default router;
