import webpush from 'web-push';
import { supabase } from '../lib/supabaseClient.js';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BDOHAFAPvb5cd6oJIFLaVFgQSjdWVZQRXk-XzGfQOSeUOiI-n6jv0aoouxhsrXnjJJqkMd7a4f6DN4mnVABAgjg';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'ce4uzMFTGfzByp6V0RkmS78wuLTUpblaBzye9mVenRM';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:contato@zyreo.com.br';

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

      console.log(`[PushService] Sending notifications to ${subscriptions.length} devices for user ${userId}`);

      const payload = JSON.stringify({
        title,
        body,
        url
      });

      // 2. Enviar para cada dispositivo
      const promises = subscriptions.map(sub => 
        webpush.sendNotification(sub.subscription, payload).catch(err => {
          console.error(`[PushService] Error sending to subscription:`, err.statusCode);
          // Se o código for 410 (Gone) ou 404 (Not Found), a assinatura não é mais válida
          if (err.statusCode === 410 || err.statusCode === 404) {
            this.removeInvalidSubscription(sub.subscription);
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
      // Verifica se já existe
      const { data: existing } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('subscription', subscription)
        .maybeSingle();

      if (existing) return { success: true };

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
