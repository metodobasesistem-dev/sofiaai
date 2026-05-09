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

    // Mapeia PriceID para Nome do Plano e Ciclo
    const priceConfig: Record<string, { plano: string, interval: 'month' | 'year' }> = {
      'price_1TVBlpJ7F68id5vWe22alNFf': { plano: 'Starter', interval: 'month' },
      'price_1TVBlpJ7F68id5vWZ9h12z8C': { plano: 'Starter', interval: 'year' },
      'price_1TVBpWJ7F68id5vW4e6Z7KtO': { plano: 'Pro',     interval: 'month' },
      'price_1TVBpWJ7F68id5vW98PWOCmw': { plano: 'Pro',     interval: 'year' },
      'price_1TVBqEJ7F68id5vWHAbZMa8G': { plano: 'Elite',   interval: 'month' },
      'price_1TVBqEJ7F68id5vWiRJPCU8a': { plano: 'Elite',   interval: 'year' },
    };

    const config = priceConfig[priceId] || { plano: 'Starter', interval: 'month' };
    const plano = config.plano;
    
    // Calcula a data de expiração
    const endsAt = new Date();
    if (config.interval === 'month') {
      endsAt.setMonth(endsAt.getMonth() + 1);
    } else {
      endsAt.setFullYear(endsAt.getFullYear() + 1);
    }
    
    console.log(`[StripeService] Payment success for user ${userId}. Plan: ${plano}, Next billing: ${endsAt.toISOString()}`);

    // Atualiza o perfil no Supabase
    const { data, error } = await supabase
      .from('profiles')
      .update({ 
        plano,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: subscriptionId,
        subscription_ends_at: endsAt.toISOString(),
        trial_ends_at: null // Remove trial se existir
      })
      .eq('id', userId)
      .select();

    if (error) {
      console.error('[StripeService] ❌ Error updating profile in database:', error);
      throw error;
    }

    if (data && data.length > 0) {
      console.log(`[StripeService] ✅ Profile updated successfully for user ${userId}. New plan: ${data[0].plano}`);
    } else {
      console.warn(`[StripeService] ⚠️ Profile update returned no data for user ${userId}. Check if the ID exists.`);
    }
  }
};
