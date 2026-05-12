import webpush from 'web-push';
import { supabase } from '../lib/supabaseClient.js';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:contato@zyreo.com.br';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars must be set');
}

webpush.setVapidDetails(
  VAPID_EMAIL,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export class PushNotificationService {
  /**
   * Envia uma notificação push para todas as assinaturas de um usuário
   */
  static async sendPushNotification(userId: string, title: string, body: string, url: string = '/') {
    try {
      // 1. Buscar assinaturas do usuário
      const { data: subscriptions, error } = await supabase
        .from('push_subscriptions')
        .select('subscription')
        .eq('user_id', userId);

      if (error || !subscriptions || subscriptions.length === 0) {
        return;
      }

      // Deduplicação em memória por endpoint para evitar spam se houver lixo no banco
      const uniqueEndpoints = new Map();
      subscriptions.forEach(sub => {
        if (sub.subscription && sub.subscription.endpoint) {
          uniqueEndpoints.set(sub.subscription.endpoint, sub.subscription);
        }
      });

      console.log(`[PushService] Sending notifications to ${uniqueEndpoints.size} unique devices for user ${userId} (from ${subscriptions.length} total subs)`);

      const payload = JSON.stringify({
        title,
        body,
        url,
        icon: '/sofia-face.png',
        badge: '/sofiamini.png'
      });


      // 2. Enviar para cada dispositivo ÚNICO
      const promises = Array.from(uniqueEndpoints.values()).map(subscription => 
        webpush.sendNotification(subscription, payload).catch(err => {
          console.error(`[PushService] Error sending to subscription:`, err.statusCode);
          // Se o código for 410 (Gone) ou 404 (Not Found), a assinatura não é mais válida
          if (err.statusCode === 410 || err.statusCode === 404) {
            this.removeInvalidSubscription(subscription);
          }
        })
      );

      await Promise.all(promises);

    } catch (err) {
      console.error('[PushService] Global error:', err);
    }
  }

  private static async removeInvalidSubscription(subscription: any) {
    try {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('subscription', subscription);
      console.log('[PushService] Removed invalid subscription from DB');
    } catch (err) {
      console.error('[PushService] Error removing invalid sub:', err);
    }
  }

  static async saveSubscription(userId: string, subscription: any) {
    try {
      if (!subscription || !subscription.endpoint) {
        throw new Error('Invalid subscription object: missing endpoint');
      }

      // 1. Buscar se já existe essa assinatura (pelo endpoint, que é único)
      // Usamos ilike ou eq dependendo do banco, mas como é um campo JSON/TEXT no Supabase, 
      // o ideal é extrair o endpoint se estiver em colunas separadas ou usar operador JSON.
      // Assumindo que 'subscription' no banco é uma coluna JSONB:
      const { data: existing } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', userId)
        .contains('subscription', { endpoint: subscription.endpoint })
        .maybeSingle();

      if (existing) {
        console.log(`[PushService] Subscription already exists for user ${userId} and endpoint`);
        return { success: true };
      }

      // 2. Opcional: Limpar assinaturas antigas com o mesmo endpoint mas outro userId (se for o caso de troca de conta no mesmo browser)
      await supabase
        .from('push_subscriptions')
        .delete()
        .contains('subscription', { endpoint: subscription.endpoint })
        .neq('user_id', userId);

      const { error } = await supabase
        .from('push_subscriptions')
        .insert({
          user_id: userId,
          subscription: subscription
        });

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error('[PushService] Error saving sub:', err.message);
      throw err;
    }
  }
}

