-- Migration: Align Campaigns and Templates with the actual Profile ID structure
DROP POLICY IF EXISTS "Users can manage their own templates" ON message_templates;
DROP POLICY IF EXISTS "Users can manage their own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can manage their own campaign logs" ON campaign_logs;

-- Templates: Scope by auth.uid()
CREATE POLICY "Users can manage their own templates"
  ON message_templates
  FOR ALL
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Campaigns: Scope by auth.uid()
CREATE POLICY "Users can manage their own campaigns"
  ON campaigns
  FOR ALL
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Logs: Scope through campaigns
CREATE POLICY "Users can manage their own campaign logs"
  ON campaign_logs
  FOR ALL
  USING (campaign_id IN (SELECT id FROM campaigns WHERE tenant_id = auth.uid()));
