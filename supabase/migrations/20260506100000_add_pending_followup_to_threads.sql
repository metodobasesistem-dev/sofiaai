-- Migration: Add pending_followup to threads
-- Description: Stores metadata about manually scheduled follow-ups by humans.

ALTER TABLE threads ADD COLUMN IF NOT EXISTS pending_followup JSONB DEFAULT NULL;

COMMENT ON COLUMN threads.pending_followup IS 'Stores { message, scheduled_at, type, metadata } for manual human-initiated follow-ups.';
