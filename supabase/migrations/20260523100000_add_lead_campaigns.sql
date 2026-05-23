-- Tabela de campanhas do Radar de Leads
CREATE TABLE IF NOT EXISTS lead_campaigns (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL,
  name        TEXT        NOT NULL,
  niche       TEXT,
  city        TEXT,
  context     TEXT,
  leads_count INTEGER     DEFAULT 0,
  status      TEXT        DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lead_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_campaigns_admin" ON lead_campaigns;
CREATE POLICY "lead_campaigns_admin" ON lead_campaigns
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Vincula leads existentes e novos a campanhas
ALTER TABLE leads_radar
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES lead_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_radar_campaign_id_idx ON leads_radar(campaign_id);

-- Trigger para manter leads_count atualizado automaticamente
CREATE OR REPLACE FUNCTION update_campaign_leads_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.campaign_id IS NOT NULL THEN
    UPDATE lead_campaigns SET leads_count = leads_count + 1, updated_at = NOW()
    WHERE id = NEW.campaign_id;
  ELSIF TG_OP = 'DELETE' AND OLD.campaign_id IS NOT NULL THEN
    UPDATE lead_campaigns SET leads_count = GREATEST(leads_count - 1, 0), updated_at = NOW()
    WHERE id = OLD.campaign_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.campaign_id IS DISTINCT FROM NEW.campaign_id THEN
      IF OLD.campaign_id IS NOT NULL THEN
        UPDATE lead_campaigns SET leads_count = GREATEST(leads_count - 1, 0), updated_at = NOW()
        WHERE id = OLD.campaign_id;
      END IF;
      IF NEW.campaign_id IS NOT NULL THEN
        UPDATE lead_campaigns SET leads_count = leads_count + 1, updated_at = NOW()
        WHERE id = NEW.campaign_id;
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaign_leads_count ON leads_radar;
CREATE TRIGGER trg_campaign_leads_count
  AFTER INSERT OR UPDATE OR DELETE ON leads_radar
  FOR EACH ROW EXECUTE FUNCTION update_campaign_leads_count();
