import { supabase } from './supabaseClient.js';
import { PushNotificationService } from '../services/pushNotificationService.js';

/**
 * Centraliza notificações ao admin sobre incidentes em conexões Meta de
 * tenants (token expirado, qualidade RED, conta banida, etc).
 *
 * Características:
 *   - Notifica TODOS os admins (role='admin') do sistema, não só o tenant afetado.
 *   - Debounce: o mesmo incidente para o mesmo tenant não é re-notificado em
 *     menos de 6 horas (evita spam de pushes idênticos).
 *   - Fire-and-forget: erros nunca propagam.
 */

export type MetaIncidentKind =
  | 'token_invalid'
  | 'token_expired'
  | 'quality_red'
  | 'quality_yellow'
  | 'phone_banned'
  | 'webhook_signature_invalid'
  | 'template_paused'
  | 'template_disabled'
  | 'template_rejected'
  | 'template_quality_red'
  | 'template_quality_yellow';

const DEBOUNCE_MS = 6 * 60 * 60 * 1000;
const recentNotifications = new Map<string, number>();

export async function notifyAdminOfMetaIncident(params: {
  tenantUserId: string;
  tenantEmail?: string;
  kind: MetaIncidentKind;
  detail?: string;
}): Promise<void> {
  const dedupKey = `${params.tenantUserId}:${params.kind}`;
  const last = recentNotifications.get(dedupKey);
  if (last && Date.now() - last < DEBOUNCE_MS) {
    return; // notificado há menos de 6h, pula
  }
  recentNotifications.set(dedupKey, Date.now());

  try {
    const { data: admins } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('role', 'admin')
      .limit(20);

    if (!admins || admins.length === 0) return;

    const title = titleFor(params.kind);
    const tenantLabel = params.tenantEmail || params.tenantUserId.slice(0, 8);
    const body = `Cliente ${tenantLabel}${params.detail ? ' — ' + params.detail : ''}`;

    await Promise.all(admins.map(a =>
      PushNotificationService.sendPushNotification(a.id, title, body, '/admin').catch(() => {})
    ));

    console.log(`[MetaIncidentNotifier] ${params.kind} for ${tenantLabel} → ${admins.length} admin(s) notified`);
  } catch (err: any) {
    console.warn('[MetaIncidentNotifier] Failed to notify admins:', err.message || err);
  }
}

function titleFor(kind: MetaIncidentKind): string {
  switch (kind) {
    case 'token_invalid': return 'Meta: token inválido';
    case 'token_expired': return 'Meta: token expirado';
    case 'quality_red':   return 'Meta: qualidade RED ⚠️';
    case 'quality_yellow':return 'Meta: qualidade YELLOW';
    case 'phone_banned':  return 'Meta: número banido ⛔';
    case 'webhook_signature_invalid': return 'Meta: assinatura webhook inválida';
    case 'template_paused':       return 'Meta: template pausado ⏸️';
    case 'template_disabled':     return 'Meta: template desativado ⛔';
    case 'template_rejected':     return 'Meta: template rejeitado ❌';
    case 'template_quality_red':  return 'Meta: template em RED ⚠️';
    case 'template_quality_yellow':return 'Meta: template em YELLOW';
    default:              return 'Meta: incidente';
  }
}
