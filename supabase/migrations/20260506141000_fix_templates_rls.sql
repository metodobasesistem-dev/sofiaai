-- Migration: Fix message templates RLS and add tenant check
DROP POLICY IF EXISTS "Users can manage their own templates" ON message_templates;

-- Policy for ALL (Select, Insert, Update, Delete)
CREATE POLICY "Users can manage their own templates"
  ON message_templates
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Also allow insert if tenant_id matches profile
-- This ensures that the user can only insert records for their own tenant
