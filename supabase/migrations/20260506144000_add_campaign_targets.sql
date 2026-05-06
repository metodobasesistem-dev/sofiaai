-- Migration: Add targeting and variable mapping columns to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS target_type TEXT DEFAULT 'all',
ADD COLUMN IF NOT EXISTS selected_labels TEXT,
ADD COLUMN IF NOT EXISTS selected_funnel_status TEXT,
ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '{}'::jsonb;
