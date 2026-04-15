/**
 * Redis Cache Middleware
 * Generic cache-aside wrapper with TTL and namespaced keys.
 * Falls back gracefully if Redis is unavailable.
 */
import { rGet, rSet, rDel } from './redisClient.js';

// TTLs (seconds)
export const TTL = {
  PROFILE: 600,      // 10 min — changes rarely
  AGENTS: 120,       // 2 min — semi-static
  CONTACTS: 60,      // 1 min — updates frequently
  WA_SESSION: 2592000, // 30 days — WhatsApp session
  SHORT: 30,         // 30s — realtime-sensitive data
} as const;

// Key generators
export const cacheKey = {
  profile:  (userId: string) => `cache:profile:${userId}`,
  agents:   (userId: string) => `cache:agents:${userId}`,
  contacts: (userId: string) => `cache:contacts:${userId}`,
  waSession:(userId: string) => `wa:session:${userId}`,
};

/**
 * Cache-aside pattern:
 * 1. Check cache → return if hit
 * 2. Call fetcher fn → store result → return
 */
export async function cacheWrap<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  // 1. Try cache
  try {
    const cached = await rGet(key);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch { /* cache miss or parse error — proceed to fetcher */ }

  // 2. Fetch from source
  const result = await fetcher();

  // 3. Store in cache (non-blocking)
  if (result !== null && result !== undefined) {
    rSet(key, JSON.stringify(result), ttlSeconds).catch(() => {});
  }

  return result;
}

/** Invalidate one or more cache keys */
export async function invalidateCache(...keys: string[]): Promise<void> {
  await rDel(...keys);
}
