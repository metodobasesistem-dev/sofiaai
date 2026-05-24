import { supabase } from '../lib/supabaseClient.js';
import { whatsappService } from './whatsappService.js';
import { format, addHours, subHours, isBefore, isAfter, parseISO } from 'date-fns';
import { monitoringService } from './monitoringService.js';

export class NotificationService {
  private interval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  async startBackgroundJobs() {
    console.log('[NotificationService] Starting background jobs (Reminders/Follow-ups)...');
    
    // Run every 15 minutes
    this.interval = setInterval(async () => {
      if (this.isProcessing) return;
      this.isProcessing = true;
      
      try {
        await this.checkReminders();
        await this.checkFollowUps();
      } catch (err: any) {
        console.error('[NotificationService] Error in background jobs:', err);
        await monitoringService.recordHeartbeat('system_worker', 'error', {
          message: err.message,
          stack: err.stack,
          timestamp: new Date().toISOString()
        });
      } finally {
        this.isProcessing = false;
      }
    }, 15 * 60 * 1000);

    // Run first time immediately
    this.checkReminders();
    this.checkFollowUps();
  }

  async checkReminders() {
    console.log('[NotificationService] Checking for upcoming reminders...');
    const now = new Date();
    const twoHoursFromNow = addHours(now, 2);
    const threeHoursFromNow = addHours(now, 3);

    // Fetch confirmed appointments not yet reminded
    const { data: appts, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('status', 'confirmed')
      .eq('reminder_sent', false)
      .gte('data', format(now, 'yyyy-MM-dd'));

    if (error) {
      console.error('[NotificationService] Error fetching appointments:', error);
      await monitoringService.recordHeartbeat('reminders', 'error', {
        message: 'Failed to fetch appointments from Supabase',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const appointmentsToProcess = appts || [];
    for (const appt of appointmentsToProcess) {
      try {
        // Construct full date-time
        const apptDateTime = parseISO(`${appt.data}T${appt.time}:00`);
        
        // If appt is between +1.5h and +3h from now
        if (isAfter(apptDateTime, now) && isBefore(apptDateTime, threeHoursFromNow)) {
          console.log(`[NotificationService] Sending reminder for appointment ${appt.id} to ${appt.client_phone}`);
          
          const msg = `Olá *${appt.client_name}*! Passando para lembrar do nosso compromisso hoje às *${appt.time}*. Nos vemos em breve! 😄`;
          
          await whatsappService.sendMessage(appt.user_id, appt.client_phone, msg);

          // Mark as sent
          await supabase.from('appointments').update({ reminder_sent: true }).eq('id', appt.id);
        }
      } catch (err) {
        console.error(`[NotificationService] Error processing reminder for appt ${appt.id}:`, err);
      }
    }

    // Record success heartbeat
    await monitoringService.recordHeartbeat('reminders', 'healthy', {
      total_checked: appointmentsToProcess.length,
      timestamp: new Date().toISOString()
    });
  }

  async checkFollowUps() {
    console.log('[NotificationService] Checking for dynamic follow-ups...');
    const now = new Date();

    // 1. Fetch threads in IA mode 
    const { data: threads, error } = await supabase
      .from('threads')
      .select('*')
      .eq('status', 'ia');

    if (error) {
      console.error('[NotificationService] Error fetching threads for follow-up:', error);
      await monitoringService.recordHeartbeat('follow_ups', 'error', {
        message: 'Failed to fetch threads from Supabase',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const threadsToProcess = threads || [];
    // To avoid redundant DB calls, we cache agent configs per user in this run
    const agentCache: Record<string, any> = {};

    for (const thread of threadsToProcess) {
      try {
        const userId = thread.user_id;
        
        // 2. Load Agent Config (with cache for this loop)
        if (!agentCache[userId]) {
          const { data: agent } = await supabase
            .from('agents')
            .select('*')
            .eq('user_id', userId)
            .eq('status_ativo', true)
            .maybeSingle();
          agentCache[userId] = agent;
        }

        const agent = agentCache[userId];
        if (!agent || !agent.follow_ups || !Array.isArray(agent.follow_ups) || agent.follow_ups.length === 0) continue;

        // 3. Determine current level
        const currentLevelIdx = thread.follow_up_level || 0;
        if (currentLevelIdx >= agent.follow_ups.length) continue; // Already finished all levels

        const levelConfig = agent.follow_ups[currentLevelIdx];
        const delayMinutes = levelConfig.delayMinutes || 60;
        
        // 4. Time Check
        const lastInteraction = new Date(thread.updated_at);
        const diffMinutes = (now.getTime() - lastInteraction.getTime()) / (1000 * 60);

        if (diffMinutes < delayMinutes) continue;

        // 5. Check for confirmed future appointments (to skip follow-up)
        const cleanPhone = thread.id.split('_')[1];
        const { count } = await supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'confirmed')
          .ilike('client_phone', `%${cleanPhone}%`)
          .gte('data', format(now, 'yyyy-MM-dd'));

        if (count && count > 0) {
          // Skip and mark as completed levels to avoid checking again
          await supabase.from('threads').update({ follow_up_level: 99 }).eq('id', thread.id);
          continue;
        }

        // 6. Generate Message
        let messageToSend = '';
        if (levelConfig.type === 'ai') {
          console.log(`[NotificationService] 🤖 Generating AI follow-up for ${thread.id}`);
          const { agentService } = await import('./agentService.js');
          
          // Get history for context
          const history = await agentService['getHistoryFromSupabase'](thread.id, 10);
          
          const simulation = await agentService.processChatSimulation(userId, agent, [
            ...history,
            { role: 'user', content: `[SISTEMA: O cliente parou de responder. Envie um follow-up agora seguindo esta instrução: ${levelConfig.extraPrompt || 'Seja prestativo'}]` }
          ]);
          messageToSend = simulation.text;
        } else {
          const clientName = thread.lead_name || thread.contact_name || 'lá';
          messageToSend = (levelConfig.message || '')
            .replace('{nome}', clientName)
            .replace('{client_name}', clientName);
        }

        if (!messageToSend) continue;

        // 7. Send & Update
        // IMPORTANTE: passa 'IA (FOLLOW-UP)' como senderName para que o
        // sendMessage NAO agende outro follow-up no BullMQ (linha 728).
        // Sem isso terıamos duplo agendamento: este cron + BullMQ.
        console.log(`[NotificationService] 📤 Sending Follow-up Lvl ${currentLevelIdx + 1} to ${cleanPhone}`);
        await whatsappService.sendMessage(userId, cleanPhone, messageToSend, 'IA (FOLLOW-UP)', 'IA');

        // Marca o updated_at PRIMEIRO (UPDATE simples, sem risco de coluna ausente)
        // para que mesmo se o UPDATE seguinte falhar o cron nao reenvie em 15min.
        await supabase.from('threads').update({
          updated_at: new Date().toISOString(),
          last_message: messageToSend
        }).eq('id', thread.id);

        // Tracking de nivel — depende das colunas follow_up_level / last_follow_up_at
        // (migration 20260524100000). Separado do UPDATE acima para nao perder o
        // refresh do updated_at se essas colunas ainda nao tiverem sido criadas.
        const { error: trackErr } = await supabase.from('threads').update({
          follow_up_level: currentLevelIdx + 1,
          last_follow_up_at: new Date().toISOString()
        }).eq('id', thread.id);
        if (trackErr) {
          console.warn(`[NotificationService] ⚠️ follow_up_level update failed (ok if migration nao foi aplicada): ${trackErr.message}`);
        }

        // Also persist as an outbound message
        const { agentService } = await import('./agentService.js');
        await agentService.persistMessage(
          thread.id, 
          userId, 
          messageToSend, 
          'outbound', 
          `fup-${currentLevelIdx}-${Date.now()}`, 
          thread.contact_name, 
          thread.remote_jid, 
          cleanPhone, 
          agent.nome
        );

      } catch (err) {
        console.error(`[NotificationService] Error in follow-up thread ${thread.id}:`, err);
      }
    }

    // Heartbeat
    await monitoringService.recordHeartbeat('follow_ups', 'healthy', {
      timestamp: new Date().toISOString()
    });
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }
}

export const notificationService = new NotificationService();
