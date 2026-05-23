import { Queue, Worker, Job } from 'bullmq';
import { supabase } from '../lib/supabaseClient.js';

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  username: process.env.REDIS_USERNAME || 'default',
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
};

class LeoService {
  private webhookQueue: Queue;
  private webhookWorker: Worker | null = null;

  constructor() {
    this.webhookQueue = new Queue('leo-webhook-events', { connection: REDIS_CONNECTION });
    this.setupWorker();
    this.scheduleTokenRefreshJob().catch(err =>
      console.warn('[LeoService] Falha ao agendar job de refresh de tokens:', err?.message)
    );
  }

  private setupWorker() {
    this.webhookWorker = new Worker(
      'leo-webhook-events',
      async (job: Job) => {
        if (job.name === 'process-webhook') {
          console.log(`[LeoService] 🔄 Processando webhook job ${job.id}`);
          const { leoInstagramService } = await import('./leoInstagramService.js');
          await leoInstagramService.processWebhookEvent(job.data.body);
        } else if (job.name === 'refresh-tokens') {
          await this.refreshAllExpiringTokens();
        }
      },
      { connection: REDIS_CONNECTION, concurrency: 3 }
    );

    this.webhookWorker.on('completed', (job) => {
      if (job.name === 'process-webhook') {
        console.log(`[LeoService] ✅ Webhook job ${job.id} concluído`);
      }
    });

    this.webhookWorker.on('failed', (job, err) => {
      console.error(
        `[LeoService] ❌ Job ${job?.id} (${job?.name}) falhou após ${job?.attemptsMade} tentativas: ${err.message}`
      );
    });
  }

  private async scheduleTokenRefreshJob() {
    const existing = await this.webhookQueue.getRepeatableJobs();
    if (!existing.find(j => j.name === 'refresh-tokens')) {
      await this.webhookQueue.add('refresh-tokens', {}, {
        repeat: { pattern: '0 8 * * *' }, // Todos os dias às 8h
        jobId: 'leo-token-refresh-cron'
      });
      console.log('[LeoService] 🔑 Job de refresh diário de tokens agendado');
    }
  }

  private async refreshAllExpiringTokens(): Promise<void> {
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: configs } = await supabase
      .from('leo_config')
      .select('company_id')
      .not('instagram_access_token', 'is', null)
      .lt('instagram_token_expires_at', sevenDaysFromNow);

    if (!configs?.length) {
      console.log('[LeoService] 🔑 Nenhum token precisa de refresh');
      return;
    }

    console.log(`[LeoService] 🔑 Renovando ${configs.length} token(s) próximos do vencimento`);
    const { leoInstagramService } = await import('./leoInstagramService.js');

    for (const config of configs) {
      try {
        await leoInstagramService.refreshToken(config.company_id);
        console.log(`[LeoService] ✅ Token renovado para company ${config.company_id}`);
      } catch (err: any) {
        console.error(`[LeoService] ❌ Falha ao renovar token para company ${config.company_id}: ${err.message}`);
      }
    }
  }

  async enqueueWebhookEvent(body: any): Promise<void> {
    await this.webhookQueue.add('process-webhook', { body }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 }
    });
  }

  /**
   * Re-inscreve todas as contas IG conectadas nos webhooks.
   * Útil para aplicar a correção de subscribed_fields em contas já conectadas.
   */
  async resubscribeAllAccounts(): Promise<{ ok: number; fail: number }> {
    const { data: configs } = await supabase
      .from('leo_config')
      .select('company_id')
      .not('instagram_access_token', 'is', null);

    let ok = 0, fail = 0;
    if (!configs?.length) return { ok, fail };

    const { leoInstagramService } = await import('./leoInstagramService.js');

    for (const config of configs) {
      try {
        await leoInstagramService.subscribeWebhooks(config.company_id);
        ok++;
      } catch (err: any) {
        console.error(`[LeoService] ❌ Re-subscrição falhou para company ${config.company_id}: ${err.message}`);
        fail++;
      }
    }

    console.log(`[LeoService] 🔁 Re-subscrição concluída: ${ok} ok, ${fail} falhas`);
    return { ok, fail };
  }
}

export const leoService = new LeoService();
