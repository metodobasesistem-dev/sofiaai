import dotenv from 'dotenv';
import path from 'path';

import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379');
const redisPassword = process.env.REDIS_PASSWORD;
const redisUsername = process.env.REDIS_USERNAME || 'default';

console.log(`[RedisService] Init with ${redisHost}:${redisPort}...`);

let redis: any = null;
let connectionFailed = false;

/**
 * Rastreio do fail-open da deduplicação.
 *
 * markAsProcessed retorna `true` quando o Redis não responde — de propósito,
 * para não engolir a mensagem. O efeito colateral é que a deduplicação de
 * webhook deixa de existir naquela janela: se a Evolution reentregar o mesmo
 * evento, a IA responde duas vezes. Sem registro, isso vira um mistério
 * ("por que o cliente recebeu a mesma resposta?") sem nenhuma pista no log.
 */
const degradado = {
  desde: null as number | null,
  ignorados: 0,
  ultimoLog: 0,
};

const LOG_INTERVALO_MS = 30_000;

function registrarFailOpen(motivo: string) {
  const agora = Date.now();
  if (degradado.desde === null) {
    degradado.desde = agora;
    degradado.ignorados = 0;
    degradado.ultimoLog = 0;
  }
  degradado.ignorados++;

  // Throttle: um webhook movimentado geraria milhares de linhas iguais
  if (agora - degradado.ultimoLog >= LOG_INTERVALO_MS) {
    degradado.ultimoLog = agora;
    const segundos = Math.round((agora - degradado.desde) / 1000);
    console.warn(
      `[RedisService] ⚠️ DEDUPLICAÇÃO DESLIGADA há ${segundos}s (${motivo}) — ` +
      `${degradado.ignorados} verificação(ões) liberada(s) sem checagem. ` +
      `Risco de mensagem processada em duplicidade nesta janela.`
    );
  }
}

function registrarRecuperacao() {
  if (degradado.desde === null) return;
  const segundos = Math.round((Date.now() - degradado.desde) / 1000);
  const total = degradado.ignorados;
  degradado.desde = null;
  degradado.ignorados = 0;
  degradado.ultimoLog = 0;
  if (total > 0) {
    console.warn(
      `[RedisService] ✅ Deduplicação restabelecida após ${segundos}s — ` +
      `${total} verificação(ões) passaram sem checagem nesse período.`
    );
  }
}

/** Estado do fail-open, para o heartbeat de monitoramento. */
export function getDedupeDegradation() {
  return {
    degraded: degradado.desde !== null,
    since: degradado.desde ? new Date(degradado.desde).toISOString() : null,
    unchecked: degradado.ignorados,
  };
}

// Initialize Redis with a safety wrapper
async function getRedisClient() {
  if (redis) return redis;
  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      username: redisUsername,
      lazyConnect: true,
      // Limite de retries + timeout: sem eles, enableOfflineQueue faria o
      // comando esperar indefinidamente com o Redis fora, travando o
      // processamento do webhook — pior do que o fail-open que ele substitui.
      maxRetriesPerRequest: 2,
      commandTimeout: 2000,
      // enableOfflineQueue: true — com a fila desligada, todo comando emitido
      // antes de o socket ficar pronto (boot e reconexões) morria com
      // "Stream isn't writeable". Aqui isso não era só ruído: markAsProcessed
      // falha ABERTO (retorna true), então cada janela dessas desligava a
      // deduplicação de webhook e podia gerar resposta da IA em duplicidade.
      enableOfflineQueue: true,
      retryStrategy: (times) => Math.min(times * 50, 2000)
    });
    
    redis.on('connect', () => {
      connectionFailed = false;
      console.log('[RedisService] ✅ Connected');
    });

    // Sem isto, um erro no boot deixava o serviço preso em degradado: todas as
    // operações viravam no-op mesmo depois de a conexão se estabelecer.
    redis.on('ready', () => {
      connectionFailed = false;
    });

    // Suprimir erros de conexão para não travar o processo principal
    redis.on('error', (err: any) => {
      if (!connectionFailed) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[RedisService] Error:', err.message);
        }
        connectionFailed = true;
      }
    });

    return redis;
  } catch (e) {
    console.warn('[RedisService] ioredis module not found or connection failed. Using Firestore fallback.');
    return null;
  }
}

