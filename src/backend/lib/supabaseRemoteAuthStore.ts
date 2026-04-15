import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { supabase } from './supabaseClient.js';

const BUCKET_NAME = 'whatsapp-sessions';

/**
 * Custom RemoteAuth store for whatsapp-web.js that persists session data
 * to Supabase Storage. This allows WhatsApp sessions to survive Railway
 * restarts and redeploys without needing a persistent volume.
 */
export class SupabaseRemoteAuthStore {
  private dataPath: string;
  private bucketReady = false;

  constructor(dataPath: string) {
    this.dataPath = dataPath;
    this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      // Try creating the bucket (idempotent — ignores "already exists")
      const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: false,
        allowedMimeTypes: ['application/zip', 'application/octet-stream'],
        fileSizeLimit: 52428800, // 50MB limit
      });

      if (error && !error.message.toLowerCase().includes('already exists')) {
        console.error('[SupabaseStore] Error creating bucket:', error.message);
      } else {
        this.bucketReady = true;
        console.log(`[SupabaseStore] Bucket "${BUCKET_NAME}" is ready`);
      }
    } catch (e) {
      console.warn('[SupabaseStore] Could not ensure bucket:', e);
    }
  }

  /**
   * Check whether a session backup exists in Supabase Storage.
   */
  async sessionExists({ session }: { session: string }): Promise<boolean> {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list('', { search: session });

      if (error) {
        console.warn('[SupabaseStore] sessionExists error:', error.message);
        return false;
      }

      const exists = (data || []).some(f => f.name === `${session}.zip`);
      console.log(`[SupabaseStore] sessionExists(${session}): ${exists}`);
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
    const zipPath = path.join(this.dataPath, `${session}.zip`);

    if (!fs.existsSync(zipPath)) {
      throw new Error(`[SupabaseStore] Zip not found at: ${zipPath}`);
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
      throw new Error(`[SupabaseStore] Upload failed: ${error.message}`);
    }

    console.log(`[SupabaseStore] ✅ Session "${session}" saved to Supabase Storage`);
  }

  /**
   * Download the session zip from Supabase Storage and extract it to destPath.
   * RemoteAuth uses this path as the Puppeteer user data directory.
   */
  async extract({ session, path: destPath }: { session: string; path: string }): Promise<void> {
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
