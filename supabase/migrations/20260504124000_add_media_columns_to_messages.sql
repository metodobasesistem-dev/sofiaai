-- Add new columns to messages table for rich media and sync support
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_mime_type TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_filename TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false; -- To identify messages sent from phone

-- Update existing messages to have 'text' as type
UPDATE messages SET message_type = 'text' WHERE message_type IS NULL;
