-- Update global_settings to include apify_api_token
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS apify_api_token TEXT;

-- Update leads_radar to include new data fields from Apify and Scoring
ALTER TABLE leads_radar ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE leads_radar ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE leads_radar ADD COLUMN IF NOT EXISTS pain_score INTEGER DEFAULT 0;
ALTER TABLE leads_radar ADD COLUMN IF NOT EXISTS opportunity_score INTEGER DEFAULT 0;
ALTER TABLE leads_radar ADD COLUMN IF NOT EXISTS personalized_message TEXT;