export const redisService = {
  async getClient() {
    return await getRedisClient();
  },

  async set(key: string, value: any, ttlSeconds?: number) {
    if (connectionFailed) return;
    try {
      const client = await getRedisClient();
      if (!client) return;
      const val = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttlSeconds) {
        await client.set(key, val, 'EX', ttlSeconds);
      } else {
        await client.set(key, val);
      }
    } catch (e) {}
  },

  async get(key: string) {
    if (connectionFailed) return null;
    try {
      const client = await getRedisClient();
      if (!client) return null;
      const data = await client.get(key);
      try {
        return data ? JSON.parse(data) : null;
      } catch {
        return data;
      }
    } catch (e) {
      return null;
    }
  },

  async del(key: string) {
    if (connectionFailed) return;
    try {
      const client = await getRedisClient();
      if (!client) return;
      await client.del(key);
    } catch (e) {}
  },

  /**
   * Idempotência: Verifica se uma mensagem já foi processada recentemente
   */
  async markAsProcessed(messageId: string, ttl = 3600): Promise<boolean> {
    // Todo caminho que retorna true sem consultar o Redis é um fail-open:
    // libera o processamento sem saber se já aconteceu antes.
    if (connectionFailed) {
      registrarFailOpen('conexão indisponível');
      return true;
    }
    try {
      const client = await getRedisClient();
      if (!client) {
        registrarFailOpen('cliente não inicializado');
        return true; // Se o Redis falhar, processamos para não perder a msg
      }
      const key = `processed:${messageId}`;
      const result = await client.set(key, '1', 'NX', 'EX', ttl);
      registrarRecuperacao();
      return result === 'OK';
    } catch (e: any) {
      registrarFailOpen(e?.message || 'erro no comando');
      return true;
    }
  },

  /**
   * Fila de Agendamento (Delayed Queue)
   */
  async addToQueue(queueName: string, id: string, delaySeconds: number) {
    if (connectionFailed) return;
    try {
      const client = await getRedisClient();
      if (!client) return;
      const processAt = Date.now() + (delaySeconds * 1000);
      await client.zadd(queueName, processAt, id);
    } catch (e) {}
  },

  async getDueJobs(queueName: string): Promise<string[]> {
    if (connectionFailed) return [];
    try {
      const client = await getRedisClient();
      if (!client) return [];
      const now = Date.now();
      // Pega IDs cujo tempo de processamento já passou
      const jobs = await client.zrangebyscore(queueName, 0, now);
      return jobs;
    } catch (e) {
      return [];
    }
  },

  async removeFromQueue(queueName: string, id: string) {
    if (connectionFailed) return;
    try {
      const client = await getRedisClient();
      if (!client) return;
      await client.zrem(queueName, id);
    } catch (e) {}
  },

  async pushMessage(threadId: string, role: 'user' | 'assistant', content: string) {
    const client = await getRedisClient();
    if (!client) return;

    const key = `messages:${threadId}`;
    const message = JSON.stringify({ role, content, timestamp: Date.now() });
    
    try {
      await client.rpush(key, message);
      await client.ltrim(key, -50, -1);
      await client.expire(key, 60 * 60 * 24 * 7);
    } catch (error) {
      console.error('[RedisService] ❌ pushMessage falhou — histórico do Supabase será usado como fallback:', (error as any)?.message);
    }
  },


  async getHistory(threadId: string, limit: number = 40) {
    const client = await getRedisClient();
    if (!client) return [];

    const key = `messages:${threadId}`;
    try {
      const messages = await client.lrange(key, -limit, -1);
      return messages.map((m: any) => JSON.parse(m));
    } catch (error) {
      return [];
    }
  },

  async clearHistory(threadId: string) {
    const client = await getRedisClient();
    if (!client) return;
    const key = `messages:${threadId}`;
    try {
      await client.del(key);
    } catch (error) {}
  },

  /**
   * Metrics for monitoring
   */
  async getQueueMetrics(queueNames: string[]) {
    const client = await getRedisClient();
    if (!client) return {};
    
    const metrics: Record<string, number> = {};
    for (const name of queueNames) {
      try {
        metrics[name] = await client.zcard(name);
      } catch (e) {
        metrics[name] = 0;
      }
    }
    return metrics;
  },

  async getRedisInfo() {
    // dedupe entra no heartbeat 'redis' (sys_health) para que uma janela sem
    // deduplicação fique registrada no painel, e não só no log do container.
    const dedupe = getDedupeDegradation();
    const client = await getRedisClient();
    if (!client) return { status: 'disconnected', dedupe };
    try {
      const info = await client.info('memory');
      const usedMemory = info.match(/used_memory_human:(.*)/)?.[1] || 'unknown';
      // O ciclo de diagnóstico fecha a janela mesmo sem tráfego de mensagens
      registrarRecuperacao();
      return { status: 'connected', usedMemory, dedupe };
    } catch (e) {
      return { status: 'error', message: (e as any).message, dedupe };
    }
  },

  /**
   * Buffer para Agrupamento de Mensagens (Debounce)
   */
  async pushToBuffer(userId: string, from: string, content: string) {
    const client = await getRedisClient();
    if (!client) return;
    const key = `buffer:${userId}:${from}`;
    try {
      await client.rpush(key, content);
      await client.expire(key, 3600); // 1 hora de vida no máximo
    } catch (error) {}
  },

  async getAndClearBuffer(userId: string, from: string): Promise<string[]> {
    const client = await getRedisClient();
    if (!client) return [];
    const key = `buffer:${userId}:${from}`;
    try {
      const messages = await client.lrange(key, 0, -1);
      await client.del(key);
      return messages;
    } catch (error) {
      return [];
    }
  }
};

