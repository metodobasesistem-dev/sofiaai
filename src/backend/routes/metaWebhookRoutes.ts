import { Router } from 'express';
import crypto from 'crypto';
import { agentService } from '../services/agentService.js';
import { whatsappService } from '../services/whatsappService.js';
import { supabase } from '../lib/supabaseClient.js';
import { transcribeAudio } from '../services/aiService.js';
import { MetaProvider } from '../providers/MetaProvider.js';
import { normalizePhone } from '../lib/phoneHelper.js';
import { webhookLimiter } from '../middleware/rateLimiter.js';

const router = Router();

/**
 * Meta Cloud API Webhook
 *
 * Endpoint:  /api/whatsapp/meta/webhook
 *
 *   GET  → verification handshake (hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y)
 *   POST → message + status ingestion (validated via X-Hub-Signature-256 HMAC)
 *
 * Environment variables required:
 *   META_VERIFY_TOKEN   — shared secret echoed back during webhook setup
 *   META_APP_SECRET     — used to verify HMAC on every POST
 *
 * Tenant resolution: payload.entry[].changes[].value.metadata.phone_number_id
 *                    → profiles.meta_phone_id → profiles.id (userId)
 */

function isProduction(): boolean {
  return (process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function globalAppSecret(): string {
  return (process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || '').trim();
}

/**
 * Performs the actual HMAC comparison given a secret + raw body + header.
 */
function hmacMatches(secret: string, rawBody: Buffer, signatureHeader: string): boolean {
  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expected = `sha256=${expectedHex}`;
  try {
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Extracts the first phone_number_id from a Meta webhook payload so we can
 * look up the tenant before validating HMAC (per-tenant secret support).
 *
 * Returns null if the payload is shaped unexpectedly — caller should reject.
 */
function extractPhoneNumberId(body: any): string | null {
  try {
    for (const entry of body?.entry || []) {
      for (const change of entry?.changes || []) {
        const id = change?.value?.metadata?.phone_number_id;
        if (id) return String(id);
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Validates the X-Hub-Signature-256 header against the appropriate secret.
 *
 * Resolution order:
 *   1) Per-tenant: profiles.meta_app_secret (when phone_number_id resolves to a tenant)
 *   2) Global env: WHATSAPP_APP_SECRET → META_APP_SECRET
 *   3) Dev compat: if NO secret exists anywhere AND we're not in production,
 *      accept without validation (preserves local development ergonomics).
 *      In production this returns false → 403.
 */
async function verifyMetaSignaturePerTenant(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  body: any
): Promise<{ ok: boolean; userId?: string; reason?: string }> {
  if (!rawBody) {
    return { ok: false, reason: 'missing rawBody' };
  }

  const phoneNumberId = extractPhoneNumberId(body);
  let tenantSecret: string | null = null;
  let tenantUserId: string | undefined;

  if (phoneNumberId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, meta_app_secret')
      .eq('meta_phone_id', phoneNumberId)
      .maybeSingle();
    if (profile) {
      tenantUserId = profile.id;
      tenantSecret = (profile.meta_app_secret || '').trim() || null;
    }
  }

  const fallbackSecret = globalAppSecret();
  const effectiveSecret = tenantSecret || fallbackSecret;

  if (!effectiveSecret) {
    if (isProduction()) {
      return { ok: false, reason: 'no app secret configured (refusing in production)' };
    }
    console.warn('[MetaWebhook] ⚠️ DEV MODE: no app secret configured — accepting without HMAC. DO NOT USE IN PRODUCTION.');
    return { ok: true, userId: tenantUserId };
  }

  if (!signatureHeader) {
    return { ok: false, reason: 'missing X-Hub-Signature-256 header' };
  }

  if (hmacMatches(effectiveSecret, rawBody, signatureHeader)) {
    return { ok: true, userId: tenantUserId };
  }

  // If a per-tenant secret was found and failed, fall back to the global
  // secret. Useful while migrating from "one app for all" to per-tenant
  // configuration.
  if (tenantSecret && fallbackSecret && tenantSecret !== fallbackSecret) {
    if (hmacMatches(fallbackSecret, rawBody, signatureHeader)) {
      console.warn(`[MetaWebhook] ⚠️ Tenant ${tenantUserId} HMAC matched only with global fallback — update meta_app_secret`);
      return { ok: true, userId: tenantUserId };
    }
  }

  return { ok: false, reason: 'signature mismatch', userId: tenantUserId };
}

/**
 * GET /webhook — Meta verification handshake
 * Meta calls this once when the webhook URL is registered in the dashboard.
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = (process.env.META_VERIFY_TOKEN || '').trim();

  console.log(`[MetaWebhook] 🔍 Handshake Attempt: mode=${mode} | token=${token} | challenge=${challenge}`);
  console.log(`[MetaWebhook] 🎯 Expected Token: ${expected ? expected.substring(0, 3) + '...' : 'NOT_SET'}`);

  if (mode === 'subscribe' && token === expected && expected) {
    console.log('[MetaWebhook] ✅ Verification handshake succeeded');
    return res.status(200).send(challenge);
  }

  console.warn(`[MetaWebhook] ❌ Verification failed (mode=${mode}, tokenMatch=${token === expected}, expectedLen=${expected.length})`);
  return res.status(403).send('Forbidden: Token Mismatch');
});

/**
 * POST /webhook — Meta message + status ingestion
 */
router.post('/webhook', webhookLimiter, async (req, res) => {
  const rawBody = (req as any).rawBody as Buffer | undefined;
  const signature = req.header('X-Hub-Signature-256');
  const body = req.body;

  console.log(`[MetaWebhook] 📨 Received: object=${body?.object} | bodySize=${rawBody?.length || 0}`);

  const verifyResult = await verifyMetaSignaturePerTenant(rawBody, signature, body);
  if (!verifyResult.ok) {
    console.warn(`[MetaWebhook] ❌ Signature validation failed: ${verifyResult.reason}`);
    return res.status(403).send('Forbidden');
  }

  if (body?.object !== 'whatsapp_business_account') {
    return res.status(200).send('OK');
  }

  // Always acknowledge fast — Meta retries aggressively on non-200
  res.status(200).send('OK');

  // Process asynchronously after responding
  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;

        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) {
          console.warn('[MetaWebhook] No phone_number_id in payload, skipping');
          continue;
        }

        // Resolve tenant by meta_phone_id. If signature validation already
        // resolved the same tenant, we can skip this lookup for that one
        // — but webhooks may carry multiple entries (different tenants in
        // theory), so we re-resolve per change to be safe.
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('id, whatsapp_provider')
          .eq('meta_phone_id', phoneNumberId)
          .maybeSingle();

        if (profileErr) {
          console.error('[MetaWebhook] Tenant lookup failed:', profileErr.message);
          continue;
        }
        if (!profile) {
          console.warn(`[MetaWebhook] No tenant for phone_number_id=${phoneNumberId}, skipping`);
          continue;
        }
        if (profile.whatsapp_provider !== 'meta_official') {
          console.warn(`[MetaWebhook] Tenant ${profile.id} has provider=${profile.whatsapp_provider}, ignoring Meta payload`);
          continue;
        }

        const userId = profile.id;

        // Status updates (sent/delivered/read/failed) — handled independently
        if (Array.isArray(value.statuses) && value.statuses.length > 0) {
          await handleMetaStatuses(userId, value.statuses);
        }

        // Messages ingestion
        if (Array.isArray(value.messages) && value.messages.length > 0) {
          await handleMetaMessages(userId, phoneNumberId, value);
        }
      }
    }
  } catch (err: any) {
    console.error('[MetaWebhook] Error processing webhook:', err.message || err);
  }
});

/**
 * Maps Meta status → our internal status column.
 * Meta values: sent | delivered | read | failed | deleted
 */
async function handleMetaStatuses(userId: string, statuses: any[]): Promise<void> {
  const statusMap: Record<string, string> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
    deleted: 'deleted',
  };

  for (const s of statuses) {
    const msgId = s.id;
    const mapped = statusMap[s.status];
    if (!msgId || !mapped) continue;

    console.log(`[MetaWebhook] 📬 Status: ${msgId} → ${mapped}`);

    await supabase
      .from('messages')
      .update({ status: mapped })
      .eq('whatsapp_id', msgId)
      .eq('user_id', userId);
  }
}

