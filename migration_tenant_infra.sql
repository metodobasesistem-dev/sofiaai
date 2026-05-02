-- MIGRATION: Tenant-Level WhatsApp Infrastructure
-- This migration adds infrastructure settings to the profiles (tenant) table
-- and sets up RLS for secure secrets.

-- 1. Update profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS whatsapp_provider VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS whatsapp_provider_config JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT DEFAULT NULL;

-- 2. Create tenant_secrets table (for sensitive keys like Meta Access Token)
-- We use a separate table to keep secrets away from the main profile data in logs/dumps.
CREATE TABLE IF NOT EXISTS tenant_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    secret_key TEXT NOT NULL,
    secret_value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, secret_key)
);

-- 3. Security (RLS)
ALTER TABLE tenant_secrets ENABLE ROW LEVEL SECURITY;

-- Only admins and the owner (if allowed) can access secrets.
-- For tenant-level infrastructure, usually only the tenant themselves or a superadmin.
CREATE POLICY "Users can manage their own tenant secrets" 
ON tenant_secrets FOR ALL TO authenticated 
USING (auth.uid() = tenant_id)
WITH CHECK (auth.uid() = tenant_id);

-- 4. Automation for updated_at
DROP TRIGGER IF EXISTS update_tenant_secrets_updated_at ON tenant_secrets;
CREATE TRIGGER update_tenant_secrets_updated_at
    BEFORE UPDATE ON tenant_secrets FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
