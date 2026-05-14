-- Phase 5.1.C: Template Quality History
-- Captures periodic snapshots of template quality_score for trend display.

CREATE TABLE IF NOT EXISTS template_quality_history (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_name   TEXT        NOT NULL,
  language_code   TEXT        NOT NULL DEFAULT 'pt_BR',
  -- quality_score from Meta Graph API: GREEN | YELLOW | RED | UNKNOWN
  quality_score   TEXT        NOT NULL,
  -- template status at snapshot time
  status          TEXT,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tqh_user_template
  ON template_quality_history (user_id, template_name, language_code, recorded_at DESC);

-- RLS: tenants only see their own rows
ALTER TABLE template_quality_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_own_quality_history"
  ON template_quality_history
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role bypasses RLS (backend workers)
CREATE POLICY "service_role_quality_history"
  ON template_quality_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
