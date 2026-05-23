-- Atualiza as políticas RLS para lead_campaigns
DROP POLICY IF EXISTS "lead_campaigns_admin" ON lead_campaigns;

CREATE POLICY "Users and admins can manage campaigns" ON lead_campaigns
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    user_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Atualiza as políticas RLS para leads_radar
DROP POLICY IF EXISTS "Apenas administradores podem gerenciar leads_radar" ON leads_radar;

CREATE POLICY "Users and admins can manage leads" ON leads_radar
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lead_campaigns
      WHERE lead_campaigns.id = leads_radar.campaign_id
      AND lead_campaigns.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
