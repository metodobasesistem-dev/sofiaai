import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { supabase } from './supabaseClient.js';

const BUCKET_NAME = 'whatsapp-sessions';

/**
 * Custom RemoteAuth store for whatsapp-web.js that persists session data
 * to Supabase Storage. This allows WhatsApp sessions to survive Railway
 * restarts and redeploys without needing a persistent volume.
 *
 * Key fix: ensureBucket() is now awaited before every operation (not just
 * fire-and-forget in the constructor) so the bucket is guaranteed to exist.
 */
export class SupabaseRemoteAuthStore {
  private dataPath: string;
  private bucketEnsured: Promise<void>;

  constructor(dataPath: string) {
    this.dataPath = dataPath;
    // Start bucket creation immediately and cache the promise so every
    // subsequent operation can await it without creating the bucket twice.
    this.bucketEnsured = this.ensureBucket();
  }

  private async ensureBucket(): Promise<void> {
    try {
      // 1. Try to create it (safe to call even if it already exists)
      const { error: createErr } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: false,
        allowedMimeTypes: ['application/zip', 'application/octet-stream'],
        fileSizeLimit: 104857600, // 100MB
      });

      if (createErr && !createErr.message.toLowerCase().includes('already exists')) {
        // 2. If creation failed for a reason other than "already exists", verify
        //    the bucket is reachable before giving up.
        const { error: listErr } = await supabase.storage.getBucket(BUCKET_NAME);
        if (listErr) {
          console.error('[SupabaseStore] FATAL: Cannot create or access bucket:', createErr.message);
          return;
        }
      }

      console.log(`[SupabaseStore] ✅ Bucket "${BUCKET_NAME}" is ready`);
    } catch (e) {
      console.error('[SupabaseStore] ensureBucket exception:', e);
    }
  }

  /**
   * Check whether a session backup exists in Supabase Storage.
   */
  async sessionExists({ session }: { session: string }): Promise<boolean> {
    await this.bucketEnsured;
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list('', { search: session });

      if (error) {
        console.warn('[SupabaseStore] sessionExists error:', error.message);
        return false;
      }

      const exists = (data || []).some(f => f.name === `${session}.zip`);
      console.log(`[SupabaseStore] sessionExists("${session}"): ${exists}`);
      return exists;
    } catch (e) {
      console.warn('[SupabaseStore] sessionExists exception:', e);
      return false;
    }
  }

  /**
   * Upload the session zip (already created by RemoteAuth at dataPath/session.zip)
   * to Supabase Storage.
   */
  async save({ session }: { session: string }): Promise<void> {
    await this.bucketEnsured;

    const zipPath = path.join(this.dataPath, `${session}.zip`);

    if (!fs.existsSync(zipPath)) {
      console.error(`[SupabaseStore] Zip not found at: ${zipPath} — skipping upload`);
      return; // Don't throw; let the session keep running even if backup fails
    }

    const zipBuffer = fs.readFileSync(zipPath);
    console.log(`[SupabaseStore] Uploading session zip (${Math.round(zipBuffer.length / 1024)}KB)...`);

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(`${session}.zip`, zipBuffer, {
        contentType: 'application/zip',
        upsert: true,
      });

    if (error) {
      console.error(`[SupabaseStore] Upload failed: ${error.message}`);
      // Don't throw — upload failure should NOT crash the WhatsApp session
      return;
    }

    console.log(`[SupabaseStore] ✅ Session "${session}" saved to Supabase Storage`);
  }

  /**
   * Download the session zip from Supabase Storage and extract it to destPath.
   * RemoteAuth uses this path as the Puppeteer user data directory.
   */
  async extract({ session, path: destPath }: { session: string; path: string }): Promise<void> {
    await this.bucketEnsured;
    console.log(`[SupabaseStore] Downloading session "${session}" from Supabase...`);

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(`${session}.zip`);

    if (error || !data) {
      throw new Error(`[SupabaseStore] Download failed: ${error?.message || 'No data'}`);
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    console.log(`[SupabaseStore] Downloaded ${Math.round(buffer.length / 1024)}KB. Extracting...`);

    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }

    const zip = new AdmZip(buffer);
    zip.extractAllTo(destPath, /* overwrite */ true);

    console.log(`[SupabaseStore] ✅ Session extracted to: ${destPath}`);
  }

  /**
   * Delete session backup from Supabase Storage (called on logout).
   */
  async delete({ session }: { session: string }): Promise<void> {
    await this.bucketEnsured;
    try {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([`${session}.zip`]);

      if (error) {
        console.warn(`[SupabaseStore] Delete warning: ${error.message}`);
      } else {
        console.log(`[SupabaseStore] Session "${session}" deleted from Supabase Storage`);
      }
    } catch (e) {
      console.warn('[SupabaseStore] delete exception:', e);
    }
  }
}
