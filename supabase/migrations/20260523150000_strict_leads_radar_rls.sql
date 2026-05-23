-- Torna as políticas de RLS estritas, permitindo acesso apenas ao criador (mesmo se for admin)
DROP POLICY IF EXISTS "Users and admins can manage campaigns" ON lead_campaigns;
DROP POLICY IF EXISTS "lead_campaigns_admin" ON lead_campaigns;

CREATE POLICY "Users can manage their own campaigns" ON lead_campaigns
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users and admins can manage leads" ON leads_radar;
DROP POLICY IF EXISTS "Apenas administradores podem gerenciar leads_radar" ON leads_radar;

CREATE POLICY "Users can manage leads in their own campaigns" ON leads_radar
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lead_campaigns
      WHERE lead_campaigns.id = leads_radar.campaign_id
      AND lead_campaigns.user_id = auth.uid()
    )
  );
