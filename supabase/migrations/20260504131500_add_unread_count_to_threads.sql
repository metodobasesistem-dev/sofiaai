-- Add unread_count column to threads table
ALTER TABLE threads ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;
