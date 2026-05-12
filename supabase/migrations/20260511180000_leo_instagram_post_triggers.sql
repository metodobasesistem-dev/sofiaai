ALTER TABLE leo_insta_gatilhos ADD COLUMN IF NOT EXISTS post_id TEXT;
ALTER TABLE leo_insta_gatilhos ADD COLUMN IF NOT EXISTS post_url TEXT;

CREATE INDEX IF NOT EXISTS idx_leo_insta_gatilhos_post_id ON leo_insta_gatilhos(post_id);
