-- Add contact_jid column to messages table to support "click to chat" from shared contacts
ALTER TABLE messages ADD COLUMN IF NOT EXISTS contact_jid TEXT;
