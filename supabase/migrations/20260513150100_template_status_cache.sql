-- Cache local do status de cada template (por tenant).
-- A fonte da verdade ainda é a Graph API da Meta — esse cache é alimentado
-- pelo webhook message_template_status_update e usado para:
--   1. Consultas rápidas (não precisar pingar Graph API a cada request da UI)
--   2. Histórico (combinado com template_quality_history na sub-fase C)
--   3. Sugestão de alternativa quando um template é pausado pela Meta

CREATE TABLE IF NOT EXISTS template_status_cache (
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_name  TEXT NOT NULL,
  language_code  TEXT NOT NULL,
  status         TEXT NOT NULL,           -- APPROVED|PENDING|REJECTED|PAUSED|DISABLED|FLAGGED
  category       TEXT,                    -- UTILITY|MARKETING|AUTHENTICATION
  quality_score  TEXT,                    -- GREEN|YELLOW|RED|UNKNOWN
  reason         TEXT,                    -- motivo de REJECTED, se houver
  last_event     TEXT,                    -- último evento recebido (APPROVED|PAUSED|...)
  last_event_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, template_name, language_code)
);

CREATE INDEX IF NOT EXISTS template_status_cache_status_idx
  ON template_status_cache (user_id, status);

ALTER TABLE template_status_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_status_cache_owner_read ON template_status_cache;
CREATE POLICY template_status_cache_owner_read
  ON template_status_cache
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
