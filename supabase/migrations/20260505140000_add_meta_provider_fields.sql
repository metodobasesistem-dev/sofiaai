-- Migration for Meta Official API fields
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS whatsapp_provider TEXT DEFAULT 'evolution',
ADD COLUMN IF NOT EXISTS meta_access_token TEXT,
ADD COLUMN IF NOT EXISTS meta_phone_id TEXT,
ADD COLUMN IF NOT EXISTS meta_waba_id TEXT;
