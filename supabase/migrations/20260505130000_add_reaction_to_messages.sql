-- Migration to add reaction support to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reaction TEXT;