/**
 * Processes inbound messages from Meta. Reuses transformPayload from MetaProvider
 * to keep the parsing logic centralized.
 */
async function handleMetaMessages(userId: string, phoneNumberId: string, value: any): Promise<void> {
  const provider = new MetaProvider(userId);

  // transformPayload expects the full Meta envelope, so we reconstruct it.
  const envelope = {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value }] }],
  };
  const message = provider.transformPayload(envelope);
  if (!message) {
    console.log('[MetaWebhook] transformPayload returned null, skipping');
    return;
  }

  // Idempotency: prevent duplicate processing on Meta retries
  const eventId = message.id;
  if (eventId) {
    const isNew = await (whatsappService as any).markEventAsProcessed(`meta-webhook:${eventId}`, 300);
    if (!isNew) {
      console.log(`[MetaWebhook] 🛡️ Duplicate event ${eventId}, skipping`);
      return;
    }
  }

  const { from, body, contactName, id: messageId, type, caption, fileName, mimeType, quotedId, quotedText, raw } = message;
  const cleanPhone = normalizePhone(from);
  const threadId = `${userId}_${cleanPhone}`;

  // Reaction handling
  if (type === 'reaction') {
    if (message.reactionTargetId) {
      await agentService.updateMessageReaction(userId, message.reactionTargetId, message.reaction || '');
    }
    return;
  }

  console.log(`[MetaWebhook] 📥 Processing inbound: ${messageId} | Type: ${type}`);

  // Media types are processed asynchronously (download + transcribe + upload)
  if (type !== 'text' && type !== 'unknown') {
    handleMetaMediaMessage(userId, phoneNumberId, threadId, message, provider).catch(err => {
      console.error('[MetaWebhook] Error in media handler:', err);
    });
    return;
  }

  // Text persistence + AI trigger
  try {
    await agentService.persistMessage(
      threadId, userId, body, 'inbound', messageId, contactName, from, cleanPhone,
      undefined, undefined, undefined, type, undefined, undefined, undefined, undefined,
      false, quotedId, quotedText, undefined
    );

    await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, body, contactName, cleanPhone, messageId, false);

    await whatsappService.enqueueProfilePictureSync({ userId, threadId, remoteJid: from }).catch(() => {});
  } catch (err: any) {
    console.error(`[MetaWebhook] ❌ Persistence failed for ${messageId}:`, err.message || err);
  }
}

