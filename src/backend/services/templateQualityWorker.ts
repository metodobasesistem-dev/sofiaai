import { supabase } from '../lib/supabaseClient.js';
import { MetaProvider } from '../providers/MetaProvider.js';

/**
 * Snapshots template quality_score every 6 hours for all meta_official tenants.
 * Inserts into template_quality_history only when the score changes from the
 * most-recent row for that (user, template, language) triple — avoids bloat.
 */
export async function runTemplateQualitySnapshot(): Promise<void> {
  try {
    const { data: tenants } = await supabase
      .from('profiles')
      .select('id, meta_waba_id')
      .eq('whatsapp_provider', 'meta_official')
      .not('meta_waba_id', 'is', null);

    if (!tenants || tenants.length === 0) return;

    for (const tenant of tenants) {
      try {
        await snapshotTenant(tenant.id);
      } catch (err: any) {
        console.warn(`[TemplateQualityWorker] Tenant ${tenant.id} failed:`, err.message || err);
      }
    }
  } catch (err: any) {
    console.error('[TemplateQualityWorker] runTemplateQualitySnapshot error:', err.message || err);
  }
}

async function snapshotTenant(userId: string): Promise<void> {
  const provider = new MetaProvider(userId);
  let templates: any[];
  try {
    templates = await provider.listTemplates(userId, { limit: 200 });
  } catch {
    return;
  }

  if (!templates || templates.length === 0) return;

  // Fetch latest recorded quality per template for this tenant
  const { data: latestRows } = await supabase
    .from('template_quality_history')
    .select('template_name, language_code, quality_score')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false });

  const latestMap = new Map<string, string>();
  for (const row of latestRows || []) {
    const k = `${row.template_name}__${row.language_code}`;
    if (!latestMap.has(k)) latestMap.set(k, row.quality_score);
  }

  const inserts: Array<{ user_id: string; template_name: string; language_code: string; quality_score: string; status: string }> = [];

  for (const t of templates) {
    const score = (typeof t.quality_score === 'string' ? t.quality_score : 'UNKNOWN').toUpperCase();
    const key = `${t.name}__${t.language}`;
    const last = latestMap.get(key);
    if (last === score) continue; // unchanged — skip
    inserts.push({
      user_id: userId,
      template_name: t.name,
      language_code: t.language || 'pt_BR',
      quality_score: score,
      status: (t.status || 'UNKNOWN').toUpperCase(),
    });
  }

  // Upsert no cache de status para manter sincronizado sem depender só de webhooks
  const cacheUpserts = templates.map((t: any) => ({
    user_id: userId,
    template_name: t.name,
    language_code: t.language || 'pt_BR',
    status: (t.status || 'UNKNOWN').toUpperCase(),
    category: t.category || null,
    quality_score: typeof t.quality_score === 'string' ? t.quality_score.toUpperCase() : null,
    reason: t.rejected_reason || null,
    last_event: 'WORKER_SYNC',
    last_event_at: new Date().toISOString(),
  }));

  if (cacheUpserts.length > 0) {
    const { error: cacheErr } = await supabase
      .from('template_status_cache')
      .upsert(cacheUpserts, { onConflict: 'user_id,template_name,language_code' });
    if (cacheErr) console.warn('[TemplateQualityWorker] Cache upsert error:', cacheErr.message);
  }

  if (inserts.length === 0) return;

  const { error } = await supabase.from('template_quality_history').insert(inserts);
  if (error) {
    console.error('[TemplateQualityWorker] Insert error:', error.message);
  } else {
    console.log(`[TemplateQualityWorker] ${userId}: ${inserts.length} quality snapshot(s) recorded`);
  }
}
