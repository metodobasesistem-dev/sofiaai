import { supabase } from './supabaseClient.js';

/**
 * Provider audit log — records who changed the WhatsApp provider of which
 * tenant, when, and with what (redacted) values. Used for compliance and
 * incident forensics ("why did tenant X suddenly stop receiving messages?").
 *
 * Token-like fields are masked to first/last 4 chars to keep the log useful
 * without leaking secrets if the audit table is ever exfiltrated.
 */

export type ProviderAuditAction =
  | 'provider_changed'
  | 'meta_credentials_saved'
  | 'meta_disconnected'
  | 'meta_credentials_test';

function mask(value?: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export async function logProviderAudit(params: {
  targetUserId: string;
  performedBy?: string | null;
  action: ProviderAuditAction;
  details?: Record<string, any>;
}): Promise<void> {
  try {
    await supabase.from('provider_audit_log').insert({
      target_user_id: params.targetUserId,
      performed_by: params.performedBy || null,
      action: params.action,
      details: params.details || {},
    });
  } catch (err: any) {
    // Audit must never break business flow — log only.
    console.warn('[ProviderAudit] Failed to write audit entry:', err.message || err);
  }
}

/** Helper that masks the typical sensitive payload of a credentials save. */
export function maskedMetaPayload(p: { access_token?: string; phone_id?: string; waba_id?: string | null; app_secret?: string }) {
  return {
    phone_id: p.phone_id || null,
    waba_id: p.waba_id || null,
    access_token: mask(p.access_token),
    app_secret_set: !!p.app_secret,
  };
}
