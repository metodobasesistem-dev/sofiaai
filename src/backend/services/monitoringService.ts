import { supabase } from '../lib/supabaseClient.js';
import { redisService } from './redisService.js';

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
        // Bloqueio AGRESSIVO para Redis: Nunca enviar alerta de WhatsApp para esse serviço
        const isRedis = serviceId.toLowerCase().trim() === 'redis';
        
        if (status === 'error' || (previousStatus === 'error' && status === 'healthy')) {
          if (!isRedis) {
            console.log(`[Monitoring] Preparando alerta de WhatsApp para: ${serviceId}`);
            await this.sendAdminAlert(serviceId, status, previousStatus, metadata);
          } else {
            console.log(`[Monitoring] Alerta de WhatsApp SILENCIADO para o serviço Redis.`);
          }
        }
      }
    } catch (err) {
      console.error(`[Monitoring] Exception in heartbeat for ${serviceId}:`, err);
    }
  }

  /**
   * Sends a WhatsApp alert to the configured admin.
   */
  private async sendAdminAlert(serviceId: string, newStatus: string, oldStatus?: string, metadata?: any) {
    try {
      // 1. Fetch global settings for admin notification
      const { data: settingsList } = await supabase
        .from('global_settings')
        .select('admin_notification_phone, admin_notification_user_id')
        .limit(1);

      const settings = settingsList?.[0];

      if (!settings?.admin_notification_phone || !settings?.admin_notification_user_id) {
        console.warn('[Monitoring] Skipping alert: admin_notification_phone or admin_notification_user_id not configured in global_settings.');
        return;
      }

      const serviceName = serviceId === 'reminders' ? 'Enviador de Lembretes' : 
                          serviceId === 'follow_ups' ? 'Automação de Follow-up' : serviceId;
      
      const statusEmoji = newStatus === 'healthy' ? '✅' : '⚠️';
      const statusText = newStatus === 'healthy' ? 'RECUPERADO' : 'FALHA DETECTADA';
      const oldStatusText = oldStatus === 'healthy' ? 'Saudável' : (oldStatus === 'error' ? 'Erro' : 'Nenhum');

      // Deep Diagnostics: Extract error details from metadata
      let diagnosticInfo = '';
      if (newStatus === 'error' && metadata) {
        const errorMsg = metadata.error || metadata.message || '';
        const errorStack = metadata.stack ? `\n*Stack:* _${metadata.stack.substring(0, 100)}..._` : '';
        const context = metadata.context ? `\n*Contexto:* ${JSON.stringify(metadata.context)}` : '';
        
        if (errorMsg || errorStack || context) {
          diagnosticInfo = `\n\n🔍 *Diagnóstico:* \n${errorMsg}${errorStack}${context}`;
        }
      }

      const message = `${statusEmoji} *ALERTA DE MONITORAMENTO*\n\n` +
                      `*Serviço:* ${serviceName}\n` +
                      `*Status:* ${statusText}\n` +
                      `*Anterior:* ${oldStatusText}\n` +
                      `*Horário:* ${new Date().toLocaleTimeString('pt-BR')}${diagnosticInfo}\n\n` +
                      `_Verifique o painel administrativo para mais detalhes._`;

      // 2. Send via EvolutionApiService directly to bypass Redis dependency
      const { EvolutionApiService } = await import('./evolutionApiService.js');
      
      // 3. Fetch the REAL instance ID from the profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('whatsapp_instance_id')
        .eq('id', settings.admin_notification_user_id)
        .maybeSingle();

      const instanceName = profile?.whatsapp_instance_id || `wppai_${settings.admin_notification_user_id.substring(0, 8)}`;
      
      // Ensure phone is clean before sending
      const cleanPhone = settings.admin_notification_phone.replace(/\D/g, '');
      
      await EvolutionApiService.sendMessage(
        instanceName,
        cleanPhone,
        message
      );

      console.log(`[Monitoring] Alert sent via instance ${instanceName} to ${cleanPhone}`);
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

  /**
   * Performs a full system health check, including Redis queues and DB latency.
   * This is designed to be called by a background worker (heartbeat cycle).
   */
  async runSystemDiagnostics() {
    try {
      // 1. Check Redis
      const redisInfo = await redisService.getRedisInfo();
      const queueMetrics = await redisService.getQueueMetrics(['reminder_queue', 'follow_up_queue', 'whatsapp_outbound']);
      
      // Uma janela de fail-open é degradação real: a deduplicação de webhook
      // esteve desligada e pode ter havido processamento em duplicidade.
      const dedupeDegradado = (redisInfo as any).dedupe?.degraded === true;
      await this.recordHeartbeat('redis', redisInfo.status === 'connected' && !dedupeDegradado ? 'healthy' : 'error', {
        ...redisInfo,
        queues: queueMetrics,
        timestamp: new Date().toISOString()
      });

      // 2. Check Database Latency
      const start = Date.now();
      await supabase.from('sys_health').select('count').limit(1);
      const latency = Date.now() - start;

      await this.recordHeartbeat('database', 'healthy', {
        latency_ms: latency,
        timestamp: new Date().toISOString()
      });

      // 3. Record Server Core heartbeat
      await this.recordHeartbeat('server_core', 'healthy', {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage().rss / 1024 / 1024 + ' MB',
        timestamp: new Date().toISOString()
      });

      // 4. Record WhatsApp Service heartbeat (assuming healthy if this loop runs)
      const { whatsappService } = await import('./whatsappService.js');
      await this.recordHeartbeat('whatsapp', 'healthy', {
        sessions_active: whatsappService.getActiveSessionsCount ? whatsappService.getActiveSessionsCount() : 'unknown',
        timestamp: new Date().toISOString()
      });

      console.log(`[Monitoring] System diagnostics completed. Latency: ${latency}ms`);
    } catch (err: any) {
      console.error('[Monitoring] Error during system diagnostics:', err);
    }
  }
}

export const monitoringService = new MonitoringService();
