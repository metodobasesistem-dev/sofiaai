ALTER TABLE leo_config
ADD COLUMN IF NOT EXISTS instagram_username TEXT,
ADD COLUMN IF NOT EXISTS instagram_name TEXT,
ADD COLUMN IF NOT EXISTS instagram_picture_url TEXT,
ADD COLUMN IF NOT EXISTS instagram_token_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS instagram_state_token TEXT;
