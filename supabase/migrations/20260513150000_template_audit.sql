-- Auditoria de envios de template Meta Cloud API.
--
-- Cada vez que sendTemplate é chamado (com sucesso ou falha) registramos:
--   - quem enviou (user_id), qual template, idioma, destinatário
--   - as variáveis MASCARADAS (primeiros 30 + últimos 30 chars) — LGPD-safe
--   - hash SHA256 das variáveis originais (detecta reincidência sem expor conteúdo)
--   - warnings detectadas pelo templateValidator (URL encurtado, all-caps, etc)
--   - status final + mensagem de erro se houver
--
-- Quando a Meta banir/pausar um template, esse log permite identificar
-- exatamente que conteúdo foi injetado nas variáveis antes do incidente.

CREATE TABLE IF NOT EXISTS template_send_log (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_name    TEXT NOT NULL,
  language_code    TEXT NOT NULL,
  to_phone         TEXT NOT NULL,
  variables_masked JSONB,
  variables_hash   TEXT,
  warnings         JSONB,
  status           TEXT NOT NULL,          -- 'sent' | 'failed' | 'blocked_local'
  meta_message_id  TEXT,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS template_send_log_user_idx
  ON template_send_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS template_send_log_template_idx
  ON template_send_log (template_name, created_at DESC);
CREATE INDEX IF NOT EXISTS template_send_log_hash_idx
  ON template_send_log (variables_hash);

ALTER TABLE template_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_send_log_owner_read ON template_send_log;
CREATE POLICY template_send_log_owner_read
  ON template_send_log
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
