-- Add is_starred column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT false;

-- Create index for faster filtering of starred messages
CREATE INDEX IF NOT EXISTS idx_messages_is_starred ON messages(is_starred) WHERE is_starred = true;
