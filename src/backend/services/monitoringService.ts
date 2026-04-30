import { supabase } from '../lib/supabaseClient.js';

export class MonitoringService {
  /**
   * Records a heartbeat for a specific background service.
   * Detects status changes to record history and trigger alerts.
   */
  async recordHeartbeat(serviceId: string, status: 'healthy' | 'error' = 'healthy', metadata: any = {}) {
    try {
      // 1. Get current status to detect transition
      const { data: current } = await supabase
        .from('sys_health')
        .select('status')
        .eq('id', serviceId)
        .maybeSingle();

      const previousStatus = current?.status;

      // 2. Upsert current status
      const { error: upsertError } = await supabase
        .from('sys_health')
        .upsert({
          id: serviceId,
          last_run: new Date().toISOString(),
          status: status,
          metadata: metadata
        });
      
      if (upsertError) {
        console.error(`[Monitoring] Error saving heartbeat for ${serviceId}:`, upsertError);
        return;
      }

      // 3. If status changed, record history and potentially alert
      if (previousStatus !== status) {
        console.log(`[Monitoring] Status transition for ${serviceId}: ${previousStatus || 'none'} -> ${status}`);
        
        await supabase.from('sys_health_history').insert({
          service_id: serviceId,
          status: status,
          previous_status: previousStatus,
          metadata: metadata
        });

        // Trigger WhatsApp alert for critical changes
        // Alert if it goes to 'error' OR if it recovers from 'error' to 'healthy'
        if (status === 'error' || (previousStatus === 'error' && status === 'healthy')) {
          await this.sendAdminAlert(serviceId, status, previousStatus);
        }
      }
    } catch (err) {
      console.error(`[Monitoring] Exception in heartbeat for ${serviceId}:`, err);
    }
  }

  /**
   * Sends a WhatsApp alert to the configured admin.
   */
  private async sendAdminAlert(serviceId: string, newStatus: string, oldStatus?: string) {
    try {
      // 1. Fetch global settings for admin notification
      const { data: settings } = await supabase
        .from('global_settings')
        .select('admin_notification_phone, admin_notification_user_id')
        .maybeSingle();

      if (!settings?.admin_notification_phone || !settings?.admin_notification_user_id) {
        console.warn('[Monitoring] Skipping alert: admin_notification_phone or admin_notification_user_id not configured in global_settings.');
        return;
      }

      const serviceName = serviceId === 'reminders' ? 'Enviador de Lembretes' : 
                          serviceId === 'follow_ups' ? 'Automação de Follow-up' : serviceId;
      
      const statusEmoji = newStatus === 'healthy' ? '✅' : '⚠️';
      const statusText = newStatus === 'healthy' ? 'RECUPERADO' : 'FALHA DETECTADA';
      const oldStatusText = oldStatus === 'healthy' ? 'Saudável' : (oldStatus === 'error' ? 'Erro' : 'Nenhum');

      const message = `${statusEmoji} *ALERTA DE MONITORAMENTO*\n\n` +
                      `*Serviço:* ${serviceName}\n` +
                      `*Status:* ${statusText}\n` +
                      `*Anterior:* ${oldStatusText}\n` +
                      `*Horário:* ${new Date().toLocaleTimeString('pt-BR')}\n\n` +
                      `_Verifique o painel administrativo para mais detalhes._`;

      // 2. Send via WhatsAppService (dynamic import to avoid circular dependencies)
      const { whatsappService } = await import('./whatsappService.js');
      await whatsappService.sendMessage(
        settings.admin_notification_user_id,
        settings.admin_notification_phone,
        message,
        'Sistema de Monitoramento'
      );

      console.log(`[Monitoring] Alert sent to ${settings.admin_notification_phone} for ${serviceId}`);
    } catch (err) {
      console.error(`[Monitoring] Failed to send admin alert:`, err);
    }
  }

  /**
   * Gets the current health status of all monitored services.
   */
  async getSystemStatus() {
    const { data, error } = await supabase.from('sys_health').select('*');
    if (error) throw error;
    return data || [];
  }
}

export const monitoringService = new MonitoringService();
