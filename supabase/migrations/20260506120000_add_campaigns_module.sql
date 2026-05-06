-- Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID, -- Removida referência direta para evitar erro de tabela inexistente
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_id TEXT,
  status TEXT DEFAULT 'pending', -- pending, sending, completed, failed
  total_contacts INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create campaign logs for tracking individual deliveries
CREATE TABLE IF NOT EXISTS campaign_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id),
  status TEXT NOT NULL, -- success, failed
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign ON campaign_logs(campaign_id);

-- Enable RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_logs ENABLE ROW LEVEL SECURITY;

-- Create policies (Basic tenant isolation)
CREATE POLICY "Users can view their tenant's campaigns" 
ON campaigns FOR SELECT 
USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create campaigns for their tenant" 
ON campaigns FOR INSERT 
WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view their tenant's campaign logs" 
ON campaign_logs FOR SELECT 
USING (campaign_id IN (SELECT id FROM campaigns WHERE tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())));