async function handleMetaMediaMessage(userId: string, _phoneNumberId: string, threadId: string, message: any, provider: MetaProvider): Promise<void> {
  const { from, body, contactName, id: messageId, type, caption, fileName, mimeType, quotedId, quotedText, raw } = message;
  const cleanPhone = normalizePhone(from);

  console.log(`[MetaWebhook] 📥 Downloading media: ${messageId} (${type})`);

  try {
    // raw is the Meta message object — getMediaBase64 extracts the id from it
    const base64 = await provider.getMediaBase64(userId, null, raw);
    if (!base64) {
      console.warn(`[MetaWebhook] Could not fetch base64 for ${messageId}`);
      await agentService.persistMessage(
        threadId, userId, body, 'inbound', messageId, contactName, from, cleanPhone,
        undefined, undefined, undefined, type, undefined, mimeType, fileName, caption,
        false, quotedId, quotedText, undefined
      );
      return;
    }

    const buffer = Buffer.from(base64, 'base64');
    const ext = mimeType?.split('/')[1]?.split(';')[0] || 'bin';
    const storagePath = `${type}s/${Date.now()}_${fileName || `file.${ext}`}`;
    const mediaUrl = await (whatsappService as any).uploadToStorage(userId, buffer, storagePath);

    let processedText = body;
    let transcription: string | undefined;

    if (type === 'audio') {
      console.log(`[MetaWebhook] 🎙️ Transcribing audio: ${messageId}`);
      transcription = await transcribeAudio(buffer, `audio_${Date.now()}.ogg`);
      if (transcription) processedText = `[Áudio]: ${transcription}`;
    }

    await agentService.persistMessage(
      threadId, userId, processedText, 'inbound', messageId, contactName, from, cleanPhone,
      undefined, undefined, mediaUrl, type, mediaUrl, mimeType, fileName, caption,
      false, quotedId, quotedText, undefined
    );

    if (type === 'audio' && transcription) {
      await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, transcription, contactName, cleanPhone, messageId, true);
    } else if (type === 'image' || type === 'video') {
      await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, caption || (type === 'image' ? '[Imagem]' : '[Vídeo]'), contactName, cleanPhone, messageId, false, mediaUrl, mimeType);
    } else if (type === 'document') {
      await (whatsappService as any).triggerAIResponseViaWebhook(userId, from, `[Documento recebido: ${fileName || 'arquivo'}]`, contactName, cleanPhone, messageId, false);
    }
  } catch (err: any) {
    console.error(`[MetaWebhook] Failed to process media ${messageId}:`, err.message || err);
    await agentService.persistMessage(
      threadId, userId, body, 'inbound', messageId, contactName, from, cleanPhone,
      undefined, undefined, undefined, type, undefined, mimeType, fileName, caption,
      false, quotedId, quotedText, undefined
    );
  }
}

export default router;
