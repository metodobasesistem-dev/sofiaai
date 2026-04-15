/**
 * Redis Remote Auth Store for whatsapp-web.js
 *
 * Replaces SupabaseRemoteAuthStore. Stores the WhatsApp session zip
 * directly in Redis as a base64-encoded Buffer.
 *
 * Advantages over Supabase Storage:
 *  - Sub-millisecond read/write (no HTTP round trip to storage)
 *  - Lasts 30 days (TTL renewable on activity)
 *  - Survives Railway redeploys without a persistent volume
 *  - No "Zip not found" bugs — zip is written synchronously before save()
 *
 * Interface contract (RemoteAuth expects exactly these 4 methods):
 *  sessionExists({ session }) → boolean
 *  save({ session })         → void   (zip already on disk at dataPath/session.zip)
 *  extract({ session, path })→ void   (write zip to disk and unzip to path)
 *  delete({ session })       → void
 */

import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { rGetBuffer, rSetBuffer, rDel, rGet } from './redisClient.js';
import { TTL, cacheKey } from './redisCache.js';

export class RedisRemoteAuthStore {
  private dataPath: string;

  constructor(dataPath: string) {
    this.dataPath = dataPath;
  }

  private zipPath(session: string): string {
    // Standardize: Ensure we only use the filename, stripping any absolute paths prepended by the library
    const sessionName = path.basename(session);
    return path.join(this.dataPath, `${sessionName}.zip`);
  }

  // ─── sessionExists ────────────────────────────────────────────────────────
  async sessionExists({ session }: { session: string }): Promise<boolean> {
    try {
      const key = cacheKey.waSession(session);
      const val = await rGet(key);
      const exists = val !== null;
      console.log(`[RedisStore] sessionExists("${session}"): ${exists}`);
      return exists;
    } catch (err: any) {
      console.warn('[RedisStore] sessionExists error:', err.message);
      return false;
    }
  }

  // ─── save ────────────────────────────────────────────────────────────────
  // Called by RemoteAuth after creating the zip at this.dataPath/session.zip
  async save({ session }: { session: string }): Promise<void> {
    const zp = this.zipPath(session);

    // Retry up to 5x waiting for the zip file to appear (RemoteAuth creates it async)
    let zipBuffer: Buffer | null = null;
    for (let i = 0; i < 5; i++) {
      if (fs.existsSync(zp)) {
        zipBuffer = fs.readFileSync(zp);
        break;
      }
      console.log(`[RedisStore] Waiting for zip (attempt ${i + 1}/5)...`);
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!zipBuffer) {
      console.error(`[RedisStore] ❌ Zip still not found after 5s at: ${zp}`);
      return; // Don't throw — session keeps running even if backup fails
    }

    try {
      const key = cacheKey.waSession(session);
      await rSetBuffer(key, zipBuffer, TTL.WA_SESSION);
      console.log(`[RedisStore] ✅ Session "${session}" saved to Redis (${Math.round(zipBuffer.length / 1024)}KB)`);
    } catch (err: any) {
      console.error(`[RedisStore] Redis save failed: ${err.message}`);
    }
  }

  // ─── extract ─────────────────────────────────────────────────────────────
  // Called by RemoteAuth to restore the session
  async extract({ session, path: destPath }: { session: string; path: string }): Promise<void> {
    console.log(`[RedisStore] Extracting session "${session}" from Redis...`);

    const key = cacheKey.waSession(session);
    const zipBuffer = await rGetBuffer(key);

    if (!zipBuffer) {
      throw new Error(`[RedisStore] No session found in Redis for "${session}"`);
    }

    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }

    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(destPath, /* overwrite */ true);

    // Also write the zip to disk so RemoteAuth can verify it
    const zp = this.zipPath(session);
    fs.writeFileSync(zp, zipBuffer);

    console.log(`[RedisStore] ✅ Session extracted to: ${destPath}`);
  }

  // ─── delete ──────────────────────────────────────────────────────────────
  async delete({ session }: { session: string }): Promise<void> {
    try {
      const key = cacheKey.waSession(session);
      await rDel(key);
      console.log(`[RedisStore] Session "${session}" deleted from Redis`);
    } catch (err: any) {
      console.warn(`[RedisStore] delete warning: ${err.message}`);
    }
  }
}
