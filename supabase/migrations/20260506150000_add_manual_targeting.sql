-- Migration: Add manual and upload targeting to campaigns
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS manual_list TEXT,
ADD COLUMN IF NOT EXISTS uploaded_contacts JSONB;
