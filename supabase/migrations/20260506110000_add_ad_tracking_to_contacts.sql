-- Migration: Add ad_tracking to contacts
-- Description: Stores metadata about the lead source (Meta Ads, UTMs, Referral data)

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_tracking JSONB DEFAULT NULL;

COMMENT ON COLUMN contacts.ad_tracking IS 'Stores information about lead origin like campaign_id, ad_id, source, and medium.';
