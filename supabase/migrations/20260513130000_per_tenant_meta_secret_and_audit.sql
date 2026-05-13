-- Per-tenant Meta App Secret + provider audit log.
--
-- meta_app_secret: opcional. Quando preenchido, o webhook valida o HMAC contra
-- esse secret específico do tenant. Quando NULL, cai no fallback global
-- WHATSAPP_APP_SECRET (modo "uma app Meta para todos").
--
-- provider_audit_log: trilha quem trocou o provider de qual tenant, quando e
-- com quais valores (mascarados — nunca armazena tokens completos).

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS meta_app_secret TEXT;

CREATE TABLE IF NOT EXISTS provider_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  target_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,           -- e.g. provider_changed, meta_credentials_saved, meta_disconnected
  details      JSONB,                   -- redacted payload (no raw tokens)
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS provider_audit_log_target_idx
  ON provider_audit_log (target_user_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS provider_audit_log_action_idx
  ON provider_audit_log (action, performed_at DESC);

-- RLS: admin lê tudo, usuário comum lê apenas o próprio histórico.
ALTER TABLE provider_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_audit_log_admin_read ON provider_audit_log;
CREATE POLICY provider_audit_log_admin_read
  ON provider_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
    OR target_user_id = auth.uid()
  );
