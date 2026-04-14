import { supabase } from '../lib/supabaseClient.js';

export class MonitoringService {
  /**
   * Records a heartbeat for a specific background service.
   */
  async recordHeartbeat(serviceId: string, status: 'healthy' | 'error' = 'healthy', metadata: any = {}) {
    try {
      const { error } = await supabase
        .from('sys_health')
        .upsert({
          id: serviceId,
          last_run: new Date().toISOString(),
          status: status,
          metadata: metadata
        });
      
      if (error) console.error(`[Monitoring] Error saving heartbeat for ${serviceId}:`, error);
    } catch (err) {
      console.error(`[Monitoring] Exception in heartbeat for ${serviceId}:`, err);
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
