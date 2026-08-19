/**
 * Redis Client Singleton
 * Connects via REDIS_URL (preferred) or REDIS_HOST/PORT/PASSWORD.
 * Gracefully degrades — if Redis is unavailable, methods are no-ops.
 */
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_USERNAME = process.env.REDIS_USERNAME || 'default';

let client: Redis | null = null;
let connectionFailed = false;

function createClient(): Redis {
  // enableOfflineQueue: true — com lazyConnect, o primeiro comando é o que
  // dispara a conexão; com a fila offline desligada ele era rejeitado na hora
  // com "Stream isn't writeable", e o mesmo acontecia a cada reconexão. Com a
  // fila ligada o comando espera o socket ficar pronto, que é o comportamento
  // da conexão do BullMQ — a única das três que nunca deu esse erro.
  const comum = {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
  };

  const opts = REDIS_URL
    ? comum
    : {
        ...comum,
        host: REDIS_HOST,
        port: REDIS_PORT,
        // username faltava aqui e existe nos outros dois clientes; em Redis
        // com ACL a autenticação só por senha depende do servidor assumir
        // 'default'.
        username: REDIS_USERNAME,
        password: REDIS_PASSWORD || undefined,
      };

  const r = REDIS_URL
    ? new Redis(REDIS_URL, opts as any)
    : new Redis(opts as any);

  r.on('connect', () => {
    connectionFailed = false;
    console.log('[Redis] ✅ Connected');
  });

  r.on('error', (err) => {
    if (!connectionFailed) {
      console.warn('[Redis] ⚠️  Connection error (will retry):', err.message);
      connectionFailed = true;
    }
  });

  // 'ready' também zera o flag: sem isso, um erro no boot deixava o cliente
  // preso em modo degradado (todo rGet/rSet virava no-op) mesmo depois de a
  // conexão se estabelecer.
  r.on('ready', () => {
    connectionFailed = false;
  });

  r.on('reconnecting', () => console.log('[Redis] Reconnecting...'));

  return r;
}

export function getRedis(): Redis {
  if (!client) {
    client = createClient();
  }
  return client;
}

/** Safe set with optional TTL */
export async function rSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (connectionFailed) return;
  try {
    const r = getRedis();
    if (ttlSeconds) {
      await r.set(key, value, 'EX', ttlSeconds);
    } else {
      await r.set(key, value);
    }
  } catch (err: any) {
    console.warn(`[Redis] rSet failed for "${key}":`, err.message);
  }
}

/** Safe get */
export async function rGet(key: string): Promise<string | null> {
  if (connectionFailed) return null;
  try {
    return await getRedis().get(key);
  } catch (err: any) {
    console.warn(`[Redis] rGet failed for "${key}":`, err.message);
    return null;
  }
}

/** Safe delete */
export async function rDel(...keys: string[]): Promise<void> {
  if (connectionFailed) return;
  try {
    if (keys.length > 0) await getRedis().del(...keys);
  } catch (err: any) {
    console.warn(`[Redis] rDel failed:`, err.message);
  }
}

/** Safe set binary (Buffer stored as base64 string) */
export async function rSetBuffer(key: string, buf: Buffer, ttlSeconds?: number): Promise<void> {
  await rSet(key, buf.toString('base64'), ttlSeconds);
}

/** Safe get binary */
export async function rGetBuffer(key: string): Promise<Buffer | null> {
  const val = await rGet(key);
  if (!val) return null;
  return Buffer.from(val, 'base64');
}

/** Check Redis health */
export async function rPing(): Promise<boolean> {
  try {
    const result = await getRedis().ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}
