-- Migration: Add message templates table
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'MARKETING',
  language TEXT DEFAULT 'pt_BR',
  variables_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add RLS
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own templates"
  ON message_templates
  FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM profiles WHERE tenant_id = message_templates.tenant_id
  ));
