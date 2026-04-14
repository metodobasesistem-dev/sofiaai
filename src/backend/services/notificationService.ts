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
      } catch (err) {
        console.error('[NotificationService] Error in background jobs:', err);
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
      .select('*, profiles(notification_phone)')
      .eq('status', 'confirmed')
      .eq('reminder_sent', false)
      .gte('data', format(now, 'yyyy-MM-dd'));

    if (error || !appts) return;

    for (const appt of appts) {
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
      total_checked: appts.length,
      timestamp: new Date().toISOString()
    });
  }

  async checkFollowUps() {
    console.log('[NotificationService] Checking for inactive leads (Follow-ups)...');
    const now = new Date();
    const twentyFourHoursAgo = subHours(now, 24);

    // Fetch threads that were updated more than 24h ago, stay in IA mode, and haven't gotten follow-up
    const { data: threads, error } = await supabase
      .from('threads')
      .select('*')
      .eq('status', 'ia')
      .eq('follow_up_sent', false)
      .lt('updated_at', twentyFourHoursAgo.toISOString());

    if (error || !threads) return;

    for (const thread of threads) {
      try {
        // Double check: do they have a future appointment?
        const cleanPhone = thread.id.split('_')[1];
        const { count } = await supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', thread.user_id)
          .eq('status', 'confirmed')
          .ilike('client_phone', `%${cleanPhone}%`)
          .gte('data', format(now, 'yyyy-MM-dd'));

        if (count && count > 0) {
          // They already have an appointment, skip follow-up and mark as sent to avoid re-checking
          await supabase.from('threads').update({ follow_up_sent: true }).eq('id', thread.id);
          continue;
        }

        console.log(`[NotificationService] Sending follow-up for thread ${thread.id} to ${thread.id.split('_')[1]}`);
        
        const clientName = thread.lead_name || thread.contact_name || 'lá';
        const msg = `Oi *${clientName}*, tudo bem? Notei que não chegamos a concluir seu agendamento. Ainda tem interesse em marcar um horário? Posso te ajudar com alguma dúvida?`;
        
        await whatsappService.sendMessage(thread.user_id, thread.id.split('_')[1], msg);

        // Mark as sent
        await supabase.from('threads').update({ follow_up_sent: true }).eq('id', thread.id);
      } catch (err) {
        console.error(`[NotificationService] Error processing follow-up for thread ${thread.id}:`, err);
      }
    }

    // Record success heartbeat
    await monitoringService.recordHeartbeat('follow_ups', 'healthy', {
      total_checked: threads.length,
      timestamp: new Date().toISOString()
    });
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }
}

export const notificationService = new NotificationService();
