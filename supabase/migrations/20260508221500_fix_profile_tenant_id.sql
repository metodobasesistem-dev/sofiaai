-- Migration: Add tenant_id to profiles to support multi-user tenant architecture
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'profiles' AND COLUMN_NAME = 'tenant_id') THEN
        ALTER TABLE public.profiles ADD COLUMN tenant_id UUID;
        -- Default existing profiles to use their own ID as tenant_id
        UPDATE public.profiles SET tenant_id = id;
    END IF;
END $$;

-- Update Sofia policies to be more direct if needed, but the column fix will solve the current error
-- Re-applying Sofia policies to ensure they work with the new column
DROP POLICY IF EXISTS "Users can view their tenant's sofia_memory" ON sofia_memory;
CREATE POLICY "Users can view their tenant's sofia_memory" 
ON sofia_memory FOR SELECT 
USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their tenant's sofia_memory" ON sofia_memory;
CREATE POLICY "Users can manage their tenant's sofia_memory" 
ON sofia_memory FOR ALL
USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can view their tenant's sofia_messages" ON sofia_messages;
CREATE POLICY "Users can view their tenant's sofia_messages" 
ON sofia_messages FOR SELECT 
USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can create sofia_messages for their tenant" ON sofia_messages;
CREATE POLICY "Users can create sofia_messages for their tenant" 
ON sofia_messages FOR INSERT 
WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
