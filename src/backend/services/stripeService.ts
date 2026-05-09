import Stripe from 'stripe';
import { supabase } from '../lib/supabaseClient.js';

let _stripe: Stripe | null = null;

const getStripe = () => {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      console.warn('[StripeService] STRIPE_SECRET_KEY is not defined. Payments will fail.');
      throw new Error('Stripe API Key is missing');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-01-27.acacia' as any,
    });
  }
  return _stripe;
};

export const stripeService = {
  /**
   * Cria uma sessão de checkout para o usuário
   */
  async createCheckoutSession(userId: string, priceId: string, successUrl: string, cancelUrl: string) {
    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        userId,
      },
    });

    return session;
  },

  /**
   * Processa o evento de checkout finalizado com sucesso
   */
  async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.client_reference_id || session.metadata?.userId;
    const subscriptionId = session.subscription as string;

    if (!userId) {
      console.error('[StripeService] No userId found in session');
      return;
    }

    // Busca detalhes da assinatura para saber o plano
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    const priceId = subscription.items.data[0].price.id;

    // Mapeia PriceID para Nome do Plano
    const priceMap: Record<string, string> = {
      'price_1TVBlpJ7F68id5vWe22alNFf': 'Starter', // Starter Mensal
      'price_1TVBlpJ7F68id5vWZ9h12z8C': 'Starter', // Starter Anual
      'price_1TVBpWJ7F68id5vW4e6Z7KtO': 'Pro',     // Pro Mensal
      'price_1TVBpWJ7F68id5vW98PWOCmw': 'Pro',     // Pro Anual
      'price_1TVBqEJ7F68id5vWHAbZMa8G': 'Elite',   // Elite Mensal
      'price_1TVBqEJ7F68id5vWiRJPCU8a': 'Elite',   // Elite Anual
    };

    const plano = priceMap[priceId] || 'Starter';
    
    console.log(`[StripeService] Payment success for user ${userId}. Plan: ${plano}`);

    // Atualiza o perfil no Supabase
    const { error } = await supabase
      .from('profiles')
      .update({ 
        plano,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: subscriptionId,
        trial_ends_at: null // Remove trial se existir
      })
      .eq('id', userId);

    if (error) {
      console.error('[StripeService] Error updating profile:', error);
      throw error;
    }
  }
};
