import { Router, Response } from 'express';
import axios from 'axios';
import { supabase } from '../lib/supabaseClient.js';
import { MetaProvider } from '../providers/MetaProvider.js';
import { parseProviderError } from '../providers/providerErrors.js';
import { whatsappService } from '../services/whatsappService.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';

const router = Router();
const META_BASE = 'https://graph.facebook.com/v19.0';

/**
 * Meta Cloud API admin/UX endpoints.
 *
 * Mounted at:  /api/v2/whatsapp/meta
 *
 *   POST /test-connection   — validate credentials WITHOUT persisting
 *   POST /save-credentials  — validate + persist (switches provider to meta_official)
 *   POST /disconnect        — revert tenant to evolution + clear Meta creds
 *   GET  /status            — current Meta provider status for the authed user
 */

interface MetaCredsBody {
  access_token: string;
  phone_id: string;
  waba_id?: string;
}

/**
 * Probes Graph API with the given credentials. Returns the phone-number record
 * (verified_name, display_phone_number, quality_rating) on success.
 */
async function probeMetaCredentials(creds: MetaCredsBody): Promise<{
  ok: boolean;
  data?: any;
  error?: ReturnType<typeof parseProviderError>;
}> {
  try {
    const { data } = await axios.get(`${META_BASE}/${creds.phone_id}`, {
      params: { fields: 'verified_name,display_phone_number,quality_rating,code_verification_status' },
      headers: { Authorization: `Bearer ${creds.access_token}` },
      timeout: 15000,
    });
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: parseProviderError(err) };
  }
}

router.post('/test-connection', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const { access_token, phone_id, waba_id } = (req.body || {}) as MetaCredsBody;
  if (!access_token || !phone_id) {
    return res.status(400).json({ success: false, error: 'access_token and phone_id are required' });
  }

  const probe = await probeMetaCredentials({ access_token, phone_id, waba_id });
  if (!probe.ok) {
    return res.status(400).json({
      success: false,
      error: probe.error?.message || 'Validation failed',
      errorInfo: probe.error,
    });
  }

  return res.json({
    success: true,
    phone: {
      phone_id,
      display_phone_number: probe.data.display_phone_number,
      verified_name: probe.data.verified_name,
      quality_rating: probe.data.quality_rating,
      verification_status: probe.data.code_verification_status,
    },
  });
});

router.post('/save-credentials', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { access_token, phone_id, waba_id } = (req.body || {}) as MetaCredsBody;
  if (!access_token || !phone_id) {
    return res.status(400).json({ success: false, error: 'access_token and phone_id are required' });
  }

  // Validate before persisting — avoids storing broken credentials
  const probe = await probeMetaCredentials({ access_token, phone_id, waba_id });
  if (!probe.ok) {
    return res.status(400).json({
      success: false,
      error: probe.error?.message || 'Validation failed',
      errorInfo: probe.error,
    });
  }

  // Ensure no other tenant already claimed this phone_id
  const { data: clash } = await supabase
    .from('profiles')
    .select('id')
    .eq('meta_phone_id', phone_id)
    .neq('id', userId)
    .maybeSingle();
  if (clash) {
    return res.status(409).json({
      success: false,
      error: `phone_id ${phone_id} is already configured for another tenant`,
    });
  }

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({
      whatsapp_provider: 'meta_official',
      meta_access_token: access_token,
      meta_phone_id: phone_id,
      meta_waba_id: waba_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateErr) {
    return res.status(500).json({ success: false, error: `Failed to persist: ${updateErr.message}` });
  }

  // Invalidate the credential cache so the next outbound message uses fresh values
  MetaProvider.invalidateCredentialCache(userId);

  return res.json({
    success: true,
    provider: 'meta_official',
    phone: {
      phone_id,
      display_phone_number: probe.data.display_phone_number,
      verified_name: probe.data.verified_name,
      quality_rating: probe.data.quality_rating,
    },
  });
});

router.post('/disconnect', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({
      whatsapp_provider: 'evolution',
      meta_access_token: null,
      meta_phone_id: null,
      meta_waba_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateErr) {
    return res.status(500).json({ success: false, error: `Failed to disconnect: ${updateErr.message}` });
  }

  MetaProvider.invalidateCredentialCache(userId);
  return res.json({ success: true, provider: 'evolution' });
});

router.get('/status', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('whatsapp_provider, meta_phone_id, meta_waba_id, meta_access_token')
    .eq('id', userId)
    .maybeSingle();

  if (error) return res.status(500).json({ success: false, error: error.message });
  if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

  const configured = !!(profile.meta_access_token && profile.meta_phone_id);
  if (!configured || profile.whatsapp_provider !== 'meta_official') {
    return res.json({
      success: true,
      provider: profile.whatsapp_provider || 'evolution',
      meta: { configured, phone_id: profile.meta_phone_id || null, waba_id: profile.meta_waba_id || null },
    });
  }

  // Live probe — verifies token still works
  const probe = await probeMetaCredentials({
    access_token: profile.meta_access_token,
    phone_id: profile.meta_phone_id,
    waba_id: profile.meta_waba_id || undefined,
  });

  return res.json({
    success: true,
    provider: 'meta_official',
    meta: {
      configured: true,
      phone_id: profile.meta_phone_id,
      waba_id: profile.meta_waba_id,
      live_ok: probe.ok,
      display_phone_number: probe.data?.display_phone_number,
      verified_name: probe.data?.verified_name,
      quality_rating: probe.data?.quality_rating,
      error: probe.ok ? undefined : probe.error?.message,
    },
  });
});

/**
 * GET /templates — lists message templates from the tenant's WABA.
 * Query: ?status=APPROVED (optional filter), ?limit=100
 */
router.get('/templates', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const status = (req.query.status as string) || undefined;
  const limit = Math.min(parseInt((req.query.limit as string) || '100', 10) || 100, 250);

  const { data: profile } = await supabase
    .from('profiles')
    .select('whatsapp_provider, meta_waba_id')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.whatsapp_provider !== 'meta_official') {
    return res.status(400).json({ success: false, error: 'Tenant is not on meta_official provider' });
  }
  if (!profile.meta_waba_id) {
    return res.status(400).json({ success: false, error: 'meta_waba_id is not configured for this tenant' });
  }

  try {
    const provider = new MetaProvider(userId);
    const templates = await provider.listTemplates(userId, { status, limit });
    return res.json({ success: true, templates, count: templates.length });
  } catch (err: any) {
    const info = parseProviderError(err);
    return res.status(400).json({ success: false, error: info.message, errorInfo: info });
  }
});

/**
 * POST /send-template — sends an approved template message.
 * Body: { to, template_name, language_code?, components? }
 */
router.post('/send-template', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { to, template_name, language_code, components } = req.body || {};

  if (!to || !template_name) {
    return res.status(400).json({ success: false, error: 'to and template_name are required' });
  }

  const result = await whatsappService.sendTemplate(
    userId,
    to,
    template_name,
    language_code || 'pt_BR',
    Array.isArray(components) ? components : undefined
  );

  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

export default router;
